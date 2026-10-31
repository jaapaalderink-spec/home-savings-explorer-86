import { adminRole } from "@/lib/admin-guard";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";
import { nextMonthStart } from "@/lib/team-policy";
import { CONTRACT_DEFAULTS } from "@/lib/contract-policy";
import { MIN_TERM_MONTHS, NOTICE_MONTHS, PACKAGES, PACKAGE_EXTRA_PRODUCT_PRICE, PACKAGE_LEAD_PRICE, PACKAGE_PLATFORM_FEE, SEAT_FEE, packageFee } from "@/lib/package-policy";

async function assertAdmin(userId: string, claims: { aal?: unknown }) {
  const db = await adminDb();
  const { data: isAdmin } = await adminRole(db, userId, claims);
  if (!isAdmin) throw new Error("Alleen platformbeheerders.");
  return db;
}

export const searchCompanies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    let q = db.from("companies").select("id, name, plan_name, active").order("name").limit(20);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows } = await q;
    return rows ?? [];
  });

export const getCompanyContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const [{ data: company }, { data: versions }, { data: members }] = await Promise.all([
      db
        .from("companies")
        .select("id, name, plan_name, monthly_lead_limit, monthly_fee_ex_vat")
        .eq("id", data.companyId)
        .single(),
      db
        .from("subscription_versions")
        .select("*")
        .eq("company_id", data.companyId)
        .order("valid_from", { ascending: false }),
      db.from("profiles").select("id").eq("company_id", data.companyId),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const active = (versions ?? []).find((v) => v.valid_from <= today) ?? null;
    return {
      company,
      versions: versions ?? [],
      activeId: active?.id ?? null,
      memberCount: (members ?? []).length,
      earliestStart: nextMonthStart(),
    };
  });

export const createContractVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        validFrom: z.string().regex(/^\d{4}-\d{2}-01$/),
        leadQuotaPerMonth: z.number().int().min(0).max(10000),
        paidSeats: z.number().int().min(0).max(500),
        note: z.string().trim().max(300).optional(),
        packageCode: z.enum(["start", "groei", "team"]).optional(),
        billingMode: z.enum(["actual_delivered", "fixed_package"]).default("actual_delivered"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    if (data.validFrom < nextMonthStart())
      throw new Error("Een wijziging gaat op zijn vroegst in op de eerste van volgende maand.");
    const { data: last } = await db
      .from("subscription_versions")
      .select("version")
      .eq("company_id", data.companyId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data.billingMode === "fixed_package" && !data.packageCode)
      throw new Error("Kies een pakket om op vast pakketbedrag te factureren.");
    const pkg = data.packageCode ? PACKAGES[data.packageCode] : null;
    const { error } = await db.from("subscription_versions").insert({
      company_id: data.companyId,
      version: (last?.version ?? 0) + 1,
      valid_from: data.validFrom,
      lead_quota_per_month: pkg ? pkg.leads : data.leadQuotaPerMonth,
      paid_seats: data.paidSeats,
      platform_fee_ex_vat: pkg ? PACKAGE_PLATFORM_FEE : CONTRACT_DEFAULTS.platformFee,
      seat_fee_ex_vat: pkg ? SEAT_FEE : CONTRACT_DEFAULTS.seatFee,
      base_lead_price_ex_vat: pkg ? PACKAGE_LEAD_PRICE : CONTRACT_DEFAULTS.baseLeadPrice,
      extra_product_price_ex_vat: pkg ? PACKAGE_EXTRA_PRODUCT_PRICE : CONTRACT_DEFAULTS.extraProductPrice,
      package_code: data.packageCode ?? null,
      billing_mode: pkg ? data.billingMode : "actual_delivered",
      package_fee_ex_vat: data.packageCode ? packageFee(data.packageCode) : null,
      included_seats: pkg?.includedSeats ?? 0,
      min_term_months: pkg ? MIN_TERM_MONTHS : 0,
      notice_months: NOTICE_MONTHS,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) {
      if (error.code === "23505")
        throw new Error("Er bestaat al een contractversie met die ingangsdatum.");
      throw new Error("Contractversie opslaan is mislukt.");
    }
    await db.rpc("log_audit_event_api", {
      p_event: "COMPANY_COMMERCIAL_SETTINGS_UPDATED",
      p_entity: "company",
      p_entity_id: data.companyId,
      p_company: data.companyId,
      p_actor: context.userId,
      p_source: "admin",
      p_metadata: { subscription_version: data },
    } as never);
    return { ok: true };
  });

/* ----------------------------- Wachtrij en handmatig ----------------------------- */

export const getAllocationQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { data: leads } = await db
      .from("leads")
      .select(
        "id, created_at, postcode, city, categories, max_partners, purchase_count, fulfillment_status, retry_until, last_allocation_attempt_at",
      )
      .in("fulfillment_status", ["partial", "waiting", "undeliverable"])
      .order("created_at", { ascending: false })
      .limit(100);
    const { data: counts } = await db
      .from("leads")
      .select("fulfillment_status")
      .not("fulfillment_status", "is", null);
    const totals: Record<string, number> = {};
    (counts ?? []).forEach((r) => {
      const k = r.fulfillment_status as string;
      totals[k] = (totals[k] ?? 0) + 1;
    });
    return { leads: leads ?? [], totals };
  });

export const getEligibleForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const [{ data: rows }, { data: existing }] = await Promise.all([
      db.rpc("eligible_companies_for_lead", { p_lead: data.leadId }),
      db.from("lead_purchases").select("company_id").eq("lead_id", data.leadId),
    ]);
    const taken = new Set((existing ?? []).map((e) => e.company_id));
    const list = (
      (rows ?? []) as Array<{
        company_id: string;
        categories: string[];
        distance_km: number | null;
      }>
    ).filter((r) => !taken.has(r.company_id));
    const ids = list.map((r) => r.company_id);
    const { data: companies } = ids.length
      ? await db.from("companies").select("id, name, active").in("id", ids)
      : { data: [] as Array<{ id: string; name: string; active: boolean }> };
    return list
      .map((r) => ({
        companyId: r.company_id,
        name: companies?.find((c) => c.id === r.company_id)?.name ?? "Onbekend",
        active: companies?.find((c) => c.id === r.company_id)?.active ?? false,
        categories: r.categories,
        distanceKm: r.distance_km === null ? null : Number(r.distance_km),
      }))
      .filter((r) => r.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

/** Zoek actieve bedrijven op naam voor handmatige toewijzing, met werkgebied-indicatie. */
export const searchCompaniesForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leadId: z.string().uuid(), q: z.string().max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const term = data.q.trim().replace(/[%_,()]/g, "");
    let q = db.from("companies").select("id, name").eq("active", true).order("name").limit(10);
    if (term) q = q.ilike("name", `%${term}%`);
    const [{ data: companies }, { data: eligible }, { data: existing }, { data: lead }] =
      await Promise.all([
        q,
        db.rpc("eligible_companies_for_lead", { p_lead: data.leadId }),
        db.from("lead_purchases").select("company_id").eq("lead_id", data.leadId),
        db.from("leads").select("categories").eq("id", data.leadId).maybeSingle(),
      ]);
    const ids = (companies ?? []).map((c) => c.id);
    const { data: products } = ids.length
      ? await db.from("company_products").select("company_id, category").eq("active", true).in("company_id", ids)
      : { data: [] as Array<{ company_id: string; category: string }> };
    const leadCats = lead?.categories ?? [];
    const taken = new Set((existing ?? []).map((e) => e.company_id));
    const elig = (eligible ?? []) as Array<{ company_id: string; distance_km: number | null }>;
    return (companies ?? []).map((c) => {
      const e = elig.find((x) => x.company_id === c.id);
      const cats = (products ?? []).filter((p) => p.company_id === c.id).map((p) => p.category);
      return {
        companyId: c.id,
        name: c.name,
        categories: cats.filter((x) => leadCats.includes(x)),
        inArea: !!e,
        distanceKm: e?.distance_km == null ? null : Number(e.distance_km),
        alreadyAssigned: taken.has(c.id),
      };
    });
  });

const MANUAL_MESSAGES: Record<string, string> = {
  already_assigned: "Dit bedrijf heeft deze aanvraag al.",
  lead_full: "Deze aanvraag heeft al het maximum van 4 bedrijven (of het aantal gevraagde).",
  lead_not_verified: "Het telefoonnummer is nog niet bevestigd.",
  lead_blocked: "Deze aanvraag is geblokkeerd.",
  lead_duplicate: "Dit is een dubbele aanvraag.",
  lead_not_eligible: "Deze aanvraag is geannuleerd.",
  company_not_eligible: "Dit bedrijf voert geen van de gevraagde producten (of is niet actief).",
  company_capacity_full: "Het quotum of de capaciteit van dit bedrijf is bereikt.",
};

/** Handmatige toewijzing: exact dezelfde databasecontroles als de automatische verdeling. */
export const assignLeadManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        leadId: z.string().uuid(),
        companyId: z.string().uuid(),
        mode: z.enum(["standard", "free", "percent", "fixed"]).default("standard"),
        value: z.number().min(0).max(1000).optional(),
        note: z.string().max(200).optional(),
      })
      .refine((v) => v.mode !== "percent" || (v.value !== undefined && v.value > 0 && v.value <= 100), {
        message: "Vul een kortingspercentage tussen 1 en 100 in.",
      })
      .refine((v) => v.mode !== "fixed" || v.value !== undefined, {
        message: "Vul een vaste prijs in.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("allocate_lead_manual", {
      p_lead_id: data.leadId,
      p_company_id: data.companyId,
      p_actor: context.userId,
      p_mode: data.mode,
      p_value: (data.value ?? null) as unknown as number,
      p_note: (data.note ?? null) as unknown as string,
    });
    if (error) {
      console.error("allocate_lead_manual failed", error.message);
      if (error.message?.includes("LEAD_FULL")) throw new Error(MANUAL_MESSAGES["lead_full"]);
      throw new Error("Toewijzen is mislukt.");
    }
    const r = (Array.isArray(rows) ? rows[0] : rows) as
      | { result: string; price_ex_vat: number | null }
      | undefined;
    await db.rpc("update_lead_fulfillment", { p_lead: data.leadId });
    if (!r || r.result !== "allocated")
      throw new Error(MANUAL_MESSAGES[r?.result ?? ""] ?? "Toewijzen is mislukt.");
    // Koppelingsmail aan de particulier en leadmelding aan de installateur.
    const { sendLeadMatchedEmails } = await import("@/lib/lead-emails.server");
    await sendLeadMatchedEmails(data.leadId, [data.companyId]);
    return { ok: true, price: Number(r.price_ex_vat ?? 0) };
  });

export const runAllocationRetry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId, context.claims);
    const { retryPendingLeads } = await import("@/lib/allocation-queue.server");
    return retryPendingLeads();
  });
