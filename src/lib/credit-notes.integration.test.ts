/**
 * Echte database-integratietests voor creditnota's bij goedgekeurde
 * reclamaties. Zonder SUPABASE_DB_URL worden ze overgeslagen.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const DB_URL = process.env["SUPABASE_DB_URL"];
const SB_URL = process.env["SUPABASE_URL"];
const SB_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const suite = DB_URL && SB_URL && SB_KEY ? describe : describe.skip;

const sb = createClient(SB_URL ?? "http://localhost", SB_KEY ?? "none", {
  auth: { persistSession: false },
});

let db: Client;
const made = { companies: [] as string[], leads: [] as string[], invoices: [] as string[] };

function anonClient() {
  const key =
    process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
    (() => {
      try {
        return /VITE_SUPABASE_PUBLISHABLE_KEY=(.+)/.exec(readFileSync(".env", "utf8"))?.[1]?.trim();
      } catch {
        return undefined;
      }
    })();
  if (!SB_URL || !key) return null;
  return createClient(SB_URL, key, { auth: { persistSession: false } });
}

async function makeCompany() {
  const { rows } = await db.query(
    `INSERT INTO companies (name, monthly_lead_limit, categories) VALUES ($1, 0, '{solar}') RETURNING id`,
    [`CNTest ${crypto.randomUUID().slice(0, 8)}`],
  );
  made.companies.push(rows[0].id);
  return rows[0].id as string;
}

async function makeLead() {
  const { rows } = await db.query(
    `INSERT INTO leads (first_name, last_name, email, phone, postcode, region_code, categories,
                        lead_type, max_partners, phone_verified)
     VALUES ('Credit', 'Test', 'cn@example.com', '+31612345699', '9999 ZZ', '99', '{solar}',
             'shared_2', 2, true) RETURNING id`,
  );
  made.leads.push(rows[0].id);
  return rows[0].id as string;
}

/** Aankoop met prijs; optioneel als proeflead en/of al gefactureerd. */
async function makePurchase(opts: {
  companyId: string;
  price: number;
  trial?: boolean;
  invoiceId?: string | null;
}) {
  const leadId = await makeLead();
  // Via de serverrol: de aankooptriggers lezen de leadtabel.
  const { data, error } = await sb
    .from("lead_purchases")
    .insert({
      lead_id: leadId,
      company_id: opts.companyId,
      price_ex_vat: opts.price,
      billable: !opts.trial && opts.price > 0,
      is_trial: opts.trial ?? false,
      invoice_id: opts.invoiceId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

let periodSeq = 0;
async function makeInvoice(companyId: string, total: number, paid = false, vatRate = 0.21) {
  const month = String((periodSeq++ % 12) + 1).padStart(2, "0");
  const net = Math.round((total / (1 + vatRate)) * 100) / 100;
  const { data, error } = await sb
    .from("invoices")
    .insert({
      company_id: companyId,
      invoice_number: `CN-T-${crypto.randomUUID().slice(0, 8)}`,
      period_start: `2026-${month}-01`,
      period_end: `2026-${month}-28`,
      due_date: `2026-${month}-28`,
      subtotal_ex_vat: net,
      vat_amount: Math.round((total - net) * 100) / 100,
      total_inc_vat: total,
      status: paid ? "paid" : "issued",
      paid_at: paid ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as string;
  made.invoices.push(id);
  const line = await sb.from("invoice_lines").insert({
    invoice_id: id,
    description: "Leads",
    quantity: 1,
    unit_price_ex_vat: net,
    amount_ex_vat: net,
    vat_rate: vatRate,
  });
  if (line.error) throw new Error(line.error.message);
  return id;
}

async function makeComplaint(purchaseId: string, companyId: string) {
  const { rows } = await db.query(
    `INSERT INTO complaints (purchase_id, company_id, reason) VALUES ($1, $2, 'unreachable') RETURNING id`,
    [purchaseId, companyId],
  );
  return rows[0].id as string;
}

async function review(complaintId: string, approve = true) {
  const { data, error } = await sb.rpc("review_complaint_with_credit", {
    p_complaint_id: complaintId,
    p_approve: approve,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as {
    result: string;
    credit_note_id: string | null;
    credit_number: string | null;
    total_inc_vat: string | null;
    credit_ex_vat: string | null;
  };
}

async function creditNotes(complaintId: string) {
  const { rows } = await db.query(`SELECT * FROM credit_notes WHERE complaint_id = $1`, [
    complaintId,
  ]);
  return rows as Array<Record<string, string>>;
}

async function invoiceRow(id: string) {
  const { rows } = await db.query(
    `SELECT total_inc_vat, credit_applied_inc_vat, amount_due_inc_vat, status FROM invoices WHERE id = $1`,
    [id],
  );
  return rows[0] as Record<string, string>;
}

suite("creditnota's (echte database)", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
  });

  afterAll(async () => {
    if (made.leads.length) {
      await sb.from("lead_purchases").delete().in("lead_id", made.leads);
      await sb.from("leads").delete().in("id", made.leads);
    }
    if (made.invoices.length) {
      await sb.from("invoices").update({ active_payment_id: null }).in("id", made.invoices);
      await sb.from("invoices").delete().in("id", made.invoices);
    }
    if (made.companies.length) await sb.from("companies").delete().in("id", made.companies);
    await db.end();
  });

  it("1. een goedgekeurde klacht over een proeflead geeft geen creditnota", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const purchase = await makePurchase({
      companyId: company,
      price: 0,
      trial: true,
      invoiceId: invoice,
    });
    const complaint = await makeComplaint(purchase, company);
    const res = await review(complaint);
    expect(res.result).toBe("no_credit_required");
    expect(Number(res.credit_ex_vat)).toBe(0);
    expect(await creditNotes(complaint)).toHaveLength(0);
  });

  it("2. een nog niet gefactureerde lead wordt alleen niet-factureerbaar", async () => {
    const company = await makeCompany();
    const purchase = await makePurchase({ companyId: company, price: 50 });
    const complaint = await makeComplaint(purchase, company);
    const res = await review(complaint);
    expect(res.result).toBe("excluded_before_invoice");
    expect(await creditNotes(complaint)).toHaveLength(0);
    const { rows } = await db.query(`SELECT billable, credited FROM lead_purchases WHERE id = $1`, [
      purchase,
    ]);
    expect(rows[0]).toMatchObject({ billable: false, credited: true });
  });

  it("3+4+5+6. een gefactureerde lead krijgt een creditnota die het bedrag exact omkeert", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const before = await invoiceRow(invoice);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    const res = await review(complaint);

    expect(res.result).toBe("credit_note_created");
    expect(res.credit_number).toMatch(/^CN-\d{4}-\d{6}$/);
    const [note] = await creditNotes(complaint);
    expect(Number(note!["subtotal_ex_vat"])).toBe(50);
    expect(Number(note!["vat_amount"])).toBe(10.5);
    expect(Number(note!["total_inc_vat"])).toBe(60.5);
    expect(Number(note!["vat_rate"])).toBe(0.21);

    const after = await invoiceRow(invoice);
    // De oorspronkelijke factuur zelf blijft ongewijzigd.
    expect(after["total_inc_vat"]).toBe(before["total_inc_vat"]);
    const { rows: lines } = await db.query(
      `SELECT count(*)::int AS n FROM invoice_lines WHERE invoice_id = $1`,
      [invoice],
    );
    expect(lines[0].n).toBe(1);
  });

  it("6b. het btw-percentage van de oorspronkelijke factuur wordt gevolgd", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 109, false, 0.09);
    const purchase = await makePurchase({ companyId: company, price: 100, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    await review(complaint);
    const [note] = await creditNotes(complaint);
    expect(Number(note!["vat_rate"])).toBe(0.09);
    expect(Number(note!["vat_amount"])).toBe(9);
    expect(Number(note!["total_inc_vat"])).toBe(109);
  });

  it("7. tweemaal goedkeuren maakt geen tweede creditnota", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    const first = await review(complaint);
    const second = await review(complaint);
    expect(second.result).toBe("existing");
    expect(second.credit_number).toBe(first.credit_number);
    expect(await creditNotes(complaint)).toHaveLength(1);
  });

  it("8. een afgewezen klacht geeft geen credit", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    const res = await review(complaint, false);
    expect(res.result).toBe("rejected");
    expect(await creditNotes(complaint)).toHaveLength(0);
    const { rows } = await db.query(`SELECT credit_ex_vat, status FROM complaints WHERE id = $1`, [
      complaint,
    ]);
    expect(Number(rows[0].credit_ex_vat)).toBe(0);
    expect(rows[0].status).toBe("rejected");
  });

  it("9+10. partners kunnen geen creditnota aanmaken of het bedrag wijzigen", async () => {
    const anon = anonClient();
    if (!anon) return;
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    await review(complaint);

    const insert = await anon.from("credit_notes").insert({
      credit_number: "CN-9999-000001",
      company_id: company,
      complaint_id: complaint,
      subtotal_ex_vat: 999,
      vat_amount: 0,
      total_inc_vat: 999,
    });
    expect(insert.error).not.toBeNull();

    // Wijzigen raakt niets: er is geen wijzigingsrecht, het bedrag blijft staan.
    await anon.from("credit_notes").update({ total_inc_vat: 1 }).eq("complaint_id", complaint);
    const [unchanged] = await creditNotes(complaint);
    expect(Number(unchanged!["total_inc_vat"])).toBe(60.5);

    const rpc = await anon.rpc("review_complaint_with_credit", {
      p_complaint_id: complaint,
      p_approve: true,
    });
    expect(rpc.error).not.toBeNull();
  });

  it("11. bij een al betaalde factuur ontstaat een openstaand tegoed", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121, true);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    await review(complaint);
    const [note] = await creditNotes(complaint);
    expect(note!["status"]).toBe("open");
    const inv = await invoiceRow(invoice);
    expect(Number(inv["credit_applied_inc_vat"])).toBe(0);
    expect(inv["status"]).toBe("paid");
  });

  it("12+14. bij een onbetaalde factuur daalt het te betalen bedrag", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    await review(complaint);
    const inv = await invoiceRow(invoice);
    expect(Number(inv["credit_applied_inc_vat"])).toBe(60.5);
    expect(Number(inv["amount_due_inc_vat"])).toBe(60.5);
    expect(Number(inv["total_inc_vat"])).toBe(121);
  });

  it("13. een openstaand tegoed wordt verrekend met een volgende factuur", async () => {
    const company = await makeCompany();
    const paidInvoice = await makeInvoice(company, 121, true);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: paidInvoice });
    const complaint = await makeComplaint(purchase, company);
    await review(complaint);

    const nextInvoice = await makeInvoice(company, 242);
    const { data, error } = await sb.rpc("apply_open_credits", {
      p_company_id: company,
      p_invoice_id: nextInvoice,
    });
    expect(error).toBeNull();
    expect(Number(data)).toBe(60.5);
    const inv = await invoiceRow(nextInvoice);
    expect(Number(inv["amount_due_inc_vat"])).toBe(181.5);
    const [note] = await creditNotes(complaint);
    expect(note!["status"]).toBe("applied");
  });

  it("15. de historische inhaalslag maakt geen dubbele creditnota's", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);
    await review(complaint);
    for (let i = 0; i < 3; i++) {
      const { error } = await sb.rpc("ensure_credit_note_for_complaint", {
        p_complaint_id: complaint,
      });
      expect(error).toBeNull();
    }
    expect(await creditNotes(complaint)).toHaveLength(1);
  });

  it("16. gelijktijdig goedkeuren levert precies één creditnota", async () => {
    const company = await makeCompany();
    const invoice = await makeInvoice(company, 121);
    const purchase = await makePurchase({ companyId: company, price: 50, invoiceId: invoice });
    const complaint = await makeComplaint(purchase, company);

    const results = await Promise.all([
      review(complaint),
      review(complaint),
      review(complaint),
      review(complaint),
    ]);
    const notes = await creditNotes(complaint);
    expect(notes).toHaveLength(1);
    expect(results.filter((r) => r.result === "credit_note_created")).toHaveLength(1);
    const inv = await invoiceRow(invoice);
    // Ook het verrekende bedrag wordt maar één keer geteld.
    expect(Number(inv["credit_applied_inc_vat"])).toBe(60.5);
  });
});
