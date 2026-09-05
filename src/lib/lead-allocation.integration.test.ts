/**
 * Echte database-integratietests voor allocate_lead_to_company.
 *
 * Deze tests praten met de echte Postgres-database via SUPABASE_DB_URL en
 * openen meerdere gelijktijdige verbindingen om race conditions af te dwingen.
 * Zonder SUPABASE_DB_URL worden ze overgeslagen.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const DB_URL = process.env["SUPABASE_DB_URL"];
const SB_URL = process.env["SUPABASE_URL"];
const SB_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const suite = DB_URL && SB_URL && SB_KEY ? describe : describe.skip;

/**
 * De toewijzingsfunctie is alleen uitvoerbaar door de serverrol, dus roepen we
 * hem hier aan zoals de app dat doet: via de Data API met de serverrol-sleutel.
 * Elke aanroep is een eigen databasetransactie, dus Promise.all levert echte
 * gelijktijdigheid op.
 */
const sb = createClient(SB_URL ?? "http://localhost", SB_KEY ?? "none", {
  auth: { persistSession: false },
});

type Ctx = {
  admin: Client;
  companies: string[];
  leads: string[];
};

const ctx: Ctx = { admin: null as unknown as Client, companies: [], leads: [] };

async function connect() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

/** Bedrijf met werkgebied 99 en één actieve categorie. */
async function createCompany(monthlyMax = 10, active = true) {
  const { rows } = await ctx.admin.query(
    `INSERT INTO companies (name, active, monthly_lead_limit, categories)
     VALUES ($1, $2, 0, '{solar}') RETURNING id`,
    [`ITest ${crypto.randomUUID().slice(0, 8)}`, active],
  );
  const id = rows[0].id as string;
  await ctx.admin.query(
    `INSERT INTO company_regions (company_id, region_code) VALUES ($1, '99')`,
    [id],
  );
  await ctx.admin.query(
    `INSERT INTO company_products (company_id, category, active, monthly_max)
     VALUES ($1, 'solar', true, $2)`,
    [id, monthlyMax],
  );
  ctx.companies.push(id);
  return id;
}

async function createLead(opts: { type: "shared_2" | "shared_4"; verified?: boolean }) {
  const max = opts.type === "shared_2" ? 2 : 4;
  const { rows } = await ctx.admin.query(
    `INSERT INTO leads (first_name, last_name, email, phone, postcode, region_code,
                        categories, lead_type, max_partners, phone_verified)
     VALUES ('Test', 'Lead', 'itest@example.com', '+31612345678', '9999 ZZ', '99',
             '{solar}', $1, $2, $3) RETURNING id`,
    [opts.type, max, opts.verified ?? true],
  );
  const id = rows[0].id as string;
  ctx.leads.push(id);
  return id;
}

async function allocate(leadId: string, companyId: string, source = "assigned") {
  const { data, error } = await sb.rpc("allocate_lead_to_company", {
    p_lead_id: leadId,
    p_company_id: companyId,
    p_source: source,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as { result: string };
  return row;
}

async function purchaseCount(leadId: string) {
  const { rows } = await ctx.admin.query(
    `SELECT count(*)::int AS n FROM lead_purchases WHERE lead_id = $1`,
    [leadId],
  );
  return rows[0].n as number;
}

suite("allocate_lead_to_company (echte database)", () => {
  beforeAll(async () => {
    ctx.admin = await connect();
    await ctx.admin.query(
      `INSERT INTO regions (code, name) VALUES ('99', 'Testregio')
       ON CONFLICT (code) DO NOTHING`,
    );
  }, 60_000);

  afterAll(async () => {
    if (!ctx.admin) return;
    if (ctx.leads.length) {
      await ctx.admin.query(`DELETE FROM lead_purchases WHERE lead_id = ANY($1::uuid[])`, [ctx.leads]);
      await ctx.admin.query(`DELETE FROM leads WHERE id = ANY($1::uuid[])`, [ctx.leads]);
    }
    if (ctx.companies.length) {
      await ctx.admin.query(`DELETE FROM company_products WHERE company_id = ANY($1::uuid[])`, [
        ctx.companies,
      ]);
      await ctx.admin.query(`DELETE FROM company_regions WHERE company_id = ANY($1::uuid[])`, [
        ctx.companies,
      ]);
      await ctx.admin.query(`DELETE FROM companies WHERE id = ANY($1::uuid[])`, [ctx.companies]);
    }
    await ctx.admin.end();
  }, 60_000);

  it("shared_2 krijgt nooit meer dan 2 toewijzingen", async () => {
    const lead = await createLead({ type: "shared_2" });
    const companies = [await createCompany(), await createCompany(), await createCompany()];
    const results = [];
    for (const c of companies) results.push((await allocate(lead, c)).result);
    expect(results.filter((r) => r === "allocated")).toHaveLength(2);
    expect(results).toContain("lead_full");
    expect(await purchaseCount(lead)).toBe(2);
  });

  it("shared_4 krijgt nooit meer dan 4 toewijzingen", async () => {
    const lead = await createLead({ type: "shared_4" });
    const companies = [];
    for (let i = 0; i < 5; i++) companies.push(await createCompany());
    const results = [];
    for (const c of companies) results.push((await allocate(lead, c)).result);
    expect(results.filter((r) => r === "allocated")).toHaveLength(4);
    expect(await purchaseCount(lead)).toBe(4);
  });

  it("hetzelfde bedrijf kan dezelfde lead niet twee keer krijgen", async () => {
    const lead = await createLead({ type: "shared_4" });
    const company = await createCompany();
    expect((await allocate(lead, company)).result).toBe("allocated");
    expect((await allocate(lead, company)).result).toBe("already_assigned");
    expect(await purchaseCount(lead)).toBe(1);
  });

  it("een niet-geverifieerde lead kan niet toegewezen worden", async () => {
    const lead = await createLead({ type: "shared_2", verified: false });
    const company = await createCompany();
    expect((await allocate(lead, company)).result).toBe("lead_not_verified");
    expect(await purchaseCount(lead)).toBe(0);
  });

  it("maandcapaciteit per categorie kan niet overschreden worden", async () => {
    const company = await createCompany(1);
    const first = await createLead({ type: "shared_4" });
    const second = await createLead({ type: "shared_4" });
    expect((await allocate(first, company)).result).toBe("allocated");
    expect((await allocate(second, company)).result).toBe("company_capacity_full");
  });

  it("twee gelijktijdige pogingen op de laatste plek leveren één toewijzing", async () => {
    const lead = await createLead({ type: "shared_2" });
    const a = await createCompany();
    const b = await createCompany();
    const c = await createCompany();
    expect((await allocate(lead, a)).result).toBe("allocated");

    const [r1, r2] = await Promise.all([allocate(lead, b), allocate(lead, c)]);
    const outcomes = [r1.result, r2.result];
    expect(outcomes.filter((r) => r === "allocated")).toHaveLength(1);
    expect(outcomes).toContain("lead_full");
    expect(await purchaseCount(lead)).toBe(2);
  });

  it("gelijktijdige marktaankoop en automatische toewijzing kunnen de lead niet overvullen", async () => {
    const lead = await createLead({ type: "shared_2" });
    const companies = [await createCompany(), await createCompany(), await createCompany()];
    const results = await Promise.all(
      companies.map((companyId, i) =>
        allocate(lead, companyId, i === 0 ? "market" : "assigned"),
      ),
    );
    expect(results.filter((r) => r.result === "allocated")).toHaveLength(2);
    expect(await purchaseCount(lead)).toBe(2);
  });

  it("gelijktijdige aanvragen binnen dezelfde categoriecapaciteit blijven binnen het maximum", async () => {
    const company = await createCompany(1);
    const first = await createLead({ type: "shared_4" });
    const second = await createLead({ type: "shared_4" });
    const results = await Promise.all([allocate(first, company), allocate(second, company)]);
    expect(results.filter((r) => r.result === "allocated")).toHaveLength(1);
    expect(results.map((r) => r.result)).toContain("company_capacity_full");
  });


  it("de status van de lead volgt het aantal toewijzingen", async () => {
    const lead = await createLead({ type: "shared_2" });
    const a = await createCompany();
    const b = await createCompany();
    await allocate(lead, a);
    let { rows } = await ctx.admin.query(
      `SELECT state::text, distributed_at FROM leads WHERE id = $1`,
      [lead],
    );
    expect(rows[0].state).toBe("underfilled");
    const firstDistributedAt = rows[0].distributed_at;
    await allocate(lead, b);
    ({ rows } = await ctx.admin.query(
      `SELECT state::text, distributed_at FROM leads WHERE id = $1`,
      [lead],
    ));
    expect(rows[0].state).toBe("assigned");
    expect(rows[0].distributed_at).toEqual(firstDistributedAt);
  });

  it("het databasevangnet weigert een directe insert boven het maximum", async () => {
    const lead = await createLead({ type: "shared_2" });
    const a = await createCompany();
    const b = await createCompany();
    const c = await createCompany();
    await allocate(lead, a);
    await allocate(lead, b);
    await expect(
      ctx.admin.query(
        `INSERT INTO lead_purchases (lead_id, company_id, source) VALUES ($1, $2, 'market')`,
        [lead, c],
      ),
    ).rejects.toThrow(/LEAD_FULL/);
    expect(await purchaseCount(lead)).toBe(2);
  });
});
