import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminRole } from "@/lib/admin-guard";
import { adminDb } from "@/lib/partner-util";
import { customPricesSchema } from "@/lib/contracts.functions";
import { nextMonthStart } from "@/lib/team-policy";

async function assertAdmin(userId: string, claims: { aal?: unknown }) {
  const db = await adminDb();
  const { data: isAdmin } = await adminRole(db, userId, claims);
  if (!isAdmin) throw new Error("Alleen platformbeheerders.");
  return db;
}

const currentMonthStart = () => {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
  return `${s.slice(0, 7)}-01`;
};

/** Aanmeldingen, actieve en gesloten partners met eigenaarcontact. */
export const listPartnerAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { data: companies } = await db
      .from("companies")
      .select("id, name, categories, created_at, active, approval_status, approved_at, closed_at, closed_reason, contact_email, contact_phone, website")
      .order("created_at", { ascending: false })
      .limit(300);
    const ids = (companies ?? []).map((c) => c.id);
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("id, email, full_name, phone, company_id, created_at").in("company_id", ids)
      : { data: [] };
    const { data: owners } = await db.from("user_roles").select("user_id").eq("role", "owner");
    const ownerSet = new Set((owners ?? []).map((o) => o.user_id));
    return {
      currentMonth: currentMonthStart(),
      nextMonth: nextMonthStart(),
      companies: (companies ?? []).map((c) => {
        const members = (profiles ?? []).filter((p) => p.company_id === c.id);
        const owner = members.find((m) => ownerSet.has(m.id)) ?? members[0] ?? null;
        return { ...c, owner: owner ? { name: owner.full_name, email: owner.email, phone: owner.phone } : null };
      }),
    };
  });

export const approvePartner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        validFrom: z.string().regex(/^\d{4}-\d{2}-01$/),
        packageCode: z.enum(["start", "groei", "team"]),
        billingMode: z.enum(["actual_delivered", "fixed_package"]),
        paidSeats: z.number().int().min(0).max(500),
        note: z.string().trim().max(300).optional(),
        customPrices: customPricesSchema.optional(),
        reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        reviewNote: z.string().trim().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    if (data.validFrom < currentMonthStart()) throw new Error("De ingangsdatum mag niet in het verleden liggen.");
    const { data: company } = await db.from("companies").select("approval_status").eq("id", data.companyId).single();
    if (company?.approval_status !== "pending") throw new Error("Dit bedrijf wacht niet op goedkeuring.");
    const { insertContractVersion } = await import("@/lib/contract-version.server");
    await insertContractVersion(db, { ...data, leadQuotaPerMonth: 0 }, context.userId);
    const { error } = await db
      .from("companies")
      .update({ active: true, approval_status: "approved", approved_at: new Date().toISOString(), approved_by: context.userId })
      .eq("id", data.companyId);
    if (error) throw new Error("Goedkeuren is mislukt.");
    await db.rpc("log_audit_event_api", {
      p_event: "COMPANY_ACTIVATED", p_entity: "company", p_entity_id: data.companyId,
      p_company: data.companyId, p_actor: context.userId, p_source: "admin", p_metadata: { approved: true },
    } as never);
    return { ok: true };
  });

export const setPartnerClosed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ companyId: z.string().uuid(), close: z.boolean(), reason: z.string().trim().max(300).optional() })
      .refine((v) => !v.close || (v.reason && v.reason.length >= 3), "Geef een reden voor het sluiten op.")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const patch = data.close
      ? { active: false, approval_status: "closed", closed_at: new Date().toISOString(), closed_by: context.userId, closed_reason: data.reason! }
      : { active: true, approval_status: "approved", closed_at: null, closed_by: null, closed_reason: null };
    const { error } = await db.from("companies").update(patch).eq("id", data.companyId);
    if (error) throw new Error("Wijzigen is mislukt.");
    await db.rpc("log_audit_event_api", {
      p_event: data.close ? "COMPANY_DEACTIVATED" : "COMPANY_ACTIVATED", p_entity: "company",
      p_entity_id: data.companyId, p_company: data.companyId, p_actor: context.userId, p_source: "admin",
      p_metadata: { reason: data.reason ?? null },
    } as never);
    return { ok: true };
  });

export const listPriceReviews = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { data } = await db
      .from("price_reviews")
      .select("id, company_id, review_date, note, status, outcome, completed_at, companies(name), subscription_versions(platform_fee_ex_vat, seat_fee_ex_vat, base_lead_price_ex_vat, extra_product_price_ex_vat, package_code)")
      .order("status", { ascending: false })
      .order("review_date", { ascending: true })
      .limit(200);
    return data ?? [];
  });

export const completePriceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), outcome: z.string().trim().max(300).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { error } = await db
      .from("price_reviews")
      .update({ status: "done", outcome: data.outcome ?? null, completed_by: context.userId, completed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "open");
    if (error) throw new Error("Afronden is mislukt.");
    return { ok: true };
  });
