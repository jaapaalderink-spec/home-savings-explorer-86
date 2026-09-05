/** Server-only duplicaat- en misbruikcontrole rond het aanmaken van leads. */
import { adminDb } from "@/lib/partner-util";
import {
  DUPLICATE_WINDOW_DAYS,
  RATE_WINDOW_HOURS,
  assessLeadRisk,
  houseNumberKey,
  normalizeEmail,
  postcodeKey,
  type Assessment,
  type LeadCandidate,
  type NewLead,
} from "@/lib/lead-risk-policy";

export type { Assessment };

/**
 * Beoordeelt een inzending vóór verdeling.
 *
 * Haalt alleen de recente aanvragen op die op telefoon, e-mail of postcode
 * kunnen matchen; het venster is {@link DUPLICATE_WINDOW_DAYS} dagen.
 */
export async function assessSubmission(lead: {
  phone: string;
  email: string;
  postcode: string;
  houseNumber?: string | null;
  categories: string[];
}): Promise<Assessment> {
  const db = await adminDb();
  const now = new Date();
  const since = new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 864e5).toISOString();

  const candidate: NewLead = {
    phone: lead.phone,
    emailNormalized: normalizeEmail(lead.email),
    postcodeKey: postcodeKey(lead.postcode),
    houseNumberKey: houseNumberKey(lead.houseNumber),
    categories: lead.categories,
  };

  const [{ data: rows }, { data: failed }] = await Promise.all([
    db
      .from("leads")
      .select(
        "id, phone, email_normalized, postcode, house_number, categories, created_at, phone_verified",
      )
      .gte("created_at", since)
      .or(
        `phone.eq.${candidate.phone},email_normalized.eq.${candidate.emailNormalized},postcode.eq.${lead.postcode.toUpperCase().replace(/\s+/g, " ")}`,
      )
      .limit(200),
    db
      .from("phone_verifications")
      .select("attempts")
      .eq("phone", candidate.phone)
      .gte("created_at", new Date(now.getTime() - RATE_WINDOW_HOURS * 3600e3).toISOString()),
  ]);

  const recent: LeadCandidate[] = (rows ?? []).map((r) => ({
    id: r.id,
    phone: r.phone,
    emailNormalized: r.email_normalized ?? normalizeEmail(""),
    postcodeKey: postcodeKey(r.postcode),
    houseNumberKey: houseNumberKey(r.house_number),
    categories: r.categories ?? [],
    createdAt: r.created_at,
    phoneVerified: r.phone_verified === true,
  }));

  const failedVerifications = (failed ?? []).reduce((sum, f) => sum + (f.attempts ?? 0), 0);

  return assessLeadRisk({ lead: candidate, recent, failedVerifications }, now);
}

/**
 * Legt de beoordeling vast op de lead en in het auditspoor.
 * Slaat geen ruwe persoonsgegevens op in de metadata.
 */
export async function applyAssessment(leadId: string, assessment: Assessment): Promise<void> {
  const db = await adminDb();

  await db
    .from("leads")
    .update({
      fraud_score: assessment.score,
      fraud_status: assessment.status,
      review_required: assessment.reviewRequired,
      duplicate_of_lead_id: assessment.isDuplicate ? assessment.matchedLeadId : null,
      // Een hard duplicaat mag niet naar installateurs; markeer als afgehandeld.
      ...(assessment.isDuplicate ? { state: "cancelled" as const } : {}),
    })
    .eq("id", leadId);

  if (assessment.reasons.length === 0) return;

  await db.from("lead_risk_events").insert(
    assessment.reasons.map((signal) => ({
      lead_id: leadId,
      signal,
      score: assessment.score,
      metadata: {
        confidence: assessment.confidence,
        matched_lead_id: assessment.matchedLeadId,
        window_days: DUPLICATE_WINDOW_DAYS,
      },
    })),
  );
}
