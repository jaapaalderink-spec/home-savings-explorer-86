/**
 * Regels voor duplicaatdetectie, snelheidslimieten en risicoscore.
 *
 * Pure functies zonder database of secrets: alle beslissingen zijn hier
 * uitlegbaar en testbaar. De server is altijd de bron van waarheid.
 */

/** Venster waarin een eerdere aanvraag als mogelijk duplicaat meetelt. */
export const DUPLICATE_WINDOW_DAYS = 30;
/** Venster voor snelheidslimieten op telefoon, e-mail en adres. */
export const RATE_WINDOW_HOURS = 24;
/** Een aanvraag van enkele minuten oud is vrijwel altijd dezelfde poging. */
export const RECENT_SUBMISSION_MINUTES = 30;

/** Maximum aantal nieuwe aanvragen per telefoonnummer binnen het venster. */
export const MAX_LEADS_PER_PHONE = 3;
/** Maximum aantal nieuwe aanvragen per e-mailadres binnen het venster. */
export const MAX_LEADS_PER_EMAIL = 3;
/** Adressen mogen ruimer: appartementen en gezinnen delen een adres. */
export const MAX_LEADS_PER_ADDRESS = 6;

/** Score vanaf wanneer een aanvraag handmatig bekeken moet worden. */
export const REVIEW_SCORE = 40;
/** Score vanaf wanneer een aanvraag niet meer verdeeld wordt. */
export const BLOCK_SCORE = 80;

export type RiskSignal =
  | "recent_phone_duplicate"
  | "recent_email_duplicate"
  | "recent_address_duplicate"
  | "identical_request"
  | "submission_velocity"
  | "verification_failures";

export type FraudStatus = "clean" | "review" | "blocked";
export type Confidence = "none" | "low" | "medium" | "high";

/** Een eerdere aanvraag, teruggebracht tot de velden die we vergelijken. */
export type LeadCandidate = {
  id: string;
  phone: string;
  emailNormalized: string;
  postcodeKey: string;
  houseNumberKey: string;
  categories: string[];
  createdAt: string | Date;
  phoneVerified: boolean;
};

/** De nieuwe aanvraag, genormaliseerd. */
export type NewLead = Omit<LeadCandidate, "id" | "createdAt" | "phoneVerified">;

export type Assessment = {
  isDuplicate: boolean;
  confidence: Confidence;
  matchedLeadId: string | null;
  reasons: RiskSignal[];
  score: number;
  status: FraudStatus;
  reviewRequired: boolean;
  /** Mag er nog een sms-code verstuurd worden voor deze inzending? */
  allowSms: boolean;
};

/** Trimt en verkleint een e-mailadres; geen providerspecifieke trucs. */
export function normalizeEmail(value: string): string {
  return (value ?? "").trim().toLowerCase();
}

/** Postcode zonder spaties in hoofdletters, als vergelijkingssleutel. */
export function postcodeKey(value: string): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Huisnummer als vergelijkingssleutel (leeg blijft leeg). */
export function houseNumberKey(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function ms(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function sameAddress(a: { postcodeKey: string; houseNumberKey: string }, b: NewLead): boolean {
  if (!a.postcodeKey || a.postcodeKey !== b.postcodeKey) return false;
  // Zonder huisnummer is een postcode te grof om als hetzelfde adres te gelden.
  if (!a.houseNumberKey || !b.houseNumberKey) return false;
  return a.houseNumberKey === b.houseNumberKey;
}

function overlaps(a: string[], b: string[]): boolean {
  return a.some((c) => b.includes(c));
}

/**
 * Beoordeelt een nieuwe aanvraag tegen recente aanvragen.
 *
 * Uitgangspunt: nooit een legitieme consument weigeren op zwakke signalen.
 * Alleen een aantoonbaar identieke, recente aanvraag van hetzelfde
 * (geverifieerde) nummer op hetzelfde adres voor dezelfde categorie geldt als
 * hard duplicaat. Iemand die later een ánder product aanvraagt is geen duplicaat.
 */
export function assessLeadRisk(
  input: {
    lead: NewLead;
    recent: LeadCandidate[];
    /** Mislukte verificatiepogingen op dit nummer in het venster. */
    failedVerifications?: number;
  },
  now: Date = new Date(),
): Assessment {
  const { lead, recent } = input;
  const reasons: RiskSignal[] = [];
  let score = 0;
  let matchedLeadId: string | null = null;
  let confidence: Confidence = "none";

  const windowStart = now.getTime() - DUPLICATE_WINDOW_DAYS * 864e5;
  const rateStart = now.getTime() - RATE_WINDOW_HOURS * 3600e3;
  const inWindow = recent.filter((r) => ms(r.createdAt) >= windowStart);

  const samePhone = inWindow.filter((r) => r.phone === lead.phone);
  const sameEmail = inWindow.filter((r) => r.emailNormalized === lead.emailNormalized);
  const sameAddr = inWindow.filter((r) => sameAddress(r, lead));

  // 1. Hard duplicaat: geverifieerd nummer + zelfde adres + overlappende categorie.
  const strong = samePhone.find(
    (r) => r.phoneVerified && sameAddress(r, lead) && overlaps(r.categories, lead.categories),
  );
  if (strong) {
    reasons.push("identical_request", "recent_phone_duplicate", "recent_address_duplicate");
    matchedLeadId = strong.id;
    confidence = "high";
    score += 80;
  } else {
    // 2. Zwakkere combinaties: wel opvallend, maar niet genoeg om te weigeren.
    const emailAddr = sameEmail.find((r) => sameAddress(r, lead));
    const phoneAddr = samePhone.find((r) => sameAddress(r, lead));
    const match = phoneAddr ?? emailAddr;
    if (match) {
      if (phoneAddr) reasons.push("recent_phone_duplicate");
      if (emailAddr) reasons.push("recent_email_duplicate");
      reasons.push("recent_address_duplicate");
      matchedLeadId = match.id;
      confidence = "medium";
      score += 45;
    }
  }

  // 3. Snelheidslimieten binnen 24 uur.
  const phoneRecent = samePhone.filter((r) => ms(r.createdAt) >= rateStart).length;
  const emailRecent = sameEmail.filter((r) => ms(r.createdAt) >= rateStart).length;
  const addressRecent = sameAddr.filter((r) => ms(r.createdAt) >= rateStart).length;

  if (phoneRecent >= MAX_LEADS_PER_PHONE) {
    if (!reasons.includes("recent_phone_duplicate")) reasons.push("recent_phone_duplicate");
    reasons.push("submission_velocity");
    score += 60;
  } else if (emailRecent >= MAX_LEADS_PER_EMAIL) {
    if (!reasons.includes("recent_email_duplicate")) reasons.push("recent_email_duplicate");
    reasons.push("submission_velocity");
    score += 60;
  } else if (addressRecent >= MAX_LEADS_PER_ADDRESS) {
    reasons.push("submission_velocity");
    score += 30;
  }

  // 4. Herhaald mislukte verificaties op dit nummer.
  if ((input.failedVerifications ?? 0) >= 10) {
    reasons.push("verification_failures");
    score += 30;
  }

  score = Math.min(100, score);
  const status: FraudStatus =
    score >= BLOCK_SCORE ? "blocked" : score >= REVIEW_SCORE ? "review" : "clean";
  const isDuplicate = confidence === "high";

  // Sms-kosten: bij een geblokkeerde of net verstuurde identieke inzending
  // sturen we geen nieuwe code. De verificatiepolicy zelf blijft ongewijzigd.
  const justSubmitted = samePhone.some(
    (r) =>
      now.getTime() - ms(r.createdAt) <= RECENT_SUBMISSION_MINUTES * 60e3 &&
      sameAddress(r, lead) &&
      overlaps(r.categories, lead.categories),
  );
  const allowSms = status !== "blocked" && !isDuplicate && !justSubmitted;

  return {
    isDuplicate,
    confidence,
    matchedLeadId,
    reasons: [...new Set(reasons)],
    score,
    status,
    reviewRequired: status !== "clean",
    allowSms,
  };
}

/** Neutrale bevestiging voor de consument; verklapt nooit interne regels. */
export const NEUTRAL_CONFIRMATION =
  "Je aanvraag is ontvangen. Als er aanvullende informatie nodig is, nemen we contact met je op.";
