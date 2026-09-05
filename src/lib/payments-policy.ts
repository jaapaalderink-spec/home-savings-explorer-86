/**
 * Zuivere betaallogica (geen database, geen netwerk) zodat de regels rond
 * status, bedragen en hergebruik van betaalpogingen testbaar zijn.
 */

export type PaymentStatus = "open" | "pending" | "paid" | "failed" | "expired" | "canceled";
export type InvoiceStatus =
  "draft" | "issued" | "open" | "paid" | "overdue" | "cancelled" | "credited";

/** Statussen waarbij nog op de klant of de bank gewacht wordt. */
export const ACTIVE_STATUSES: PaymentStatus[] = ["open", "pending"];

/** Statussen waarna een nieuwe poging mag. */
export const RETRYABLE_STATUSES: PaymentStatus[] = ["failed", "expired", "canceled"];

/**
 * Mollie-status → interne betaalstatus. Alles wat we niet kennen behandelen we
 * als "pending": nooit als betaald.
 */
export function mapMollieStatus(status: string): PaymentStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "open":
      return "open";
    case "pending":
    case "authorized":
      return "pending";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "pending";
  }
}

/** Eén gezaghebbende afbeelding van betaalstatus op factuurstatus. */
export function invoiceStatusFor(payment: PaymentStatus, current: InvoiceStatus): InvoiceStatus {
  if (current === "cancelled" || current === "credited") return current;
  if (payment === "paid") return "paid";
  if (current === "paid") return "paid"; // een betaalde factuur wordt nooit teruggedraaid
  return "open";
}

/** Bedragen in hele centen; nooit rekenen met floats. */
export function toCents(amount: string | number): number {
  const text = typeof amount === "number" ? amount.toFixed(2) : amount.trim();
  const match = /^-?\d+(\.\d{1,2})?$/.exec(text);
  if (!match) throw new Error("INVALID_AMOUNT");
  const negative = text.startsWith("-");
  const [whole, frac = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** Centen naar het tekstformaat dat Mollie verwacht ("249.00"). */
export function centsToAmount(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type VerificationInput = {
  currency: string;
  amountValue: string;
  expectedCents: number;
  metadataInvoiceId?: string | null;
  invoiceId: string;
};

export type Verification = { ok: true } | { ok: false; reason: string };

/**
 * Controleert of een bij Mollie opgehaalde betaling écht bij deze factuur en
 * dit bedrag hoort. Bij twijfel nooit als betaald verwerken.
 */
export function verifyMolliePayment(input: VerificationInput): Verification {
  if (input.currency !== "EUR") return { ok: false, reason: "currency_mismatch" };
  let cents: number;
  try {
    cents = toCents(input.amountValue);
  } catch {
    return { ok: false, reason: "invalid_amount" };
  }
  if (cents !== input.expectedCents) return { ok: false, reason: "amount_mismatch" };
  if (input.metadataInvoiceId && input.metadataInvoiceId !== input.invoiceId) {
    return { ok: false, reason: "invoice_mismatch" };
  }
  return { ok: true };
}

/**
 * Mag er een nieuwe betaalpoging gestart worden?
 * - factuur al betaald of gecrediteerd → nee
 * - lopende poging (open/pending) → hergebruiken
 * - mislukt/verlopen/geannuleerd of geen poging → nieuwe poging
 */
export function paymentAction(input: {
  invoiceStatus: InvoiceStatus;
  totalCents: number;
  existing?: { status: PaymentStatus; checkoutUrl?: string | null } | undefined;
}): { action: "reuse" | "create" | "blocked"; reason?: string } {
  if (input.invoiceStatus === "paid") return { action: "blocked", reason: "already_paid" };
  if (input.invoiceStatus === "cancelled" || input.invoiceStatus === "credited") {
    return { action: "blocked", reason: "invoice_not_payable" };
  }
  if (input.totalCents <= 0) return { action: "blocked", reason: "zero_amount" };
  const existing = input.existing;
  if (existing && ACTIVE_STATUSES.includes(existing.status) && existing.checkoutUrl) {
    return { action: "reuse" };
  }
  return { action: "create" };
}

/** Nederlandse labels voor de interface. */
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  open: "Openstaand",
  pending: "In verwerking",
  paid: "Betaald",
  failed: "Mislukt",
  expired: "Verlopen",
  canceled: "Geannuleerd",
};
