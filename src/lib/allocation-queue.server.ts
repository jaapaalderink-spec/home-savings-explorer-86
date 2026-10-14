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
      await db.from("background_jobs").delete().eq("kind", "distribute_lead").eq("ref_id", lead.id);
    } catch (err) {
      console.error("retry distribute failed", lead.id, err);
      await recordJobFailure(db, "distribute_lead", lead.id, err);
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

type Db = Awaited<ReturnType<typeof adminDb>>;

/** Legt een mislukte taak vast; na max. pogingen staat hij op 'failed' voor handmatig herstel. */
export async function recordJobFailure(db: Db, kind: string, refId: string, err: unknown) {
  const { data: job } = await db
    .from("background_jobs")
    .select("attempts, max_attempts")
    .eq("kind", kind)
    .eq("ref_id", refId)
    .maybeSingle();
  const attempts = (job?.attempts ?? 0) + 1;
  const max = job?.max_attempts ?? 5;
  const backoffMin = Math.min(60 * 24, 15 * 2 ** (attempts - 1));
  await db.from("background_jobs").upsert(
    {
      kind,
      ref_id: refId,
      attempts,
      status: attempts >= max ? "failed" : "retry",
      last_error: String(err instanceof Error ? err.message : err).slice(0, 500),
      next_run_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "kind,ref_id" },
  );
}

/** Handmatig opnieuw uitvoeren vanuit het herstelscherm. */
export async function rerunJob(jobId: string) {
  const db = await adminDb();
  const { data: job } = await db.from("background_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw new Error("Taak niet gevonden.");
  if (job.kind !== "distribute_lead") throw new Error("Onbekend taaktype.");
  const { distributeLead } = await import("@/lib/leads.server");
  try {
    const r = await distributeLead(job.ref_id);
    await db.from("background_jobs").delete().eq("id", jobId);
    return { ok: true, assigned: r.assigned };
  } catch (err) {
    await recordJobFailure(db, job.kind, job.ref_id, err);
    return { ok: false, assigned: 0 };
  }
}
