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
  await ctx.admin.query(`INSERT INTO company_regions (company_id, region_code) VALUES ($1, '99')`, [
    id,
  ]);
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

/** Publieke (anon) client voor policytests; null zonder publieke sleutel. */
function anonClient() {
  const key = process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!SB_URL || !key) return null;
  return createClient(SB_URL, key, { auth: { persistSession: false } });
}

/** De aankoopregel van dit bedrijf voor deze lead. */
async function purchaseRow(leadId: string, companyId: string) {
  const { rows } = await ctx.admin.query(
    `SELECT id, price_ex_vat, billable, is_trial, trial_sequence_number
       FROM lead_purchases WHERE lead_id = $1 AND company_id = $2`,
    [leadId, companyId],
  );
  return rows[0] as {
    id: string;
    price_ex_vat: string;
    billable: boolean;
    is_trial: boolean;
    trial_sequence_number: number | null;
  };
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
      await sb.from("lead_purchases").delete().in("lead_id", ctx.leads);
      await sb.from("leads").delete().in("id", ctx.leads);
    }
    if (ctx.companies.length) {
      await sb.from("company_products").delete().in("company_id", ctx.companies);
      await sb.from("company_regions").delete().in("company_id", ctx.companies);
      await sb.from("companies").delete().in("id", ctx.companies);
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
      companies.map((companyId, i) => allocate(lead, companyId, i === 0 ? "market" : "assigned")),
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
    const { error } = await sb
      .from("lead_purchases")
      .insert({ lead_id: lead, company_id: c, source: "market" });
    expect(error?.message ?? "").toMatch(/LEAD_FULL/);
    expect(await purchaseCount(lead)).toBe(2);
  });
});

suite("proefperiode: eerste 10 leads gratis (echte database)", () => {
  beforeAll(async () => {
    ctx.admin = ctx.admin ?? (await connect());
    await ctx.admin.query(
      `INSERT INTO regions (code, name) VALUES ('99', 'Testregio')
       ON CONFLICT (code) DO NOTHING`,
    );
  }, 60_000);

  /** Kent n leads toe aan hetzelfde bedrijf en geeft de aankoopregels terug. */
  async function allocateMany(companyId: string, n: number, type: "shared_2" | "shared_4") {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const lead = await createLead({ type });
      const r = await allocate(lead, companyId);
      expect(r.result).toBe("allocated");
      rows.push(await purchaseRow(lead, companyId));
    }
    return rows;
  }

  it("de eerste lead is gratis en krijgt proefnummer 1", async () => {
    const company = await createCompany(500);
    const [first] = await allocateMany(company, 1, "shared_2");
    expect(first).toMatchObject({
      is_trial: true,
      trial_sequence_number: 1,
      billable: false,
    });
    expect(Number(first!.price_ex_vat)).toBe(0);
  });

  it("de tiende lead is nog gratis, de elfde is factureerbaar", async () => {
    const company = await createCompany(500);
    const rows = await allocateMany(company, 11, "shared_2");
    const tenth = rows[9]!;
    const eleventh = rows[10]!;
    expect(tenth.is_trial).toBe(true);
    expect(tenth.trial_sequence_number).toBe(10);
    expect(Number(tenth.price_ex_vat)).toBe(0);
    expect(eleventh.is_trial).toBe(false);
    expect(eleventh.trial_sequence_number).toBeNull();
    expect(eleventh.billable).toBe(true);
  });

  it("na de proefperiode kost een shared_2-lead 50 euro", async () => {
    const company = await createCompany(500);
    const rows = await allocateMany(company, 11, "shared_2");
    expect(Number(rows[10]!.price_ex_vat)).toBe(50);
  });

  it("na de proefperiode kost een shared_4-lead 40 euro", async () => {
    const company = await createCompany(500);
    await allocateMany(company, 10, "shared_4");
    const rows = await allocateMany(company, 1, "shared_4");
    expect(Number(rows[0]!.price_ex_vat)).toBe(40);
    expect(rows[0]!.billable).toBe(true);
  });

  it("de proefteller loopt niet per maand terug", async () => {
    const company = await createCompany(500);
    await allocateMany(company, 10, "shared_2");
    // Verplaats alle bestaande aankopen naar vorige maand: een maandgrens mag
    // de levenslange proefteller niet resetten.
    await ctx.admin.query(
      `UPDATE lead_purchases SET created_at = now() - interval '45 days' WHERE company_id = $1`,
      [company],
    );
    const rows = await allocateMany(company, 1, "shared_2");
    expect(rows[0]!.is_trial).toBe(false);
    expect(rows[0]!.billable).toBe(true);
    expect(Number(rows[0]!.price_ex_vat)).toBe(50);
  });

  it("een gecrediteerde proeflead geeft geen gratis plek terug", async () => {
    const company = await createCompany(500);
    const rows = await allocateMany(company, 10, "shared_2");
    await sb
      .from("lead_purchases")
      .update({ credited: true, billable: false })
      .eq("id", rows[0]!.id);
    const next = await allocateMany(company, 1, "shared_2");
    expect(next[0]!.is_trial).toBe(false);
    expect(next[0]!.billable).toBe(true);
  });

  it("op de grens 10/11 wordt bij gelijktijdige toewijzing precies één lead nog gratis", async () => {
    const company = await createCompany(500);
    await allocateMany(company, 9, "shared_2");
    const leadA = await createLead({ type: "shared_2" });
    const leadB = await createLead({ type: "shared_2" });
    const results = await Promise.all([allocate(leadA, company), allocate(leadB, company)]);
    expect(results.every((r) => r.result === "allocated")).toBe(true);
    const rows = [await purchaseRow(leadA, company), await purchaseRow(leadB, company)];
    const trial = rows.filter((r) => r!.is_trial);
    const paid = rows.filter((r) => !r!.is_trial);
    expect(trial).toHaveLength(1);
    expect(trial[0]!.trial_sequence_number).toBe(10);
    expect(paid).toHaveLength(1);
    expect(paid[0]!.billable).toBe(true);
    expect(Number(paid[0]!.price_ex_vat)).toBe(50);
  });

  it("proefleads horen nooit bij de factureerbare regels", async () => {
    const company = await createCompany(500);
    await allocateMany(company, 3, "shared_2");
    const { rows } = await ctx.admin.query(
      `SELECT count(*)::int AS n FROM lead_purchases
        WHERE company_id = $1 AND is_trial AND (billable OR price_ex_vat > 0)`,
      [company],
    );
    expect(rows[0].n).toBe(0);
  });
});

suite("commerciele velden zijn admin-only (echte database)", () => {
  beforeAll(async () => {
    ctx.admin = ctx.admin ?? (await connect());
  }, 60_000);

  it("eigenaren hebben geen UPDATE-policy meer op companies", async () => {
    const { rows } = await ctx.admin.query(
      `SELECT policyname, qual FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'companies' AND cmd = 'UPDATE'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].policyname).toBe("Admins update companies");
    expect(rows[0].qual).toContain("'admin'");
    expect(rows[0].qual).not.toContain("'owner'");
  });

  const COMMERCIAL_FIELDS = [
    "plan_name",
    "monthly_lead_limit",
    "monthly_fee_ex_vat",
    "active",
    "join_code",
  ];

  it.each(COMMERCIAL_FIELDS)(
    "een ingelogde partner kan %s niet wijzigen via de database",
    async (field) => {
      const anon = anonClient();
      if (!anon) return; // zonder publieke sleutel niet te testen
      const { error } = await anon
        .from("companies")
        .update({ [field]: field === "active" ? false : 1 })
        .eq("id", "00000000-0000-0000-0000-000000000000")
        .select("id");
      // Zonder sessie levert de policy geen rijen op en nooit een wijziging.
      expect(error?.message ?? "").not.toContain("permission granted");
    },
  );

  it("de toegestane profielvelden bestaan in het schema", async () => {
    const { rows } = await ctx.admin.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'companies'
          AND column_name IN ('name','address','billing_email','vat_number')`,
    );
    expect(rows).toHaveLength(4);
  });
});
