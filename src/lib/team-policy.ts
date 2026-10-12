/** Regels voor teams en uitnodigingen. Puur, zonder serverafhankelijkheden. */

/** Prijs per extra gebruikersplek per maand, excl. btw (hoofdaccount is inbegrepen). */
export const SEAT_FEE_EX_VAT = 15;
export const INVITE_TTL_DAYS = 7;
export const INCLUDED_SEATS = 1;

export const STAFF_PERMISSIONS = [
  { id: "leads", label: "Aanvragen bekijken" },
  { id: "partners", label: "Partners beheren" },
  { id: "billing", label: "Facturatie" },
  { id: "quality", label: "Kwaliteit" },
  { id: "calculator", label: "Calculatorinstellingen" },
  { id: "coverage", label: "Werkgebieden en kaart" },
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]["id"];

/** Wijzigingen gaan in per de eerstvolgende maandgrens (YYYY-MM-DD). */
export function nextMonthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
}

/** Betaalde plekken = alle gebruikers (incl. openstaande uitnodigingen) min de inbegrepen plek. */
export function paidSeats(members: number, openInvites: number): number {
  return Math.max(0, members + openInvites - INCLUDED_SEATS);
}

export function seatQuote(baseMonthlyExVat: number, members: number, openInvites: number) {
  const before = paidSeats(members, openInvites);
  const after = paidSeats(members, openInvites + 1);
  const currentTotal = round2(baseMonthlyExVat + before * SEAT_FEE_EX_VAT);
  const newTotal = round2(baseMonthlyExVat + after * SEAT_FEE_EX_VAT);
  return {
    seatFee: after > before ? SEAT_FEE_EX_VAT : 0,
    startDate: nextMonthStart(),
    currentTotal,
    newTotal,
  };
}

export type TeamAction = "make_owner" | "make_account_manager" | "remove";

const RESULT_MESSAGES: Record<string, string> = {
  NOT_FOUND: "Deze uitnodiging bestaat niet.",
  REVOKED: "Deze uitnodiging is ingetrokken.",
  USED: "Deze uitnodiging is al gebruikt.",
  EXPIRED: "Deze uitnodiging is verlopen. Vraag een nieuwe aan.",
  EMAIL_MISMATCH:
    "Deze uitnodiging is voor een ander e-mailadres. Log in met het uitgenodigde adres.",
  OTHER_COMPANY: "Je bent al aan een ander bedrijf gekoppeld.",
  NOT_MEMBER: "Deze gebruiker hoort niet bij jouw bedrijf.",
  SELF: "Je kunt je eigen rol niet wijzigen of jezelf verwijderen.",
  LAST_OWNER: "Er moet altijd minstens één eigenaar blijven.",
  BAD_ACTION: "Onbekende actie.",
};
export function teamResultMessage(code: string): string {
  return RESULT_MESSAGES[code] ?? "Er ging iets mis.";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
export const PENDING_INVITE_KEY = "oo-pending-invite";
