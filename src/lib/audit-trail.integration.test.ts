/**
 * Echte database-integratietests voor de audit trail en de statusgeschiedenis
 * (fase 3C). Zonder SUPABASE_DB_URL worden ze overgeslagen.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

async function makeCompany() {
  const { rows } = await db.query(
    `INSERT INTO companies (name, monthly_lead_limit, categories) VALUES ($1, 0, '{solar}') RETURNING id`,
    [`AuditTest ${crypto.randomUUID().slice(0, 8)}`],
  );
  made.companies.push(rows[0].id);
  return rows[0].id as string;
}

async function makeLead(verified = true) {
  const { rows } = await db.query(
    `INSERT INTO leads (first_name, last_name, email, phone, postcode, region_code, categories,
                        lead_type, max_partners, phone_verified)
     VALUES ('Audit', 'Test', 'audit@example.com', '+31612345688', '9998 ZZ', '98', '{solar}',
             'shared_2', 2, $1) RETURNING id`,
    [verified],
  );
  made.leads.push(rows[0].id);
  return rows[0].id as string;
}

async function makePurchase(companyId: string, price = 50) {
  const leadId = await makeLead();
  const { data, error } = await sb
    .from("lead_purchases")
    .insert({ lead_id: leadId, company_id: companyId, price_ex_vat: price, billable: price > 0 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { purchaseId: data.id as string, leadId };
}

async function events(entityId: string) {
  const { rows } = await db.query(
    `SELECT event_type, source, actor_user_id, metadata, created_at
       FROM audit_events WHERE entity_id = $1 ORDER BY created_at`,
    [entityId],
  );
  return rows as Array<Record<string, unknown>>;
}

async function history(purchaseId: string) {
  const { rows } = await db.query(
    `SELECT from_status, to_status, changed_by, source, note
       FROM lead_purchase_status_history WHERE lead_purchase_id = $1 ORDER BY created_at`,
    [purchaseId],
  );
  return rows as Array<Record<string, unknown>>;
}

async function setStatus(
  purchaseId: string,
  companyId: string,
  status: string,
  actor: string | null = null,
  note: string | null = null,
) {
  const { data, error } = await sb.rpc("set_purchase_status", {
    p_purchase_id: purchaseId,
    p_company_id: companyId,
    p_status: status,
    ...(note ? { p_note: note } : {}),
    ...(actor ? { p_actor: actor } : {}),
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as { result: string; changed: boolean };
}

suite("audit trail en statusgeschiedenis (echte database)", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
  });

  afterAll(async () => {
    if (made.leads.length) {
      await sb.from("lead_purchases").delete().in("lead_id", made.leads);
      await sb.from("leads").delete().in("id", made.leads);
    }
    if (made.invoices.length) await sb.from("invoices").delete().in("id", made.invoices);
    if (made.companies.length) await sb.from("companies").delete().in("id", made.companies);
    await db.end();
  });

  it("1. een nieuwe aanvraag legt LEAD_CREATED vast", async () => {
    const leadId = await makeLead(false);
    const list = await events(leadId);
    expect(list.map((e) => e.event_type)).toContain("LEAD_CREATED");
  });

  it("2. telefoonverificatie legt precies één gebeurtenis vast", async () => {
    const leadId = await makeLead(false);
    await sb.from("leads").update({ phone_verified: true, phone_verified_at: new Date().toISOString() }).eq("id", leadId);
    await sb.from("leads").update({ notes: "nogmaals opslaan" }).eq("id", leadId);
    const list = (await events(leadId)).filter((e) => e.event_type === "PHONE_VERIFIED");
    expect(list).toHaveLength(1);
  });

  it("3. blokkeren en markeren worden apart vastgelegd", async () => {
    const leadId = await makeLead();
    await sb.from("leads").update({ fraud_status: "review", fraud_score: 40 }).eq("id", leadId);
    await sb.from("leads").update({ fraud_status: "blocked", fraud_score: 90 }).eq("id", leadId);
    const types = (await events(leadId)).map((e) => e.event_type);
    expect(types).toContain("LEAD_FLAGGED");
    expect(types).toContain("LEAD_BLOCKED");
  });

  it("4. een toewijzing legt LEAD_ALLOCATED met bedrijf vast", async () => {
    const company = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    const list = await events(purchaseId);
    expect(list[0]?.event_type).toBe("LEAD_ALLOCATED");
    const { rows } = await db.query(
      `SELECT actor_company_id FROM audit_events WHERE entity_id = $1 LIMIT 1`,
      [purchaseId],
    );
    expect(rows[0].actor_company_id).toBe(company);
  });

  it("5. een statuswijziging schrijft geschiedenis én gebeurtenis met actor", async () => {
    const company = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    const actor = crypto.randomUUID();
    const res = await setStatus(purchaseId, company, "contacted", actor, "gebeld");
    expect(res).toMatchObject({ result: "updated", changed: true });

    const h = await history(purchaseId);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ from_status: "new", to_status: "contacted", changed_by: actor, note: "gebeld" });

    const types = (await events(purchaseId)).map((e) => e.event_type);
    expect(types).toContain("LEAD_STATUS_CHANGED");
  });

  it("6. dezelfde status opnieuw zetten geeft geen historieregel", async () => {
    const company = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    const res = await setStatus(purchaseId, company, "new");
    expect(res).toMatchObject({ result: "unchanged", changed: false });
    expect(await history(purchaseId)).toHaveLength(0);
  });

  it("7. een lead van een ander bedrijf kan niet bijgewerkt worden", async () => {
    const company = await makeCompany();
    const other = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    const res = await setStatus(purchaseId, other, "contacted");
    expect(res.result).toBe("not_found");
    expect(await history(purchaseId)).toHaveLength(0);
  });

  it("8. eerste keer openen telt één keer, daarna niet meer", async () => {
    const company = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    const first = await sb.rpc("mark_purchase_opened", {
      p_purchase_id: purchaseId,
      p_company_id: company,
    });
    const second = await sb.rpc("mark_purchase_opened", {
      p_purchase_id: purchaseId,
      p_company_id: company,
    });
    expect(first.data).toBe(true);
    expect(second.data).toBe(false);
    const opened = (await events(purchaseId)).filter((e) => e.event_type === "LEAD_OPENED");
    expect(opened).toHaveLength(1);
  });

  it("9. eerste contact legt de SLA-uitkomst van de database vast", async () => {
    const company = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    await setStatus(purchaseId, company, "contacted");
    const contacted = (await events(purchaseId)).filter((e) => e.event_type === "LEAD_CONTACTED");
    expect(contacted).toHaveLength(1);
    const meta = contacted[0].metadata as Record<string, unknown>;
    expect(meta["within_24h"]).toBe(true);
    expect(meta["response_score"]).toBe(100);
  });

  it("10. geschiedenis kan niet gewijzigd of verwijderd worden", async () => {
    const company = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    await setStatus(purchaseId, company, "contacted");
    const upd = await sb
      .from("lead_purchase_status_history")
      .update({ to_status: "won" })
      .eq("lead_purchase_id", purchaseId);
    expect(upd.error?.message ?? "").toMatch(/AUDIT_APPEND_ONLY/);
    const del = await sb.from("audit_events").delete().eq("entity_id", purchaseId);
    expect(del.error?.message ?? "").toMatch(/AUDIT_APPEND_ONLY/);
  });

  it("11. bedrijfsgegevens en commerciële instellingen worden apart vastgelegd", async () => {
    const company = await makeCompany();
    const actor = crypto.randomUUID();
    await sb.rpc("update_company_profile_audited", {
      p_company_id: company,
      p_actor: actor,
      p_name: "Nieuwe naam BV",
      p_billing_email: "facturen@example.com",
    });
    const commercialRes = await sb.rpc("update_company_commercial", {
      p_company_id: company,
      p_actor: actor,
      p_monthly_lead_limit: 25,
      p_active: false,
    });
    expect(commercialRes.error).toBeNull();
    const list = await events(company);
    const types = list.map((e) => e.event_type);
    expect(types).toContain("COMPANY_PROFILE_UPDATED");
    expect(types).toContain("COMPANY_COMMERCIAL_SETTINGS_UPDATED");
    expect(types).toContain("COMPANY_DEACTIVATED");
    const profile = list.find((e) => e.event_type === "COMPANY_PROFILE_UPDATED");
    expect(profile?.source).toBe("partner");
    const commercial = list.find((e) => e.event_type === "COMPANY_COMMERCIAL_SETTINGS_UPDATED");
    expect(commercial?.source).toBe("admin");
  });

  it("12. de volledige tijdlijn staat in de juiste volgorde", async () => {
    const company = await makeCompany();
    const { purchaseId } = await makePurchase(company);
    await sb.rpc("mark_purchase_opened", { p_purchase_id: purchaseId, p_company_id: company });
    await setStatus(purchaseId, company, "contacted");
    await setStatus(purchaseId, company, "quoted");
    await setStatus(purchaseId, company, "won");
    const types = (await events(purchaseId)).map((e) => e.event_type);
    expect(types.indexOf("LEAD_ALLOCATED")).toBe(0);
    expect(types.filter((t) => t === "LEAD_STATUS_CHANGED")).toHaveLength(3);
    const h = await history(purchaseId);
    expect(h.map((r) => r.to_status)).toEqual(["contacted", "quoted", "won"]);
  });
});
