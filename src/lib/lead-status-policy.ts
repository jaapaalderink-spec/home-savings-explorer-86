/**
 * Toegestane statusovergangen voor een ingekochte lead.
 *
 * Bewuste keuze: de database blijft permissief (zij bewaart alleen wat er
 * gebeurd is), de regels leven hier op applicatieniveau. Zo kan beheer een
 * correctie doorvoeren zonder dat de geschiedenis onbetrouwbaar wordt.
 */
export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Normale voortgang voor een partner. */
const PARTNER_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "lost"],
  contacted: ["quoted", "won", "lost"],
  quoted: ["won", "lost"],
  won: [],
  lost: ["contacted"],
};

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nieuw",
  contacted: "Gebeld",
  quoted: "Offerte uit",
  won: "Gewonnen",
  lost: "Verloren",
};

export type TransitionCheck = { ok: true; changed: boolean } | { ok: false; reason: string };

/**
 * @param isAdmin beheer mag corrigeren en dus elke overgang zetten.
 */
export function checkStatusTransition(
  from: LeadStatus,
  to: LeadStatus,
  isAdmin = false,
): TransitionCheck {
  if (from === to) return { ok: true, changed: false };
  if (isAdmin) return { ok: true, changed: true };
  if (PARTNER_TRANSITIONS[from].includes(to)) return { ok: true, changed: true };
  return {
    ok: false,
    reason: `Van "${STATUS_LABEL[from]}" kun je niet direct naar "${STATUS_LABEL[to]}".`,
  };
}

export function allowedNextStatuses(from: LeadStatus, isAdmin = false): LeadStatus[] {
  return isAdmin ? LEAD_STATUSES.filter((s) => s !== from) : PARTNER_TRANSITIONS[from];
}
