import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { APPOINTMENT_KINDS, PRIORITIES } from "@/lib/agenda-policy";

/** Agenda: afspraken + leads die opvolging nodig hebben, binnen de dossierscope van de gebruiker. */
export const getAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { partnerAccess } = await import("@/lib/partner-access.server");
    const { loadProductCrm } = await import("@/lib/crm.server");
    const { dossierSummary } = await import("@/lib/crm-policy");
    const { followUpReason, byPriorityThenAge } = await import("@/lib/agenda-policy");
    const access = await partnerAccess(context.userId);
    const db = access.db;
    let q = db.from("lead_purchases")
      .select("id, status, products, priority, created_at, updated_at, assigned_to, lead:leads(first_name, last_name, phone, email, postcode, house_number, city, categories)")
      .eq("company_id", access.companyId).eq("crm_closed", false);
    if (!access.teamRead) q = q.eq("assigned_to", context.userId);
    const { data: purchases, error } = await q;
    if (error) throw new Error("Agenda laden is mislukt.");
    const ids = (purchases ?? []).map((p) => p.id);
    const [{ data: appts }, { data: crmRows }, crm] = await Promise.all([
      ids.length ? db.from("lead_appointments").select("id, purchase_id, category, scheduled_at, kind, note, status").in("purchase_id", ids).neq("status", "cancelled").order("scheduled_at") : Promise.resolve({ data: [] as never[] }),
      ids.length ? db.from("purchase_product_crm").select("purchase_id, updated_at").in("purchase_id", ids) : Promise.resolve({ data: [] as never[] }),
      loadProductCrm(db, purchases ?? []),
    ]);
    const now = new Date();
    const leadInfo = (p: NonNullable<typeof purchases>[number]) => {
      const l = (p.lead ?? {}) as Record<string, unknown>;
      return {
        purchaseId: p.id,
        name: `${l["first_name"] ?? ""} ${l["last_name"] ?? ""}`.trim(),
        phone: (l["phone"] as string) ?? "",
        email: (l["email"] as string) ?? "",
        address: `${l["postcode"] ?? ""} ${l["house_number"] ?? ""} ${l["city"] ?? ""}`.trim(),
        priority: (p.priority ?? "normal") as (typeof PRIORITIES)[number],
        createdAt: p.created_at,
      };
    };
    const byId = new Map((purchases ?? []).map((p) => [p.id, p]));
    const appointments = (appts ?? []).filter((a) => a.status === "planned").map((a) => ({
      id: a.id, scheduledAt: a.scheduled_at, kind: a.kind as (typeof APPOINTMENT_KINDS)[number],
      note: a.note, category: a.category, ...leadInfo(byId.get(a.purchase_id)!),
    }));
    const followUps = (purchases ?? []).flatMap((p) => {
      const rows = crm.get(p.id) ?? [];
      const sum = dossierSummary(rows.map((r) => r.status));
      const activity = [p.updated_at, ...(crmRows ?? []).filter((r) => r.purchase_id === p.id).map((r) => r.updated_at)].sort().at(-1)!;
      const reason = followUpReason({
        status: sum.status, closed: sum.closed, priority: (p.priority ?? "normal") as "normal",
        createdAt: p.created_at, lastActivityAt: activity,
        followUpDates: rows.map((r) => r.followUpDate),
        appointments: (appts ?? []).filter((a) => a.purchase_id === p.id).map((a) => ({ scheduledAt: a.scheduled_at, status: a.status as "planned" })),
      }, now);
      return reason ? [{ ...leadInfo(p), reason }] : [];
    }).sort(byPriorityThenAge);
    return { appointments, followUps };
  });

export const listAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ purchaseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { accessiblePurchase } = await import("@/lib/partner-access.server");
    const { db, purchase } = await accessiblePurchase(context.userId, data.purchaseId);
    const [{ data: rows }, { data: p }] = await Promise.all([
      db.from("lead_appointments").select("id, category, scheduled_at, kind, note, status").eq("purchase_id", purchase.id).neq("status", "cancelled").order("scheduled_at"),
      db.from("lead_purchases").select("priority").eq("id", purchase.id).single(),
    ]);
    return {
      priority: (p?.priority ?? "normal") as (typeof PRIORITIES)[number],
      appointments: (rows ?? []).map((r) => ({ id: r.id, category: r.category, scheduledAt: r.scheduled_at, kind: r.kind as (typeof APPOINTMENT_KINDS)[number], note: r.note, status: r.status })),
    };
  });

export const scheduleAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    purchaseId: z.string().uuid(),
    category: z.string().max(40).nullable().optional(),
    scheduledAt: z.string().datetime({ offset: true }),
    kind: z.enum(APPOINTMENT_KINDS),
    note: z.string().trim().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { accessiblePurchase } = await import("@/lib/partner-access.server");
    const { db, purchase, companyId } = await accessiblePurchase(context.userId, data.purchaseId);
    const { error } = await db.from("lead_appointments").insert({
      purchase_id: purchase.id, company_id: companyId, category: data.category ?? null,
      scheduled_at: data.scheduledAt, kind: data.kind, note: data.note || null, created_by: context.userId,
    });
    if (error) throw new Error("Afspraak opslaan is mislukt.");
    return { ok: true };
  });

export const updateAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ purchaseId: z.string().uuid(), id: z.string().uuid(), status: z.enum(["done", "cancelled"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { accessiblePurchase } = await import("@/lib/partner-access.server");
    const { db, purchase } = await accessiblePurchase(context.userId, data.purchaseId);
    const { error } = await db.from("lead_appointments").update({ status: data.status }).eq("id", data.id).eq("purchase_id", purchase.id);
    if (error) throw new Error("Bijwerken is mislukt.");
    return { ok: true };
  });

export const setLeadPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ purchaseId: z.string().uuid(), priority: z.enum(PRIORITIES) }).parse(d))
  .handler(async ({ data, context }) => {
    const { accessiblePurchase } = await import("@/lib/partner-access.server");
    const { db, purchase } = await accessiblePurchase(context.userId, data.purchaseId);
    const { error } = await db.from("lead_purchases").update({ priority: data.priority }).eq("id", purchase.id);
    if (error) throw new Error("Prioriteit opslaan is mislukt.");
    return { ok: true };
  });
