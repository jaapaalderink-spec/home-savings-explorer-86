/**
 * Echte database-integratietests voor de kwaliteitsscore (fase 3D).
 * Zonder SUPABASE_DB_URL worden ze overgeslagen.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { computeQualityScore, rankEligibleCompaniesForLead } from "@/lib/quality-policy";

const DB_URL = process.env["SUPABASE_DB_URL"];
const SB_URL = process.env["SUPABASE_URL"];
const SB_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const suite = DB_URL && SB_URL && SB_KEY ? describe : describe.skip;

const sb = createClient(SB_URL ?? "http://localhost", SB_KEY ?? "none", {
  auth: { persistSession: false },
});

let db: Client;
const made = { companies: [] as string[], leads: [] as string[] };

async function makeCompany(name = "QualityTest") {
  const { rows } = await db.query(
    `INSERT INTO companies (name, monthly_lead_limit, categories) VALUES ($1, 0, '{solar}') RETURNING id`,
    [`${name} ${crypto.randomUUID().slice(0, 8)}`],
  );
  made.companies.push(rows[0].id);
  return rows[0].id as string;
}

async function makeLead() {
  const { rows } = await db.query(
    `INSERT INTO leads (first_name, last_name, email, phone, postcode, region_code, categories,
                        lead_type, max_partners, phone_verified)
     VALUES ('Quality', 'Test', 'q@example.com', '+31612345677', '9997 ZZ', '97', '{solar}',
             'shared_2', 2, true) RETURNING id`,
  );
  made.leads.push(rows[0].id);
  return rows[0].id as string;
}

/** Aankoop met instelbare historie (ouder dan 48 uur zodat SLA meetelt). */
async function makePurchase(companyId: string, over: Record<string, unknown> = {}) {
  const leadId = await makeLead();
  const { data, error } = await sb
    .from("lead_purchases")
    .insert({ lead_id: leadId, company_id: companyId, price_ex_vat: 50, billable: true })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const purchaseId = data.id as string;
  const sets = Object.keys(over);
  if (sets.length) {
    const assignments = sets.map((k, i) => `${k} = $${i + 2}`).join(", ");
    await db.query(`UPDATE lead_purchases SET ${assignments} WHERE id = $1`, [
      purchaseId,
      ...Object.values(over),
    ]);
  }
  await db.query(`UPDATE lead_purchases SET assigned_at = now() - interval '5 days' WHERE id = $1`, [
    purchaseId,
  ]);
  return { purchaseId, leadId };
}

async function metricsFor(companyId: string) {
  const { data, error } = await sb.rpc("company_quality_metrics", { p_company_id: companyId });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, number>;
  return {
    companyId,
    leadsTotal: Number(row["leads_total"] ?? 0),
    leadsSlaEligible: Number(row["leads_sla_eligible"] ?? 0),
    openedCount: Number(row["opened_count"] ?? 0),
    contactedCount: Number(row["contacted_count"] ?? 0),
    within24h: Number(row["within_24h"] ?? 0),
    within48h: Number(row["within_48h"] ?? 0),
    closedCount: Number(row["closed_count"] ?? 0),
    wonCount: Number(row["won_count"] ?? 0),
    quotedPlusCount: Number(row["quoted_plus_count"] ?? 0),
    untouchedCount: Number(row["untouched_count"] ?? 0),
    approvedComplaints: Number(row["approved_complaints"] ?? 0),
    recent7d: Number(row["recent_7d"] ?? 0),
  };
}

async function storeScore(companyId: string) {
  const m = await metricsFor(companyId);
  const s = computeQualityScore(m);
  const { error } = await sb.from("company_quality_scores").upsert(
    {
      company_id: companyId,
      overall_score: s.overall,
      response_score: s.response,
      complaint_score: s.complaint,
      engagement_score: s.engagement,
      conversion_score: s.conversion,
      sample_size: s.sampleSize,
      quality_warning: s.qualityWarning,
      metrics: m as unknown as Record<string, number>,
      calculated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) throw new Error(error.message);
  return s;
}

beforeAll(async () => {
  if (!DB_URL) return;
  db = new Client({ connectionString: DB_URL });
  await db.connect();
});

afterAll(async () => {
  if (!db) return;
  if (made.companies.length) {
    await db.query(`DELETE FROM company_quality_scores WHERE company_id = ANY($1)`, [
      made.companies,
    ]);
    await db.query(
      `DELETE FROM complaints WHERE purchase_id IN (SELECT id FROM lead_purchases WHERE company_id = ANY($1))`,
      [made.companies],
    );
    await db.query(`DELETE FROM lead_purchases WHERE company_id = ANY($1)`, [made.companies]);
    await db.query(`DELETE FROM audit_events WHERE actor_company_id = ANY($1)`, [made.companies]);
    await db.query(`DELETE FROM companies WHERE id = ANY($1)`, [made.companies]);
  }
  if (made.leads.length) await db.query(`DELETE FROM leads WHERE id = ANY($1)`, [made.leads]);
  await db.end();
});

suite("kwaliteitsscore tegen de echte database", () => {
  it("19. de score gebruikt de werkelijke historie uit lead_purchases", async () => {
    const company = await makeCompany("Snel");
    await makePurchase(company, {
      opened_at: new Date().toISOString(),
      first_contact_at: new Date().toISOString(),
      status: "won",
    });
    const m = await metricsFor(company);
    expect(m.leadsTotal).toBe(1);
    expect(m.contactedCount).toBe(1);
    expect(m.wonCount).toBe(1);
    expect(m.closedCount).toBe(1);
  });

  it("5/6. alleen goedgekeurde reclamaties verlagen de score", async () => {
    const approvedCo = await makeCompany("Klacht");
    const rejectedCo = await makeCompany("Afgewezen");
    for (const [company, status] of [
      [approvedCo, "approved"],
      [rejectedCo, "rejected"],
    ] as const) {
      for (let i = 0; i < 4; i++) {
        const { purchaseId } = await makePurchase(company);
        if (i === 0) {
          await db.query(
            `INSERT INTO complaints (purchase_id, company_id, reason, status) VALUES ($1,$2,'unreachable',$3)`,
            [purchaseId, company, status],
          );
        }
      }
    }
    const approved = computeQualityScore(await metricsFor(approvedCo));
    const rejected = computeQualityScore(await metricsFor(rejectedCo));
    expect(approved.complaint).toBeLessThan(rejected.complaint);
  });

  it("20. herberekening is idempotent", async () => {
    const company = await makeCompany("Idempotent");
    await makePurchase(company, { status: "lost", first_contact_at: new Date().toISOString() });
    const first = await storeScore(company);
    const second = await storeScore(company);
    expect(second).toEqual(first);
  });

  it("14/15. partners kunnen scores niet wijzigen en zien alleen de eigen score", async () => {
    const mine = await makeCompany("Eigen");
    const other = await makeCompany("Concurrent");
    await storeScore(mine);
    await storeScore(other);

    const userId = crypto.randomUUID();
    await db.query(`SET LOCAL ROLE authenticated`);
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    const writable = await db
      .query(`UPDATE company_quality_scores SET overall_score = 100 WHERE company_id = $1`, [mine])
      .then((r) => r.rowCount)
      .catch(() => 0);
    const visible = await db.query(`SELECT company_id FROM company_quality_scores`);
    await db.query(`RESET ROLE`);

    expect(writable).toBe(0);
    expect(visible.rows.map((r: { company_id: string }) => r.company_id)).not.toContain(other);
  });

  it("16. beheer ziet alle deelscores", async () => {
    const company = await makeCompany("Beheer");
    await makePurchase(company, { status: "won", first_contact_at: new Date().toISOString() });
    await storeScore(company);
    const { data } = await sb
      .from("company_quality_scores")
      .select("overall_score, response_score, complaint_score, engagement_score, conversion_score, sample_size")
      .eq("company_id", company)
      .maybeSingle();
    expect(data).toBeTruthy();
    expect(Number(data!.sample_size)).toBe(1);
  });

  it("1/17. ranking ordent alleen kandidaten; toewijzen blijft bij allocate_lead_to_company", async () => {
    const good = await makeCompany("Goed");
    const weak = await makeCompany("Zwak");
    const ranked = rankEligibleCompaniesForLead(
      [
        { companyId: weak, overall: 25, sampleSize: 40, recent7d: 2 },
        { companyId: good, overall: 88, sampleSize: 40, recent7d: 2 },
      ],
      { jitter: () => 0 },
    );
    expect(ranked.map((r) => r.companyId)).toEqual([good, weak]);

    // Ranking geeft geen recht op een plek: de database beslist.
    const leadId = await makeLead();
    const { data } = await sb.rpc("allocate_lead_to_company", {
      p_lead_id: leadId,
      p_company_id: good,
      p_source: "assigned",
    });
    const row = (Array.isArray(data) ? data[0] : data) as { result: string };
    expect(["allocated", "company_not_eligible"]).toContain(row.result);
  });

  it("18. gelijktijdige toewijzing blijft slotveilig", async () => {
    const leadId = await makeLead();
    const companies = await Promise.all([
      makeCompany("Race1"),
      makeCompany("Race2"),
      makeCompany("Race3"),
    ]);
    // Alle bedrijven geschikt maken voor deze lead.
    for (const c of companies) {
      await db.query(`UPDATE companies SET active = true WHERE id = $1`, [c]);
      await db.query(
        `INSERT INTO company_regions (company_id, region_code) VALUES ($1, '97') ON CONFLICT DO NOTHING`,
        [c],
      );
      await db.query(
        `INSERT INTO company_products (company_id, category, active, monthly_max) VALUES ($1,'solar',true,100)`,
        [c],
      );
    }
    await db.query(`INSERT INTO regions (code, name) VALUES ('97','Testregio') ON CONFLICT DO NOTHING`);

    const results = await Promise.all(
      companies.map((c) =>
        sb.rpc("allocate_lead_to_company", {
          p_lead_id: leadId,
          p_company_id: c,
          p_source: "assigned",
        }),
      ),
    );
    const outcomes = results.map((r) => {
      const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { result: string } | null;
      return r.error ? "lead_full" : (row?.result ?? "error");
    });
    expect(outcomes.filter((o) => o === "allocated").length).toBeLessThanOrEqual(2);

    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM lead_purchases WHERE lead_id = $1`,
      [leadId],
    );
    expect(rows[0].n).toBeLessThanOrEqual(2);
  });
});
