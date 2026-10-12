/**
 * Fase 3 tegen de echte database: contractversies, quotum, gebundelde producten,
 * max. 4 bedrijven per aanvraag, gesloten leadmarkt en leverstatus.
 * Zonder SUPABASE_DB_URL worden ze overgeslagen.
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env["SUPABASE_DB_URL"];
const SB_URL = process.env["SUPABASE_URL"];
const SB_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const suite = DB_URL && SB_URL && SB_KEY ? describe : describe.skip;

const sb = createClient(SB_URL ?? "http://localhost", SB_KEY ?? "none", {
  auth: { persistSession: false },
});
let db: Client;
const companies: string[] = [];
const leads: string[] = [];
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
};

async function company(
  products: string[],
  opts: { quota?: number; area?: "national" | "none" } = {},
) {
  const { rows } = await db.query(
    `INSERT INTO companies (name, active, monthly_lead_limit, categories) VALUES ($1, true, 0, $2) RETURNING id`,
    [`CTest ${crypto.randomUUID().slice(0, 8)}`, products],
  );
  const id = rows[0].id as string;
  companies.push(id);
  for (const p of products) {
    await db.query(
      `INSERT INTO company_products (company_id, category, active, monthly_max) VALUES ($1, $2, true, 100)`,
      [id, p],
    );
    if (opts.area !== "none")
      await db.query(
        `INSERT INTO service_areas (company_id, category, mode) VALUES ($1, $2, 'national')`,
        [id, p],
      );
  }
  if (opts.quota !== undefined) {
    await db.query(
      `INSERT INTO subscription_versions (company_id, version, valid_from, lead_quota_per_month) VALUES ($1, 1, $2, $3)`,
      [id, monthStart(), opts.quota],
    );
  }
  return id;
}

async function lead(categories: string[], max = 4, market = false) {
  const { rows } = await db.query(
    `INSERT INTO leads (first_name, last_name, email, phone, postcode, region_code, categories, lead_type,
                        max_partners, phone_verified, market_enabled)
     VALUES ('T', 'L', 'ctest@example.com', '+31612345678', '9999 ZZ', '99', $1, $2, $3, true, $4) RETURNING id`,
    [categories, max === 2 ? "shared_2" : "shared_4", max, market],
  );
  leads.push(rows[0].id);
  return rows[0].id as string;
}

async function bundle(
  leadId: string,
  companyId: string,
  products: string[] | null,
  source = "assigned",
) {
  const { data, error } = await sb.rpc("allocate_lead_bundle", {
    p_lead_id: leadId,
    p_company_id: companyId,
    p_products: products as unknown as string[],
    p_source: source as "assigned",
  });
  if (error) throw new Error(error.message);
  return (data as Array<{ result: string; price_ex_vat: number; products: string[] }>)[0]!;
}

suite("fase 3: contracten en gebundelde toewijzing (echte database)", () => {
  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
  });
  afterAll(async () => {
    if (leads.length) {
      await sb.from("lead_purchases").delete().in("lead_id", leads);
      await sb.from("leads").delete().in("id", leads);
    }
    if (companies.length) {
      await sb.from("service_areas").delete().in("company_id", companies);
      await sb.from("company_products").delete().in("company_id", companies);
      await sb.from("company_regions").delete().in("company_id", companies);
      await sb.from("companies").delete().in("id", companies);
    }
    await db?.end();
  });

  it("nieuw contract: €15 per lead + €10 per extra product, één toewijzing met bundel", async () => {
    const c = await company(["solar", "battery", "ev"], { quota: 5 });
    const l = await lead(["solar", "battery", "ev"]);
    const r = await bundle(l, c, null);
    expect(r.result).toBe("allocated");
    expect(Number(r.price_ex_vat)).toBe(35);
    expect(r.products.sort()).toEqual(["battery", "ev", "solar"]);
    const { rows } = await db.query(
      `SELECT ap.category, ap.price_ex_vat FROM allocation_products ap JOIN lead_purchases lp ON lp.id = ap.lead_purchase_id
        WHERE lp.lead_id = $1 ORDER BY ap.category`,
      [l],
    );
    expect(rows.map((x) => Number(x.price_ex_vat)).reduce((a, b) => a + b, 0)).toBe(35);
    expect((await bundle(l, c, ["solar"])).result).toBe("already_assigned");
  });

  it("alleen producten die het bedrijf levert worden gebundeld", async () => {
    const c = await company(["solar"], { quota: 5 });
    const l = await lead(["solar", "heatpump"]);
    const r = await bundle(l, c, ["solar", "heatpump"]);
    expect(r.products).toEqual(["solar"]);
    expect(Number(r.price_ex_vat)).toBe(15);
  });

  it("het maandquotum kan niet overschreden worden", async () => {
    const c = await company(["solar"], { quota: 1 });
    expect((await bundle(await lead(["solar"]), c, null)).result).toBe("allocated");
    expect((await bundle(await lead(["solar"]), c, null)).result).toBe("company_capacity_full");
  });

  it("nooit meer dan 4 bedrijven per aanvraag, ook niet na een credit", async () => {
    const l = await lead(["solar"], 4);
    const cs = await Promise.all([1, 2, 3, 4, 5].map(() => company(["solar"], { quota: 10 })));
    for (const c of cs.slice(0, 4)) expect((await bundle(l, c, null)).result).toBe("allocated");
    await sb.from("lead_purchases").update({ credited: true }).eq("lead_id", l);
    expect((await bundle(l, cs[4]!, null)).result).toBe("lead_full");
  });

  it("zonder werkgebied voor het product geen toewijzing", async () => {
    const c = await company(["solar"], { quota: 5, area: "none" });
    expect((await bundle(await lead(["solar"]), c, null)).result).toBe("company_not_eligible");
  });

  it("de leadmarkt is dicht voor nieuwe aanvragen, open voor oude", async () => {
    const c = await company(["solar"], { quota: 5 });
    expect((await bundle(await lead(["solar"], 4, false), c, null, "market")).result).toBe(
      "market_closed",
    );
    expect((await bundle(await lead(["solar"], 4, true), c, null, "market")).result).toBe(
      "allocated",
    );
  });

  it("leverstatus: wachtend, gedeeltelijk, volledig, niet leverbaar", async () => {
    const st = async (id: string) => (await sb.rpc("update_lead_fulfillment", { p_lead: id })).data;
    const l = await lead(["solar", "ev"], 2);
    expect(await st(l)).toBe("waiting");
    const a = await company(["solar"], { quota: 5 });
    const b = await company(["ev"], { quota: 5 });
    await bundle(l, a, null);
    expect(await st(l)).toBe("partial");
    await bundle(l, b, null);
    expect(await st(l)).toBe("complete");
    const old = await lead(["airco"]);
    await sb
      .from("leads")
      .update({ retry_until: new Date(Date.now() - 864e5).toISOString() })
      .eq("id", old);
    expect(await st(old)).toBe("undeliverable");
  });

  it("contractversies zijn onwijzigbaar", async () => {
    const c = await company(["solar"], { quota: 5 });
    const { error } = await sb
      .from("subscription_versions")
      .update({ lead_quota_per_month: 99 })
      .eq("company_id", c);
    expect(error?.message).toMatch(/IMMUTABLE/);
  });
});
