/**
 * Integratietests voor de betaalflow tegen de echte database, met een
 * nagebootste Mollie-API (er worden dus nooit echte betalingen gedaan).
 * Zonder SUPABASE_DB_URL worden ze overgeslagen.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "pg";

const DB_URL = process.env["SUPABASE_DB_URL"];
const suite = DB_URL && process.env["SUPABASE_URL"] ? describe : describe.skip;

const mollieState: {
  payments: Record<
    string,
    { status: string; value: string; currency: string; metadata?: Record<string, unknown> }
  >;
  created: number;
} = { payments: {}, created: 0 };

vi.mock("@/lib/mollie.server", () => ({
  mollieConfigured: () => true,
  createMolliePayment: vi.fn(
    async (input: { amountValue: string; invoiceId: string; invoiceNumber: string }) => {
      mollieState.created += 1;
      const id = `tr_test${mollieState.created}${Date.now().toString(36)}`;
      mollieState.payments[id] = {
        status: "open",
        value: input.amountValue,
        currency: "EUR",
        metadata: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
      };
      return {
        id,
        status: "open",
        amount: { value: input.amountValue, currency: "EUR" },
        metadata: mollieState.payments[id]!.metadata,
        _links: { checkout: { href: `https://pay.test/${id}` } },
      };
    },
  ),
  getMolliePayment: vi.fn(async (id: string) => {
    const p = mollieState.payments[id];
    if (!p) throw new Error("MOLLIE_PAYMENT_NOT_FOUND");
    return {
      id,
      status: p.status,
      amount: { value: p.value, currency: p.currency },
      metadata: p.metadata ?? null,
      paidAt: p.status === "paid" ? "2026-09-01T10:00:00.000Z" : null,
    };
  }),
}));

let admin: Client;
const created: { companies: string[]; invoices: string[] } = { companies: [], invoices: [] };

async function makeInvoice(total = "301.35", status = "issued") {
  const { rows: c } = await admin.query(`INSERT INTO companies (name) VALUES ($1) RETURNING id`, [
    `PayTest ${crypto.randomUUID().slice(0, 8)}`,
  ]);
  const companyId = c[0].id as string;
  created.companies.push(companyId);
  const { rows: i } = await admin.query(
    `INSERT INTO invoices (company_id, invoice_number, period_start, period_end,
                           subtotal_ex_vat, vat_amount, total_inc_vat, status)
     VALUES ($1, $2, '2026-08-01', '2026-08-31', 249, 52.29, $3, $4) RETURNING id`,
    [companyId, `T-${crypto.randomUUID().slice(0, 8)}`, total, status],
  );
  const invoiceId = i[0].id as string;
  created.invoices.push(invoiceId);
  return { companyId, invoiceId };
}

async function invoiceRow(id: string) {
  const { rows } = await admin.query(
    `SELECT status, payment_status, paid_at, payment_review_required FROM invoices WHERE id = $1`,
    [id],
  );
  return rows[0] as {
    status: string;
    payment_status: string;
    paid_at: string | null;
    payment_review_required: boolean;
  };
}

async function paymentCount(invoiceId: string) {
  const { rows } = await admin.query(
    `SELECT count(*)::int AS n FROM payments WHERE invoice_id = $1`,
    [invoiceId],
  );
  return rows[0].n as number;
}

suite("betalingen (echte database, nagebootste Mollie)", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await admin.connect();
  });

  afterAll(async () => {
    if (created.invoices.length)
      await admin.query(`DELETE FROM invoices WHERE id = ANY($1::uuid[])`, [created.invoices]);
    if (created.companies.length)
      await admin.query(`DELETE FROM companies WHERE id = ANY($1::uuid[])`, [created.companies]);
    await admin.end();
  });

  beforeEach(() => {
    mollieState.payments = {};
  });

  it("het bedrag komt uit de database, niet uit de browser", async () => {
    const { startInvoicePayment } = await import("@/lib/payments.server");
    const { createMolliePayment } = await import("@/lib/mollie.server");
    const { invoiceId } = await makeInvoice("301.35");
    await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const call = (createMolliePayment as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(
      -1,
    )?.[0] as { amountValue: string };
    expect(call.amountValue).toBe("301.35");
  });

  it("herhaald betalen hergebruikt dezelfde betaalpoging", async () => {
    const { startInvoicePayment } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const second = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    expect(second.reused).toBe(true);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(await paymentCount(invoiceId)).toBe(1);
  });

  it("een mislukte poging mag opnieuw geprobeerd worden", async () => {
    const { startInvoicePayment, processMollieWebhook } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const id = first.checkoutUrl!.split("/").pop()!;
    mollieState.payments[id]!.status = "failed";
    await processMollieWebhook(id);
    expect((await invoiceRow(invoiceId)).payment_status).toBe("failed");

    const retry = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    expect(retry.reused).toBe(false);
    expect(await paymentCount(invoiceId)).toBe(2);
  });

  it("een betaalde factuur kan geen nieuwe betaling starten", async () => {
    const { startInvoicePayment, processMollieWebhook } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const id = first.checkoutUrl!.split("/").pop()!;
    mollieState.payments[id]!.status = "paid";
    await processMollieWebhook(id);

    const row = await invoiceRow(invoiceId);
    expect(row.payment_status).toBe("paid");
    expect(row.status).toBe("paid");
    expect(row.paid_at).not.toBeNull();
    await expect(startInvoicePayment({ invoiceId, origin: "https://app.test" })).rejects.toThrow(
      "already_paid",
    );
  });

  it("dezelfde betaalde webhook meerdere keren verwerken verandert niets", async () => {
    const { startInvoicePayment, processMollieWebhook } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const id = first.checkoutUrl!.split("/").pop()!;
    mollieState.payments[id]!.status = "paid";
    await processMollieWebhook(id);
    const after = await invoiceRow(invoiceId);
    for (let i = 0; i < 4; i++) await processMollieWebhook(id);
    const later = await invoiceRow(invoiceId);
    expect(later.paid_at).toBe(after.paid_at);
    expect(later.payment_status).toBe("paid");
    expect(await paymentCount(invoiceId)).toBe(1);
  });

  it("een afwijkend bedrag zet de factuur niet op betaald", async () => {
    const { startInvoicePayment, processMollieWebhook } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const id = first.checkoutUrl!.split("/").pop()!;
    mollieState.payments[id] = { status: "paid", value: "1.00", currency: "EUR" };
    await processMollieWebhook(id);
    const row = await invoiceRow(invoiceId);
    expect(row.payment_status).not.toBe("paid");
    expect(row.payment_review_required).toBe(true);
  });

  it("een andere valuta zet de factuur niet op betaald", async () => {
    const { startInvoicePayment, processMollieWebhook } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const id = first.checkoutUrl!.split("/").pop()!;
    mollieState.payments[id] = { status: "paid", value: "301.35", currency: "USD" };
    await processMollieWebhook(id);
    expect((await invoiceRow(invoiceId)).payment_status).not.toBe("paid");
  });

  it("de webhook gelooft de body niet, maar haalt de status op bij Mollie", async () => {
    const { startInvoicePayment, processMollieWebhook } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const id = first.checkoutUrl!.split("/").pop()!;
    mollieState.payments[id]!.status = "open"; // Mollie zegt: nog niet betaald
    await processMollieWebhook(id);
    expect((await invoiceRow(invoiceId)).payment_status).toBe("open");
  });

  it("een verlopen betaling zet de factuur niet op betaald", async () => {
    const { startInvoicePayment, processMollieWebhook } = await import("@/lib/payments.server");
    const { invoiceId } = await makeInvoice();
    const first = await startInvoicePayment({ invoiceId, origin: "https://app.test" });
    const id = first.checkoutUrl!.split("/").pop()!;
    mollieState.payments[id]!.status = "expired";
    await processMollieWebhook(id);
    const row = await invoiceRow(invoiceId);
    expect(row.payment_status).toBe("expired");
    expect(row.status).not.toBe("paid");
  });

  it("een onbekend of misvormd betaalkenmerk wordt veilig afgehandeld", async () => {
    const { processMollieWebhook } = await import("@/lib/payments.server");
    expect(await processMollieWebhook("niet-geldig")).toEqual({
      ok: false,
      reason: "malformed_id",
    });
    expect(await processMollieWebhook("tr_bestaatniet")).toEqual({ ok: true, status: "pending" });
  });
});
