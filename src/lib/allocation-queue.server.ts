/** Herpoging voor aanvragen die nog niet (volledig) geleverd zijn, tot 30 dagen na binnenkomst. */
import { adminDb } from "@/lib/partner-util";

export async function retryPendingLeads(limit = 50) {
  const db = await adminDb();
  const now = new Date().toISOString();
  const { data: due } = await db
    .from("leads")
    .select("id")
    .in("fulfillment_status", ["waiting", "partial"])
    .gt("retry_until", now)
    .eq("phone_verified", true)
    .neq("state", "cancelled")
    .order("last_allocation_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  const { distributeLead } = await import("@/lib/leads.server");
  let assigned = 0;
  for (const lead of due ?? []) {
    try {
      const r = await distributeLead(lead.id);
      assigned += r.assigned;
    } catch (err) {
      console.error("retry distribute failed", lead.id, err);
    }
  }

  // Termijn verstreken zonder levering: niet leverbaar.
  const { data: expired } = await db
    .from("leads")
    .select("id")
    .eq("fulfillment_status", "waiting")
    .lte("retry_until", now)
    .limit(200);
  for (const lead of expired ?? []) {
    await db.rpc("update_lead_fulfillment", { p_lead: lead.id });
  }

  return { retried: (due ?? []).length, assigned, expired: (expired ?? []).length };
}
