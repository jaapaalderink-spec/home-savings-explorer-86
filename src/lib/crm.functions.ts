import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";
import { LEAD_STATUSES, checkStatusTransition, type LeadStatus } from "@/lib/lead-status-policy";
import { LOST_REASONS, overallStatus } from "@/lib/crm-policy";

async function companyOf(userId: string) {
  const db = await adminDb();
  const { data } = await db.from("profiles").select("company_id").eq("id", userId).maybeSingle();
  if (!data?.company_id) throw new Error("Geen bedrijf gekoppeld.");
  return { db, companyId: data.company_id as string };
}

async function ownPurchase(userId: string, purchaseId: string) {
  const { db, companyId } = await companyOf(userId);
  const { data } = await db
    .from("lead_purchases")
    .select("id, status, products, lead:leads(categories)")
    .eq("id", purchaseId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data) throw new Error("Lead niet gevonden.");
  return { db, companyId, purchase: data };
}

/** Na een productwijziging de totaalstatus van de toewijzing bijwerken (als de overgang geldig is). */
async function syncOverall(
  db: Awaited<ReturnType<typeof adminDb>>,
  purchase: { id: string; status: string; products: string[] | null; lead: unknown },
  companyId: string,
  actor: string,
) {
  const { loadProductCrm } = await import("@/lib/crm.server");
  const list = (await loadProductCrm(db, [purchase])).get(purchase.id) ?? [];
  const next = overallStatus(list.map((l) => l.status));
  if (next !== purchase.status && checkStatusTransition(purchase.status as LeadStatus, next).ok) {
    await db.rpc("set_purchase_status", {
      p_purchase_id: purchase.id,
      p_company_id: companyId,
      p_status: next,
      p_actor: actor,
      p_source: "partner",
    });
  }
}

export const getPurchaseCrm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ purchaseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, purchase } = await ownPurchase(context.userId, data.purchaseId);
    const { loadProductCrm } = await import("@/lib/crm.server");
    return (await loadProductCrm(db, [purchase])).get(purchase.id) ?? [];
  });

export const saveProductCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        purchaseId: z.string().uuid(),
        category: z.string().min(1).max(40),
        status: z.enum(LEAD_STATUSES),
        followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        lostReason: z.enum(Object.keys(LOST_REASONS) as [keyof typeof LOST_REASONS]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, companyId, purchase } = await ownPurchase(context.userId, data.purchaseId);
    const { loadProductCrm, purchaseProducts } = await import("@/lib/crm.server");
    if (!purchaseProducts(purchase).includes(data.category)) throw new Error("Product hoort niet bij deze aanvraag.");
    if (data.status === "lost" && !data.lostReason) throw new Error("Kies een reden van verlies.");

    const current = (await loadProductCrm(db, [purchase])).get(purchase.id)?.find((r) => r.category === data.category);
    const from = current?.status ?? (purchase.status as LeadStatus);
    if (from !== data.status) {
      const check = checkStatusTransition(from, data.status);
      if (!check.ok) throw new Error(check.reason);
    }

    const { error } = await db.from("purchase_product_crm").upsert(
      {
        purchase_id: purchase.id,
        company_id: companyId,
        category: data.category,
        status: data.status,
        follow_up_date: data.status === "won" || data.status === "lost" ? null : (data.followUpDate ?? null),
        lost_reason: data.status === "lost" ? data.lostReason : null,
        updated_by: context.userId,
      },
      { onConflict: "purchase_id,category" },
    );
    if (error) throw new Error("Opslaan is mislukt.");

    if (from !== data.status) {
      await db.rpc("log_audit_event_api", {
        p_event: "PRODUCT_STATUS_CHANGED",
        p_entity: "lead_purchase",
        p_entity_id: purchase.id,
        p_company: companyId,
        p_actor: context.userId,
        p_source: "partner",
        p_metadata: { category: data.category, from, to: data.status, lost_reason: data.lostReason ?? null },
      });
    }
    await syncOverall(db, purchase, companyId, context.userId);
    return { ok: true };
  });

export const addQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        purchaseId: z.string().uuid(),
        category: z.string().min(1).max(40),
        amount: z.number().min(0).max(1_000_000),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, companyId, purchase } = await ownPurchase(context.userId, data.purchaseId);
    const { loadProductCrm, purchaseProducts } = await import("@/lib/crm.server");
    if (!purchaseProducts(purchase).includes(data.category)) throw new Error("Product hoort niet bij deze aanvraag.");
    const row = (await loadProductCrm(db, [purchase])).get(purchase.id)?.find((r) => r.category === data.category);
    if (row && (row.status === "won" || row.status === "lost")) throw new Error("Dit product is al afgerond.");
    const version = (row?.quotes[0]?.version ?? 0) + 1;

    const { error } = await db.from("purchase_quotes").insert({
      purchase_id: purchase.id,
      company_id: companyId,
      category: data.category,
      version,
      amount_ex_vat: Math.round(data.amount * 100) / 100,
      note: data.note || null,
      created_by: context.userId,
    });
    if (error) throw new Error("Offerte opslaan is mislukt.");

    if (row && row.status !== "quoted") {
      await db.from("purchase_product_crm").upsert(
        { purchase_id: purchase.id, company_id: companyId, category: data.category, status: "quoted", updated_by: context.userId },
        { onConflict: "purchase_id,category" },
      );
    }
    await db.rpc("log_audit_event_api", {
      p_event: "QUOTE_ADDED",
      p_entity: "lead_purchase",
      p_entity_id: purchase.id,
      p_company: companyId,
      p_actor: context.userId,
      p_source: "partner",
      p_metadata: { category: data.category, version, amount_ex_vat: data.amount },
    });
    await syncOverall(db, purchase, companyId, context.userId);
    return { ok: true, version };
  });

export const getCrmStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(7).max(365), category: z.string().max(40).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, companyId } = await companyOf(context.userId);
    const { companyCrmStats } = await import("@/lib/crm.server");
    return companyCrmStats(db, companyId, data.days, data.category);
  });

/** Alleen-lezen voorbeeldweergave van een bedrijf voor platformbeheer; elke opening wordt gelogd. */
export const adminPreviewCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid(), days: z.number().int().min(7).max(365) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Alleen platformbeheerders.");
    const db = await adminDb();
    const { data: company } = await db.from("companies").select("id, name, active").eq("id", data.companyId).maybeSingle();
    if (!company) throw new Error("Bedrijf niet gevonden.");

    await db.rpc("log_audit_event_api", {
      p_event: "ADMIN_PREVIEW_OPENED",
      p_entity: "company",
      p_entity_id: company.id,
      p_company: company.id,
      p_actor: context.userId,
      p_source: "admin",
      p_metadata: { days: data.days },
    });

    const { loadProductCrm, companyCrmStats } = await import("@/lib/crm.server");
    const { data: purchases } = await db
      .from("lead_purchases")
      .select("id, status, created_at, products, lead:leads(first_name, last_name, city, postcode, categories)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const crm = await loadProductCrm(db, purchases ?? []);
    const stats = await companyCrmStats(db, company.id, data.days);
    return {
      company,
      stats,
      leads: (purchases ?? []).map((p) => {
        const lead = (p.lead ?? {}) as { first_name?: string; last_name?: string; city?: string; postcode?: string };
        return {
          id: p.id,
          createdAt: p.created_at,
          status: p.status,
          name: `${lead.first_name ?? ""} ${(lead.last_name ?? "").slice(0, 1)}.`.trim(),
          place: lead.city ?? lead.postcode ?? "",
          products: crm.get(p.id) ?? [],
        };
      }),
    };
  });
