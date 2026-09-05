/**
 * Server-only kwaliteitsscores: ruwe cijfers ophalen, score berekenen,
 * opslaan en (spaarzaam) auditgebeurtenissen wegschrijven.
 *
 * De scores zijn voorberekend: de leadverdeling leest alleen kant-en-klare
 * waarden en draait nooit zware historische aggregaties per aanvraag.
 */
import { adminDb } from "@/lib/partner-util";
import {
  computeQualityScore,
  type QualityMetrics,
  type QualityScore,
} from "@/lib/quality-policy";

/** Herberekening wordt overgeslagen als de score jonger is dan dit. */
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

type MetricsRow = {
  company_id: string;
  leads_total: number;
  leads_sla_eligible: number;
  opened_count: number;
  contacted_count: number;
  within_24h: number;
  within_48h: number;
  closed_count: number;
  won_count: number;
  quoted_plus_count: number;
  untouched_count: number;
  approved_complaints: number;
  recent_7d: number;
  last_assigned_at: string | null;
};

function toMetrics(row: MetricsRow): QualityMetrics {
  return {
    companyId: row.company_id,
    leadsTotal: Number(row.leads_total ?? 0),
    leadsSlaEligible: Number(row.leads_sla_eligible ?? 0),
    openedCount: Number(row.opened_count ?? 0),
    contactedCount: Number(row.contacted_count ?? 0),
    within24h: Number(row.within_24h ?? 0),
    within48h: Number(row.within_48h ?? 0),
    closedCount: Number(row.closed_count ?? 0),
    wonCount: Number(row.won_count ?? 0),
    quotedPlusCount: Number(row.quoted_plus_count ?? 0),
    untouchedCount: Number(row.untouched_count ?? 0),
    approvedComplaints: Number(row.approved_complaints ?? 0),
    recent7d: Number(row.recent_7d ?? 0),
  };
}

/** Haalt de ruwe prestatiecijfers op (één bedrijf of alle bedrijven). */
export async function fetchQualityMetrics(companyId?: string): Promise<QualityMetrics[]> {
  const db = await adminDb();
  const { data, error } = await db.rpc("company_quality_metrics", {
    p_company_id: companyId ?? null,
  } as never);
  if (error) {
    console.error("company_quality_metrics failed", error.message);
    throw new Error("Kwaliteitscijfers ophalen is mislukt.");
  }
  return ((data ?? []) as unknown as MetricsRow[]).map(toMetrics);
}

async function logQualityAudit(
  event: "QUALITY_SCORE_RECALCULATED" | "QUALITY_WARNING_SET" | "QUALITY_WARNING_CLEARED",
  companyId: string,
  metadata: Record<string, unknown>,
) {
  const db = await adminDb();
  const { error } = await db.rpc("log_audit_event", {
    p_event: event,
    p_entity: "company",
    p_entity_id: companyId,
    p_company: companyId,
    p_actor: null,
    p_source: "system",
    p_metadata: metadata,
  } as never);
  if (error) console.error("log_audit_event (quality) failed", error.message);
}

/**
 * Herberekent scores en slaat ze op. Idempotent: dezelfde historie geeft
 * dezelfde score en er wordt alleen een auditregel geschreven bij een
 * merkbare verandering (>= 1 punt) of bij het aan/uit gaan van de waarschuwing.
 */
export async function recalculateQualityScores(
  companyId?: string,
): Promise<{ updated: number; scores: QualityScore[] }> {
  const db = await adminDb();
  const metrics = await fetchQualityMetrics(companyId);
  if (metrics.length === 0) return { updated: 0, scores: [] };

  const ids = metrics.map((m) => m.companyId);
  const { data: previous } = await db
    .from("company_quality_scores")
    .select("company_id, overall_score, quality_warning")
    .in("company_id", ids);
  const before = new Map(
    (previous ?? []).map((p) => [
      p.company_id,
      { overall: Number(p.overall_score), warning: p.quality_warning === true },
    ]),
  );

  const now = new Date().toISOString();
  const scores = metrics.map(computeQualityScore);
  const rows = scores.map((s, i) => ({
    company_id: s.companyId,
    overall_score: s.overall,
    response_score: s.response,
    complaint_score: s.complaint,
    engagement_score: s.engagement,
    conversion_score: s.conversion,
    sample_size: s.sampleSize,
    quality_warning: s.qualityWarning,
    metrics: metrics[i] as unknown as Record<string, number | string>,
    calculated_at: now,
  }));

  const { error } = await db
    .from("company_quality_scores")
    .upsert(rows, { onConflict: "company_id" });
  if (error) {
    console.error("upsert company_quality_scores failed", error.message);
    throw new Error("Kwaliteitsscores opslaan is mislukt.");
  }

  for (const s of scores) {
    const prev = before.get(s.companyId);
    if (!prev || Math.abs(prev.overall - s.overall) >= 1) {
      await logQualityAudit("QUALITY_SCORE_RECALCULATED", s.companyId, {
        overall: s.overall,
        response: s.response,
        complaint: s.complaint,
        engagement: s.engagement,
        conversion: s.conversion,
        sample_size: s.sampleSize,
      });
    }
    if (prev?.warning !== s.qualityWarning) {
      await logQualityAudit(
        s.qualityWarning ? "QUALITY_WARNING_SET" : "QUALITY_WARNING_CLEARED",
        s.companyId,
        { overall: s.overall, sample_size: s.sampleSize },
      );
    }
  }

  return { updated: rows.length, scores };
}

/** Herberekent alleen als de opgeslagen score verouderd is. Faalt nooit hard. */
export async function refreshQualityScoreIfStale(companyId: string): Promise<void> {
  try {
    const db = await adminDb();
    const { data } = await db
      .from("company_quality_scores")
      .select("calculated_at")
      .eq("company_id", companyId)
      .maybeSingle();
    const age = data?.calculated_at ? Date.now() - new Date(data.calculated_at).getTime() : null;
    if (age !== null && age < STALE_AFTER_MS) return;
    await recalculateQualityScores(companyId);
  } catch (err) {
    console.error("refreshQualityScoreIfStale failed", err);
  }
}

/** Rankinggegevens (score + recent volume) voor een set bedrijven. */
export async function loadRankingInputs(companyIds: string[]) {
  if (companyIds.length === 0) return new Map<string, { overall: number; sampleSize: number }>();
  const db = await adminDb();
  const { data } = await db
    .from("company_quality_scores")
    .select("company_id, overall_score, sample_size")
    .in("company_id", companyIds);
  return new Map(
    (data ?? []).map((r) => [
      r.company_id,
      { overall: Number(r.overall_score), sampleSize: Number(r.sample_size) },
    ]),
  );
}
