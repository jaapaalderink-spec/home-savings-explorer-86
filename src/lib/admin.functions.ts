import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb, average, monthStart, percentage } from "@/lib/partner-util";

/** Gooit als de ingelogde gebruiker geen platformbeheerder is. */
async function assertAdmin(userId: string) {
  const db = await adminDb();
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Alleen platformbeheerders.");
  return db;
}

const filterSchema = z
  .object({
    category: z.string().max(24).optional(),
    region: z.string().max(4).optional(),
    state: z.enum(["new", "assigned", "underfilled", "cancelled"]).optional(),
    days: z.number().int().min(1).max(365).optional(),
    search: z.string().trim().max(80).optional(),
    risk: z.enum(["review", "duplicate", "blocked"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .optional()
  .default({});

export type AdminLeadFilters = z.infer<typeof filterSchema>;

function sinceIso(days?: number) {
  if (!days) return null;
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
}

/** Alle aanvragen op het platform, met filters. Contactgegevens alleen voor beheerders. */
export const listAllLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => filterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId);

    let query = db
      .from("leads")
      .select(
        "id, first_name, last_name, email, phone, postcode, city, region_code, categories, lead_type, state, estimated_savings, purchase_count, max_partners, created_at, distributed_at, contract_type, house_type, annual_consumption_kwh, fraud_status, fraud_score, review_required, duplicate_of_lead_id",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);

    if (data.region) query = query.eq("region_code", data.region);
    if (data.state) query = query.eq("state", data.state);
    if (data.category) query = query.contains("categories", [data.category]);
    if (data.risk === "review") query = query.eq("review_required", true);
    if (data.risk === "duplicate") query = query.not("duplicate_of_lead_id", "is", null);
    if (data.risk === "blocked") query = query.eq("fraud_status", "blocked");
    const since = sinceIso(data.days);
    if (since) query = query.gte("created_at", since);
    if (data.search) {
      const term = `%${data.search}%`;
      query = query.or(
        `postcode.ilike.${term},email.ilike.${term},city.ilike.${term},last_name.ilike.${term}`,
      );
    }

    const { data: leads, error } = await query;
    if (error) throw new Error("Aanvragen konden niet worden geladen.");

    const ids = (leads ?? []).map((l) => l.id);
    const { data: riskEvents } = ids.length
      ? await db.from("lead_risk_events").select("lead_id, signal, score").in("lead_id", ids)
      : { data: [] as Array<{ lead_id: string; signal: string; score: number }> };
    const risksByLead = new Map<string, string[]>();
    (riskEvents ?? []).forEach((e) => {
      const list = risksByLead.get(e.lead_id) ?? [];
      if (!list.includes(e.signal)) list.push(e.signal);
      risksByLead.set(e.lead_id, list);
    });

    const { data: purchases } = ids.length
      ? await db
          .from("lead_purchases")
          .select("lead_id, company_id, status, company:companies(name)")
          .in("lead_id", ids)
      : { data: [] as Array<Record<string, unknown>> };

    const byLead = new Map<string, Array<{ company: string; status: string }>>();
    (purchases ?? []).forEach((p) => {
      const row = p as { lead_id: string; status: string; company?: { name?: string } | null };
      const list = byLead.get(row.lead_id) ?? [];
      list.push({ company: row.company?.name ?? "Onbekend", status: row.status });
      byLead.set(row.lead_id, list);
    });

    return (leads ?? []).map((l) => ({
      id: l.id,
      name: `${l.first_name} ${l.last_name}`.trim(),
      email: l.email,
      phone: l.phone,
      postcode: l.postcode,
      city: l.city,
      region: l.region_code,
      categories: l.categories ?? [],
      leadType: l.lead_type as string,
      state: l.state as string,
      savings: l.estimated_savings ?? 0,
      partners: byLead.get(l.id) ?? [],
      maxPartners: l.max_partners ?? 0,
      contractType: l.contract_type,
      houseType: l.house_type,
      consumption: l.annual_consumption_kwh,
      createdAt: l.created_at,
      distributedAt: l.distributed_at,
      fraudStatus: (l.fraud_status ?? "clean") as string,
      fraudScore: l.fraud_score ?? 0,
      reviewRequired: l.review_required === true,
      duplicateOfLeadId: l.duplicate_of_lead_id ?? null,
      riskReasons: risksByLead.get(l.id) ?? [],
    }));
  });

/** Platform-KPI's: aanvraagvolume, verdeelgraad, omzet en SLA. */
export const getPlatformStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId);

    const [{ data: leads }, { data: purchases }, { data: companies }, { data: complaints }] =
      await Promise.all([
        db.from("leads").select("id, state, created_at, purchase_count, max_partners, categories"),
        db
          .from("lead_purchases")
          .select("price_ex_vat, billable, credited, response_score, contacted_within_24h, created_at"),
        db.from("companies").select("id, active, monthly_fee_ex_vat"),
        db.from("complaints").select("status"),
      ]);

    const all = leads ?? [];
    const now = Date.now();
    const since = (days: number) => now - days * 24 * 3600 * 1000;
    const countSince = (days: number) =>
      all.filter((l) => new Date(l.created_at).getTime() >= since(days)).length;

    const states = all.reduce<Record<string, number>>((acc, l) => {
      const key = (l.state as string) ?? "new";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const perCategory = all.reduce<Record<string, number>>((acc, l) => {
      ((l.categories ?? []) as string[]).forEach((c) => {
        acc[c] = (acc[c] ?? 0) + 1;
      });
      return acc;
    }, {});

    const buys = purchases ?? [];
    const monthIso = monthStart();
    const leadRevenue = buys
      .filter((p) => p.billable && !p.credited)
      .reduce((s, p) => s + Number(p.price_ex_vat ?? 0), 0);
    const subscriptionRevenue = (companies ?? [])
      .filter((c) => c.active)
      .reduce((s, c) => s + Number(c.monthly_fee_ex_vat ?? 0), 0);

    return {
      leadsToday: countSince(1),
      leadsWeek: countSince(7),
      leadsMonth: countSince(30),
      leadsTotal: all.length,
      states,
      perCategory,
      distributionRate: all.length === 0 ? 0 : Math.round((all.filter((l) => (l.purchase_count ?? 0) > 0).length / all.length) * 100),
      avgPartnersPerLead:
        all.length === 0 ? 0 : Math.round((all.reduce((s, l) => s + (l.purchase_count ?? 0), 0) / all.length) * 10) / 10,
      underfilled: all.filter((l) => (l.state as string) === "underfilled").length,
      purchasesMonth: buys.filter((p) => p.created_at >= monthIso).length,
      leadRevenue,
      subscriptionRevenue,
      activeCompanies: (companies ?? []).filter((c) => c.active).length,
      slaScore: average(buys.map((p) => p.response_score ?? 0)),
      contacted24h: percentage(buys.map((p) => p.contacted_within_24h)),
      openComplaints: (complaints ?? []).filter((c) => (c.status as string) === "pending").length,
    };
  });

/** Aanvragen per regio, inclusief partnerdekking — basis voor de kaart. */
export const listLeadsByRegion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => filterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId);
    const since = sinceIso(data.days);

    let leadQuery = db.from("leads").select("region_code, categories, state, purchase_count");
    if (since) leadQuery = leadQuery.gte("created_at", since);
    if (data.category) leadQuery = leadQuery.contains("categories", [data.category]);
    if (data.state) leadQuery = leadQuery.eq("state", data.state);

    const [{ data: leads }, { data: regions }, { data: coverage }, { data: products }] =
      await Promise.all([
        leadQuery,
        db.from("regions").select("code, name"),
        db.from("company_regions").select("region_code, company_id"),
        db.from("company_products").select("company_id, category, active"),
      ]);

    const nameByCode = new Map((regions ?? []).map((r) => [r.code, r.name]));
    const partnersByRegion = new Map<string, Set<string>>();
    (coverage ?? []).forEach((c) => {
      const set = partnersByRegion.get(c.region_code) ?? new Set<string>();
      set.add(c.company_id);
      partnersByRegion.set(c.region_code, set);
    });
    const activeCats = new Map<string, Set<string>>();
    (products ?? []).forEach((p) => {
      if (!p.active) return;
      const set = activeCats.get(p.company_id) ?? new Set<string>();
      set.add(p.category);
      activeCats.set(p.company_id, set);
    });

    const agg = new Map<
      string,
      { leads: number; distributed: number; categories: Record<string, number> }
    >();
    (leads ?? []).forEach((l) => {
      const code = l.region_code;
      if (!code) return;
      const entry = agg.get(code) ?? { leads: 0, distributed: 0, categories: {} };
      entry.leads += 1;
      if ((l.purchase_count ?? 0) > 0) entry.distributed += 1;
      ((l.categories ?? []) as string[]).forEach((c) => {
        entry.categories[c] = (entry.categories[c] ?? 0) + 1;
      });
      agg.set(code, entry);
    });

    return [...agg.entries()]
      .map(([code, entry]) => {
        const companyIds = [...(partnersByRegion.get(code) ?? new Set<string>())];
        const missing = Object.keys(entry.categories).filter(
          (cat) => !companyIds.some((id) => activeCats.get(id)?.has(cat)),
        );
        return {
          code,
          name: nameByCode.get(code) ?? code,
          leads: entry.leads,
          distributed: entry.distributed,
          categories: entry.categories,
          partners: companyIds.length,
          missingCategories: missing,
        };
      })
      .sort((a, b) => b.leads - a.leads);
  });

/** Regio/categorie-combinaties met aanvragen maar zonder actieve partner. */
export const listCoverageGaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId);

    const [{ data: leads }, { data: regions }, { data: coverage }, { data: products }] =
      await Promise.all([
        db.from("leads").select("region_code, categories, purchase_count"),
        db.from("regions").select("code, name"),
        db.from("company_regions").select("region_code, company_id"),
        db.from("company_products").select("company_id, category, active"),
      ]);

    const nameByCode = new Map((regions ?? []).map((r) => [r.code, r.name]));
    const partnersByRegion = new Map<string, string[]>();
    (coverage ?? []).forEach((c) => {
      partnersByRegion.set(c.region_code, [...(partnersByRegion.get(c.region_code) ?? []), c.company_id]);
    });
    const activeCats = new Map<string, Set<string>>();
    (products ?? []).forEach((p) => {
      if (!p.active) return;
      const set = activeCats.get(p.company_id) ?? new Set<string>();
      set.add(p.category);
      activeCats.set(p.company_id, set);
    });

    const gaps = new Map<string, { region: string; regionName: string; category: string; leads: number; undistributed: number }>();
    (leads ?? []).forEach((l) => {
      const code = l.region_code;
      if (!code) return;
      const companies = partnersByRegion.get(code) ?? [];
      ((l.categories ?? []) as string[]).forEach((cat) => {
        const covered = companies.some((id) => activeCats.get(id)?.has(cat));
        if (covered) return;
        const key = `${code}:${cat}`;
        const entry =
          gaps.get(key) ?? { region: code, regionName: nameByCode.get(code) ?? code, category: cat, leads: 0, undistributed: 0 };
        entry.leads += 1;
        if ((l.purchase_count ?? 0) === 0) entry.undistributed += 1;
        gaps.set(key, entry);
      });
    });

    return [...gaps.values()].sort((a, b) => b.leads - a.leads);
  });

/** Aanvragen geclusterd per postcode, met coördinaten voor de kaart. */
export const listLeadPostcodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => filterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId);
    const { normalizePostcode, resolvePostcodes } = await import("@/lib/geocode.server");
    const since = sinceIso(data.days);

    let query = db
      .from("leads")
      .select("postcode, city, region_code, categories, state, purchase_count, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (since) query = query.gte("created_at", since);
    if (data.category) query = query.contains("categories", [data.category]);
    if (data.risk === "review") query = query.eq("review_required", true);
    if (data.risk === "duplicate") query = query.not("duplicate_of_lead_id", "is", null);
    if (data.risk === "blocked") query = query.eq("fraud_status", "blocked");
    if (data.state) query = query.eq("state", data.state);
    if (data.region) query = query.eq("region_code", data.region);

    const { data: leads, error } = await query;
    if (error) throw new Error("Postcodes konden niet worden geladen.");

    type Cluster = {
      postcode: string;
      city: string | null;
      region: string | null;
      leads: number;
      distributed: number;
      categories: Record<string, number>;
      lastAt: string;
    };
    const clusters = new Map<string, Cluster>();
    (leads ?? []).forEach((l) => {
      const postcode = normalizePostcode(l.postcode ?? "");
      if (!postcode) return;
      const entry =
        clusters.get(postcode) ??
        ({
          postcode,
          city: l.city ?? null,
          region: l.region_code ?? null,
          leads: 0,
          distributed: 0,
          categories: {},
          lastAt: l.created_at,
        } satisfies Cluster);
      entry.leads += 1;
      if ((l.purchase_count ?? 0) > 0) entry.distributed += 1;
      ((l.categories ?? []) as string[]).forEach((c) => {
        entry.categories[c] = (entry.categories[c] ?? 0) + 1;
      });
      if (l.created_at > entry.lastAt) entry.lastAt = l.created_at;
      clusters.set(postcode, entry);
    });

    const coords = await resolvePostcodes(db, [...clusters.keys()]);

    return [...clusters.values()]
      .map((c) => {
        const coord = coords.get(c.postcode);
        return {
          ...c,
          city: c.city ?? coord?.city ?? null,
          lng: coord?.lng ?? null,
          lat: coord?.lat ?? null,
        };
      })
      .sort((a, b) => b.leads - a.leads);
  });
