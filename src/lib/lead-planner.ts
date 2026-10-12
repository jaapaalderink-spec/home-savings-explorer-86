/**
 * Planner voor nieuwe toewijzingen. Puur en deterministisch (op de rangorde na),
 * de database controleert en schrijft daarna elke toewijzing definitief weg.
 *
 * Regels:
 * - maximaal `slots` bedrijven (nooit meer dan 4 per aanvraag);
 * - één toewijzing per bedrijf, met alle producten die het hier kan leveren gebundeld;
 * - eerst zoveel mogelijk producten van de aanvraag afdekken;
 * - daarna eerlijk: wie relatief het meeste quotum over heeft, gaat voor;
 * - bij gelijke stand beslist de kwaliteitsvolgorde (`rank`, lager = eerder).
 */
export const MAX_COMPANIES_PER_REQUEST = 4;

export type PlanCandidate = {
  companyId: string;
  /** Producten van deze aanvraag die het bedrijf hier levert en waarvoor ruimte is. */
  products: string[];
  /** Resterende leadplaatsen deze maand (0..1 als aandeel van het quotum). */
  remainingShare: number;
  rank: number;
};

export type PlanItem = { companyId: string; products: string[] };

export function planAllocation(
  requestProducts: string[],
  slots: number,
  candidates: PlanCandidate[],
  alreadyCovered: string[] = [],
): PlanItem[] {
  const limit = Math.max(0, Math.min(slots, MAX_COMPANIES_PER_REQUEST));
  const wanted = new Set(requestProducts);
  const pool = candidates
    .map((c) => ({ ...c, products: [...new Set(c.products.filter((p) => wanted.has(p)))].sort() }))
    .filter((c) => c.products.length > 0 && c.remainingShare > 0);

  const covered = new Set(alreadyCovered.filter((p) => wanted.has(p)));
  const plan: PlanItem[] = [];
  const fair = (a: PlanCandidate, b: PlanCandidate) =>
    b.remainingShare - a.remainingShare || a.rank - b.rank;

  while (plan.length < limit && pool.length > 0) {
    // Fase 1: zolang er producten open staan, kies wie de meeste nieuwe dekt.
    const gain = (c: PlanCandidate) => c.products.filter((p) => !covered.has(p)).length;
    const anyGain = pool.some((c) => gain(c) > 0);
    pool.sort((a, b) =>
      anyGain ? gain(b) - gain(a) || fair(a, b) : b.products.length - a.products.length || fair(a, b),
    );
    const next = pool.shift()!;
    plan.push({ companyId: next.companyId, products: next.products });
    next.products.forEach((p) => covered.add(p));
  }
  return plan;
}

export type FulfillmentStatus = "complete" | "partial" | "waiting" | "undeliverable";

export const FULFILLMENT_LABEL: Record<FulfillmentStatus, string> = {
  complete: "Volledig",
  partial: "Gedeeltelijk",
  waiting: "Wachtend",
  undeliverable: "Niet leverbaar",
};

export const RETRY_WINDOW_DAYS = 30;
