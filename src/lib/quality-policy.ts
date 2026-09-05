/**
 * Kwaliteitsscore en ranking van installateurs — pure rekenmodule.
 *
 * Alle wegingen en constanten staan hier centraal. Geen database, geen
 * willekeur (jitter wordt geïnjecteerd), zodat alles testbaar en uitlegbaar is.
 *
 * Belangrijk: deze module bepaalt alleen de VOLGORDE van kandidaten.
 * Geschiktheid (regio, categorie, capaciteit, vrije plek, verificatie) en de
 * daadwerkelijke toewijzing blijven bij de database (`allocate_lead_to_company`).
 */

/** Neutrale startscore voor een bedrijf zonder historie. */
export const NEUTRAL_SCORE = 50;

/** Wegingen van de vier deelscores (samen 1.0). */
export const SCORE_WEIGHTS = {
  response: 0.35,
  complaint: 0.3,
  engagement: 0.2,
  conversion: 0.15,
} as const;

/**
 * Vertrouwensweging (Bayesiaanse afvlakking):
 *   score = (priorWeight * NEUTRAL + n * observed) / (priorWeight + n)
 * Hoe kleiner de steekproef, hoe dichter de score bij 50 blijft.
 */
export const PRIOR_WEIGHT = {
  response: 6,
  complaint: 10,
  engagement: 6,
  conversion: 8,
} as const;

/** Puntenwaarde per lead voor reactiesnelheid. */
export const RESPONSE_POINTS = {
  within24h: 100,
  within48h: 60,
  lateContact: 30,
  noContact: 0,
} as const;

/** Puntenwaarde per lead voor opvolging (eindacties tellen zwaarder). */
export const ENGAGEMENT_POINTS = {
  untouched: 0,
  openedOnly: 20,
  contacted: 50,
  quoted: 75,
  closed: 100,
} as const;

/** Conversie: dit winpercentage van gesloten leads geldt als volle score. */
export const CONVERSION_TARGET_RATE = 0.4;

/** Rankingfactoren. */
export const RANKING = {
  /** Maximale bonus voor een partner die recent weinig leads kreeg. */
  fairnessMax: 20,
  /** Vanaf dit aantal leads in 7 dagen vervalt de eerlijkheidsbonus. */
  fairnessReference: 10,
  /** Tijdelijke bonus voor een nieuw bedrijf. */
  newCompanyBoost: 8,
  /** Tot dit aantal leads geldt een bedrijf als nieuw. */
  newCompanySampleSize: 5,
  /** Maximale willekeurige variatie zodat gelijke partners rouleren. */
  jitterMax: 5,
} as const;

/** Drempel voor een kwaliteitswaarschuwing (alleen zichtbaar voor beheer). */
export const QUALITY_WARNING = { threshold: 35, minSampleSize: 10 } as const;

/** Ruwe cijfers zoals de database ze aanlevert. */
export type QualityMetrics = {
  companyId: string;
  leadsTotal: number;
  leadsSlaEligible: number;
  openedCount: number;
  contactedCount: number;
  within24h: number;
  within48h: number;
  closedCount: number;
  wonCount: number;
  quotedPlusCount: number;
  untouchedCount: number;
  approvedComplaints: number;
  recent7d: number;
};

export type QualityScore = {
  companyId: string;
  overall: number;
  response: number;
  complaint: number;
  engagement: number;
  conversion: number;
  sampleSize: number;
  qualityWarning: boolean;
};

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Afvlakking richting de neutrale score op basis van de steekproefgrootte. */
export function smooth(observed: number, sampleSize: number, priorWeight: number): number {
  if (sampleSize <= 0) return NEUTRAL_SCORE;
  return (priorWeight * NEUTRAL_SCORE + sampleSize * clamp(observed)) / (priorWeight + sampleSize);
}

/** Reactiesnelheid: alleen leads die al 48 uur oud zijn tellen mee. */
export function responseComponent(m: QualityMetrics): number {
  const n = m.leadsSlaEligible;
  if (n <= 0) return NEUTRAL_SCORE;
  const within24 = Math.min(m.within24h, n);
  const within48only = Math.max(0, Math.min(m.within48h, n) - within24);
  const contactedLate = Math.max(0, Math.min(m.contactedCount, n) - within24 - within48only);
  const noContact = Math.max(0, n - within24 - within48only - contactedLate);
  const points =
    within24 * RESPONSE_POINTS.within24h +
    within48only * RESPONSE_POINTS.within48h +
    contactedLate * RESPONSE_POINTS.lateContact +
    noContact * RESPONSE_POINTS.noContact;
  return smooth(points / n, n, PRIOR_WEIGHT.response);
}

/** Reclamaties: alleen goedgekeurde klachten tellen, als percentage van de leads. */
export function complaintComponent(m: QualityMetrics): number {
  const n = m.leadsTotal;
  if (n <= 0) return NEUTRAL_SCORE;
  const rate = Math.min(1, m.approvedComplaints / n);
  return smooth((1 - rate) * 100, n, PRIOR_WEIGHT.complaint);
}

/** Opvolging: hoe ver komt een lead in het CRM? Eindacties wegen het zwaarst. */
export function engagementComponent(m: QualityMetrics): number {
  const n = m.leadsSlaEligible;
  if (n <= 0) return NEUTRAL_SCORE;
  const closed = Math.min(m.closedCount, n);
  const quotedOnly = Math.max(0, Math.min(m.quotedPlusCount, n) - closed);
  const contactedOnly = Math.max(0, Math.min(m.contactedCount, n) - closed - quotedOnly);
  const openedOnly = Math.max(
    0,
    Math.min(m.openedCount, n) - closed - quotedOnly - contactedOnly,
  );
  const untouched = Math.max(0, n - closed - quotedOnly - contactedOnly - openedOnly);
  const points =
    closed * ENGAGEMENT_POINTS.closed +
    quotedOnly * ENGAGEMENT_POINTS.quoted +
    contactedOnly * ENGAGEMENT_POINTS.contacted +
    openedOnly * ENGAGEMENT_POINTS.openedOnly +
    untouched * ENGAGEMENT_POINTS.untouched;
  return smooth(points / n, n, PRIOR_WEIGHT.engagement);
}

/** Conversie: gewonnen leads gedeeld door afgesloten leads (open leads tellen niet). */
export function conversionComponent(m: QualityMetrics): number {
  const n = m.closedCount;
  if (n <= 0) return NEUTRAL_SCORE;
  const rate = m.wonCount / n;
  const observed = clamp((rate / CONVERSION_TARGET_RATE) * 100);
  return smooth(observed, n, PRIOR_WEIGHT.conversion);
}

/** Berekent de volledige kwaliteitsscore uit de ruwe cijfers. */
export function computeQualityScore(m: QualityMetrics): QualityScore {
  const response = responseComponent(m);
  const complaint = complaintComponent(m);
  const engagement = engagementComponent(m);
  const conversion = conversionComponent(m);
  const overall =
    response * SCORE_WEIGHTS.response +
    complaint * SCORE_WEIGHTS.complaint +
    engagement * SCORE_WEIGHTS.engagement +
    conversion * SCORE_WEIGHTS.conversion;

  return {
    companyId: m.companyId,
    overall: round2(clamp(overall)),
    response: round2(clamp(response)),
    complaint: round2(clamp(complaint)),
    engagement: round2(clamp(engagement)),
    conversion: round2(clamp(conversion)),
    sampleSize: m.leadsTotal,
    qualityWarning:
      m.leadsTotal >= QUALITY_WARNING.minSampleSize && overall < QUALITY_WARNING.threshold,
  };
}

/** Kandidaat voor de ranking: geschiktheid is elders al vastgesteld. */
export type RankCandidate = {
  companyId: string;
  overall?: number | null;
  sampleSize?: number | null;
  recent7d?: number | null;
};

export type RankedCandidate = RankCandidate & {
  quality: number;
  fairness: number;
  newBoost: number;
  jitter: number;
  rankScore: number;
};

/** Eerlijkheidsbonus: minder recente leads geeft een bescheiden voorrang. */
export function fairnessBonus(recent7d: number): number {
  const used = Math.min(Math.max(recent7d, 0), RANKING.fairnessReference);
  return RANKING.fairnessMax * (1 - used / RANKING.fairnessReference);
}

/**
 * Ordent geschikte bedrijven voor één lead.
 *
 *   rankScore = kwaliteit (0–100) + eerlijkheid (0–20) + nieuwbonus (0–8) + jitter (0–5)
 *
 * Omdat de opslagen samen nooit boven 33 uitkomen, kan een structureel zwakke
 * partner een sterke partner niet verdringen. Er wordt hier niets toegewezen.
 */
export function rankEligibleCompaniesForLead<T extends RankCandidate>(
  candidates: T[],
  options: { jitter?: () => number } = {},
): Array<T & RankedCandidate> {
  const jitterFn = options.jitter ?? (() => Math.random() * RANKING.jitterMax);
  return candidates
    .map((c) => {
      const quality = typeof c.overall === "number" ? clamp(c.overall) : NEUTRAL_SCORE;
      const sampleSize = c.sampleSize ?? 0;
      const fairness = fairnessBonus(c.recent7d ?? 0);
      const newBoost = sampleSize < RANKING.newCompanySampleSize ? RANKING.newCompanyBoost : 0;
      const jitter = jitterFn();
      return {
        ...c,
        quality,
        fairness: round2(fairness),
        newBoost,
        jitter: round2(jitter),
        rankScore: round2(quality + fairness + newBoost + jitter),
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);
}
