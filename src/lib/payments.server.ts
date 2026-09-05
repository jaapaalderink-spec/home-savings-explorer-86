/**
 * Databaselogica rond facturen en betalingen. Alleen server-side; de
 * betaalstatus van een factuur wordt uitsluitend hier bijgewerkt, na
 * bevestiging door Mollie zelf.
 */
import { adminDb } from "@/lib/partner-util";
import { createMolliePayment, getMolliePayment, type MolliePayment } from "@/lib/mollie.server";
import {
  centsToAmount,
  invoiceStatusFor,
  mapMollieStatus,
  paymentAction,
  toCents,
  verifyMolliePayment,
  type InvoiceStatus,
  type PaymentStatus,
} from "@/lib/payments-policy";

type InvoiceRow = {
  id: string;
  company_id: string;
  invoice_number: string;
  total_inc_vat: number | string;
  status: string;
  payment_status: string;
  paid_at: string | null;
};

/** Technische logregel; nooit sleutels of bankgegevens. */
function logStatus(context: {
  invoiceId: string;
  paymentId: string;
  from: string;
  to: string;
  note?: string;
}) {
  console.log(
    `[payments] invoice=${context.invoiceId} payment=${context.paymentId} ${context.from} -> ${context.to}${
      context.note ? ` (${context.note})` : ""
    } at ${new Date().toISOString()}`,
  );
}

async function loadInvoice(invoiceId: string): Promise<InvoiceRow | null> {
  const db = await adminDb();
  const { data } = await db
    .from("invoices")
    .select("id, company_id, invoice_number, total_inc_vat, status, payment_status, paid_at")
    .eq("id", invoiceId)
    .maybeSingle();
  return (data as InvoiceRow | null) ?? null;
}

async function latestPayment(invoiceId: string) {
  const db = await adminDb();
  const { data } = await db
    .from("payments")
    .select("id, provider_payment_id, status, checkout_url, amount")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * Start of hervat een betaling voor een factuur.
 * Hergebruik: een openstaande of nog verwerkende poging levert dezelfde
 * betaallink op, zodat herhaald klikken geen extra betalingen aanmaakt.
 */
export async function startInvoicePayment(input: {
  invoiceId: string;
  origin: string;
}): Promise<{ status: PaymentStatus; checkoutUrl: string | null; reused: boolean }> {
  const db = await adminDb();
  const invoice = await loadInvoice(input.invoiceId);
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");

  const totalCents = toCents(String(invoice.total_inc_vat));
  const existing = await latestPayment(invoice.id);
  const decision = paymentAction({
    invoiceStatus: invoice.status as InvoiceStatus,
    totalCents,
    existing: existing
      ? { status: existing.status as PaymentStatus, checkoutUrl: existing.checkout_url }
      : undefined,
  });

  if (decision.action === "blocked") throw new Error(decision.reason ?? "PAYMENT_BLOCKED");

  if (decision.action === "reuse" && existing) {
    // Ook bij hergebruik halen we de echte status op: Mollie is leidend.
    const refreshed = await syncPayment(existing.provider_payment_id);
    if (refreshed.status === "open" || refreshed.status === "pending") {
      return { status: refreshed.status, checkoutUrl: existing.checkout_url, reused: true };
    }
    if (refreshed.status === "paid") return { status: "paid", checkoutUrl: null, reused: true };
  }

  const origin = input.origin.replace(/\/$/, "");
  const mollie = await createMolliePayment({
    amountValue: centsToAmount(totalCents),
    description: `Factuur ${invoice.invoice_number}`,
    redirectUrl: `${origin}/facturen?invoice=${invoice.id}`,
    webhookUrl: `${origin}/api/public/mollie-webhook`,
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
  });

  const status = mapMollieStatus(mollie.status);
  const checkoutUrl = mollie._links?.checkout?.href ?? null;

  const { data: row } = await db
    .from("payments")
    .upsert(
      {
        invoice_id: invoice.id,
        company_id: invoice.company_id,
        provider: "mollie",
        provider_payment_id: mollie.id,
        status,
        amount: Number(centsToAmount(totalCents)),
        currency: "EUR",
        checkout_url: checkoutUrl,
        expires_at: mollie.expiresAt ?? null,
      },
      { onConflict: "provider,provider_payment_id" },
    )
    .select("id")
    .single();

  await db
    .from("invoices")
    .update({
      payment_status: status,
      active_payment_id: row?.id ?? null,
      last_payment_attempt_at: new Date().toISOString(),
      status: invoiceStatusFor(status, invoice.status as InvoiceStatus),
    })
    .eq("id", invoice.id);

  logStatus({ invoiceId: invoice.id, paymentId: mollie.id, from: "-", to: status, note: "created" });
  return { status, checkoutUrl, reused: false };
}

/**
 * Haalt de betaling op bij Mollie en werkt de lokale status bij.
 * Idempotent: dezelfde status meerdere keren verwerken verandert niets meer,
 * en paid_at wordt maar één keer gezet.
 */
export async function syncPayment(
  providerPaymentId: string,
): Promise<{ status: PaymentStatus; invoiceId: string | null; note?: string }> {
  const db = await adminDb();
  const { data: payment } = await db
    .from("payments")
    .select("id, invoice_id, status, amount, paid_at")
    .eq("provider", "mollie")
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();

  if (!payment) {
    console.warn(`[payments] onbekende betaling ${providerPaymentId}`);
    return { status: "pending", invoiceId: null, note: "unknown_payment" };
  }

  let mollie: MolliePayment;
  try {
    mollie = await getMolliePayment(providerPaymentId);
  } catch (error) {
    console.error(`[payments] ophalen mislukt ${providerPaymentId}: ${(error as Error).message}`);
    return { status: payment.status as PaymentStatus, invoiceId: payment.invoice_id };
  }

  const invoice = await loadInvoice(payment.invoice_id);
  if (!invoice) return { status: payment.status as PaymentStatus, invoiceId: payment.invoice_id };

  const mapped = mapMollieStatus(mollie.status);
  const check = verifyMolliePayment({
    currency: mollie.amount?.currency ?? "",
    amountValue: mollie.amount?.value ?? "",
    expectedCents: toCents(String(invoice.total_inc_vat)),
    metadataInvoiceId: (mollie.metadata?.["invoiceId"] as string | undefined) ?? null,
    invoiceId: invoice.id,
  });

  if (!check.ok) {
    await db
      .from("payments")
      .update({ amount_mismatch: true, metadata: { verification: check.reason } })
      .eq("id", payment.id);
    await db.from("invoices").update({ payment_review_required: true }).eq("id", invoice.id);
    logStatus({
      invoiceId: invoice.id,
      paymentId: providerPaymentId,
      from: payment.status,
      to: "review",
      note: check.reason,
    });
    return { status: payment.status as PaymentStatus, invoiceId: invoice.id, note: check.reason };
  }

  const paidAt = mapped === "paid" ? (payment.paid_at ?? mollie.paidAt ?? new Date().toISOString()) : null;

  await db
    .from("payments")
    .update({
      status: mapped,
      ...(paidAt ? { paid_at: paidAt } : {}),
      ...(mapped === "failed" || mapped === "canceled" || mapped === "expired"
        ? { failed_at: mollie.failedAt ?? mollie.canceledAt ?? new Date().toISOString() }
        : {}),
    })
    .eq("id", payment.id);

  const nextInvoiceStatus = invoiceStatusFor(mapped, invoice.status as InvoiceStatus);
  await db
    .from("invoices")
    .update({
      payment_status: invoice.payment_status === "paid" ? "paid" : mapped,
      status: nextInvoiceStatus,
      ...(mapped === "paid" ? { paid_at: invoice.paid_at ?? paidAt } : {}),
    })
    .eq("id", invoice.id);

  if (payment.status !== mapped) {
    logStatus({
      invoiceId: invoice.id,
      paymentId: providerPaymentId,
      from: payment.status,
      to: mapped,
    });
  }

  return { status: mapped, invoiceId: invoice.id };
}

/** Webhookverwerking: alleen het betaalkenmerk uit de body wordt gebruikt. */
export async function processMollieWebhook(paymentId: string) {
  if (!/^tr_[A-Za-z0-9]+$/.test(paymentId)) return { ok: false, reason: "malformed_id" };
  const result = await syncPayment(paymentId);
  return { ok: true, status: result.status };
}

/** Betaalgegevens van één factuur voor de interface. */
export async function invoicePaymentState(invoiceId: string) {
  const db = await adminDb();
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  const { data: payments } = await db
    .from("payments")
    .select("provider_payment_id, status, amount, checkout_url, paid_at, created_at")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: false });
  return {
    invoiceId,
    companyId: invoice.company_id,
    invoiceStatus: invoice.status,
    paymentStatus: invoice.payment_status,
    paidAt: invoice.paid_at,
    attempts: payments ?? [],
  };
}
