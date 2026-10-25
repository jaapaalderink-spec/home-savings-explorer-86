import { adminRole } from "@/lib/admin-guard";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";
import { LEAD_STATUSES } from "@/lib/lead-status-policy";
import { LOST_REASONS } from "@/lib/crm-policy";

async function companyOf(userId: string) {
  const { partnerAccess } = await import("@/lib/partner-access.server");
  return partnerAccess(userId);
}

async function ownPurchase(userId: string, purchaseId: string) {
  const { accessiblePurchase } = await import("@/lib/partner-access.server");
  return accessiblePurchase(userId, purchaseId);
}

function mutationError(message: string): never {
  if (message.includes("REVISION_CONFLICT")) throw new Error("Dit product is intussen gewijzigd. Herlaad en probeer opnieuw.");
  if (message.includes("REOPEN_REASON_REQUIRED")) throw new Error("Geef een reden voor het herstellen van het afgesloten resultaat.");
  if (message.includes("WON_AMOUNT_REQUIRED")) throw new Error("Vul een geldig gewonnen bedrag excl. btw in.");
  if (message.includes("QUOTE_REQUIRED")) throw new Error("Leg eerst een geldige offertewaarde vast.");
  if (message.includes("REOPEN_FIRST")) throw new Error("Heropen het product voordat je een nieuwe offerte vastlegt.");
  throw new Error("Opslaan is mislukt of je hebt geen toegang.");
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
        revision: z.number().int().min(0),
        wonAmount: z.number().min(0).max(1_000_000).nullable().optional(),
        reopenReason: z.string().trim().max(500).optional(),
        followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        lostReason: z.enum(Object.keys(LOST_REASONS) as [keyof typeof LOST_REASONS]).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, purchase } = await ownPurchase(context.userId, data.purchaseId);
    const { purchaseProducts } = await import("@/lib/crm.server");
    if (!purchaseProducts(purchase).includes(data.category)) throw new Error("Product hoort niet bij deze aanvraag.");
    if (data.status === "lost" && !data.lostReason) throw new Error("Kies een reden van verlies.");

    const { error } = await db.rpc("commit_product_outcome", {
      p_id: purchase.id, p_actor: context.userId, p_category: data.category,
      p_revision: data.revision, p_status: data.status,
      ...(data.wonAmount != null ? { p_won: data.wonAmount } : {}),
      ...(data.reopenReason ? { p_reason: data.reopenReason } : {}),
      ...(data.lostReason ? { p_lost: data.lostReason } : {}),
      ...(data.followUpDate ? { p_follow: data.followUpDate } : {}),
    });
    if (error) mutationError(error.message);
    return { ok: true };
  });

export const addQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        purchaseId: z.string().uuid(),
        category: z.string().min(1).max(40),
        revision: z.number().int().min(0),
        amount: z.number().min(0).max(1_000_000),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, purchase } = await ownPurchase(context.userId, data.purchaseId);
    const { purchaseProducts } = await import("@/lib/crm.server");
    if (!purchaseProducts(purchase).includes(data.category)) throw new Error("Product hoort niet bij deze aanvraag.");
    const { data: version, error } = await db.rpc("commit_product_quote", {
      p_id: purchase.id, p_actor: context.userId, p_category: data.category,
      p_revision: data.revision, p_amount: data.amount,
      ...(data.note ? { p_note: data.note } : {}),
    });
    if (error) mutationError(error.message);
    return { ok: true, version };
  });

export const getCrmStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(7).max(365), category: z.string().max(40).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, companyId, teamRead } = await companyOf(context.userId);
    const { companyCrmStats } = await import("@/lib/crm.server");
    return companyCrmStats(db, companyId, data.days, data.category, teamRead ? undefined : context.userId);
  });

/** Alleen-lezen voorbeeldweergave van een bedrijf voor platformbeheer; elke opening wordt gelogd. */
export const adminPreviewCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid(), days: z.number().int().min(7).max(365) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await adminRole(context.supabase, context.userId, context.claims);
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
