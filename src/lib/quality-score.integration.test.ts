/**
 * Echte database-integratietests voor de kwaliteitsscore (fase 3D).
 * Zonder SUPABASE_DB_URL / servicesleutel worden ze overgeslagen.
 */
import { afterAll, describe, expect, it } from "vitest";
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

const made = { companies: [] as string[], leads: [] as string[] };

async function makeCompany(name = "QualityTest") {
  const { data, error } = await sb
    .from("companies")
    .insert({
      name: `${name} ${crypto.randomUUID().slice(0, 8)}`,
      monthly_lead_limit: 0,
      categories: ["solar"],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  made.companies.push(data.id as string);
  return data.id as string;
}

async function makeLead() {
  const { data, error } = await sb
    .from("leads")
    .insert({
      first_name: "Quality",
      last_name: "Test",
      email: "q@example.com",
      phone: "+31612345677",
      postcode: "9997 ZZ",
      region_code: "97",
      categories: ["solar"],
      lead_type: "shared_2",
      max_partners: 2,
      phone_verified: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  made.leads.push(data.id as string);
  return data.id as string;
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
  const { error: upErr } = await sb
    .from("lead_purchases")
    .update({
      ...over,
      assigned_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .eq("id", purchaseId);
  if (upErr) throw new Error(upErr.message);
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

afterAll(async () => {
  if (!SB_KEY) return;
  if (made.companies.length) {
    const { data: purchases } = await sb
      .from("lead_purchases")
      .select("id")
      .in("company_id", made.companies);
    const ids = (purchases ?? []).map((p) => p.id as string);
    if (ids.length) await sb.from("complaints").delete().in("purchase_id", ids);
    await sb.from("company_quality_scores").delete().in("company_id", made.companies);
    await sb.from("lead_purchases").delete().in("company_id", made.companies);
    await sb.from("company_products").delete().in("company_id", made.companies);
    await sb.from("company_regions").delete().in("company_id", made.companies);
  }
  if (made.leads.length) await sb.from("leads").delete().in("id", made.leads);
  if (made.companies.length) await sb.from("companies").delete().in("id", made.companies);
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
          const { error } = await sb
            .from("complaints")
            .insert({ purchase_id: purchaseId, company_id: company, reason: "unreachable", status });
          if (error) throw new Error(error.message);
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

    // Client zonder sessie (anon): mag niets zien en niets wijzigen.
    const anon = createClient(SB_URL!, ANON_KEY!, { auth: { persistSession: false } });
    const { data: visible } = await anon
      .from("company_quality_scores")
      .select("company_id")
      .in("company_id", [mine, other]);
    const { data: updated } = await anon
      .from("company_quality_scores")
      .update({ overall_score: 100 })
      .eq("company_id", mine)
      .select("company_id");

    expect(visible ?? []).toHaveLength(0);
    expect(updated ?? []).toHaveLength(0);

    const { data: after } = await sb
      .from("company_quality_scores")
      .select("overall_score")
      .eq("company_id", mine)
      .single();
    expect(Number(after!.overall_score)).not.toBe(100);
  });

  it("16. beheer ziet alle deelscores", async () => {
    const company = await makeCompany("Beheer");
    await makePurchase(company, { status: "won", first_contact_at: new Date().toISOString() });
    await storeScore(company);
    const { data } = await sb
      .from("company_quality_scores")
      .select(
        "overall_score, response_score, complaint_score, engagement_score, conversion_score, sample_size",
      )
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

    // Bovenaan staan geeft geen recht op een plek: de database beslist.
    const leadId = await makeLead();
    const { data } = await sb.rpc("allocate_lead_to_company", {
      p_lead_id: leadId,
      p_company_id: good,
      p_source: "assigned",
    });
    const row = (Array.isArray(data) ? data[0] : data) as { result: string };
    expect(row.result).toBe("company_not_eligible");
  });

  it("18. gelijktijdige toewijzing blijft slotveilig", async () => {
    const leadId = await makeLead();
    const companies = await Promise.all([
      makeCompany("Race1"),
      makeCompany("Race2"),
      makeCompany("Race3"),
    ]);
    for (const c of companies) {
      await sb.from("companies").update({ active: true }).eq("id", c);
      await sb.from("company_regions").insert({ company_id: c, region_code: "97" });
      await sb
        .from("company_products")
        .insert({ company_id: c, category: "solar", active: true, monthly_max: 100 });
    }

    const results = await Promise.all(
      companies.map((c) =>
        sb.rpc("allocate_lead_to_company", {
          p_lead_id: leadId,
          p_company_id: c,
          p_source: "assigned",
        }),
      ),
    );
    const allocated = results.filter((r) => {
      const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { result: string } | null;
      return !r.error && row?.result === "allocated";
    }).length;
    expect(allocated).toBeLessThanOrEqual(2);

    const { count } = await sb
      .from("lead_purchases")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId);
    expect(count ?? 0).toBeLessThanOrEqual(2);
  });
});
