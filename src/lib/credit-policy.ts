/**
 * Zuivere creditlogica (geen database): btw-omkering, openstaand bedrag en de
 * uitleg van een reclamatie-uitkomst. Conventie: creditnota's worden met
 * positieve bedragen opgeslagen en als creditdocument gepresenteerd (dus met
 * een minteken in de interface). Nooit een mix van beide.
 */
import { toCents, centsToAmount } from "@/lib/payments-policy";

export type CreditNoteStatus = "open" | "applied" | "refunded";

export const CREDIT_STATUS_LABEL: Record<CreditNoteStatus, string> = {
  open: "Openstaand tegoed",
  applied: "Verrekend",
  refunded: "Terugbetaald",
};

export type ComplaintOutcome =
  | "rejected"
  | "no_credit_required"
  | "excluded_before_invoice"
  | "credit_note_created"
  | "existing";

export const COMPLAINT_OUTCOME_LABEL: Record<ComplaintOutcome, string> = {
  rejected: "Afgewezen",
  no_credit_required: "Geen creditering nodig (proeflead)",
  excluded_before_invoice: "Niet gefactureerd, van facturatie uitgesloten",
  credit_note_created: "Creditnota aangemaakt",
  existing: "Creditnota bestond al",
};

/** Keert precies het oorspronkelijke bedrag om, in hele centen. */
export function creditAmounts(priceExVat: string | number, vatRate: number) {
  const netCents = toCents(priceExVat);
  const vatCents = Math.round(netCents * vatRate);
  return {
    netCents,
    vatCents,
    grossCents: netCents + vatCents,
    net: centsToAmount(netCents),
    vat: centsToAmount(vatCents),
    gross: centsToAmount(netCents + vatCents),
  };
}

/** Nog te betalen: factuurtotaal minus verrekende credits, nooit negatief. */
export function amountDueCents(
  totalIncVat: string | number,
  creditAppliedIncVat: string | number = 0,
): number {
  return Math.max(0, toCents(totalIncVat) - toCents(creditAppliedIncVat));
}

/** Openstaand tegoed van een bedrijf: som van nog niet verrekende credits. */
export function openCreditCents(
  notes: Array<{ status: CreditNoteStatus; total_inc_vat: string | number }>,
): number {
  return notes
    .filter((n) => n.status === "open")
    .reduce((sum, n) => sum + toCents(n.total_inc_vat), 0);
}
