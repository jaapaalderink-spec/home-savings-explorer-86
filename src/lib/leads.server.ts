/** Server-only leadopslag en automatische leadverdeling. */
import { adminDb, monthStart } from "@/lib/partner-util";
import { MAX_COMPANIES_PER_REQUEST, planAllocation } from "@/lib/lead-planner";
import { leadTypeFor, maxPartnersFor, regionFromPostcode } from "@/lib/lead-pricing";
import type { LeadInput } from "@/lib/leads.functions";

/** Slaat de lead op en geeft het id terug. */
export async function insertLead(data: LeadInput): Promise<string> {
  const db = await adminDb();
  const postcode = data.postcode.toUpperCase().replace(/\s+/g, " ");
  const leadType = leadTypeFor(data.categories);

  const { data: lead, error } = await db
    .from("leads")
    .insert({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      postcode,
      house_number: data.houseNumber || null,
      city: data.city || null,
      categories: data.categories,
      contract_type: data.contractType,
      house_type: data.houseType || null,
      current_heating: data.currentHeating || null,
      build_year: data.buildYear ?? null,
      annual_consumption_kwh: data.annualConsumptionKwh ?? null,
      annual_feedin_kwh: data.annualFeedInKwh ?? null,
      panel_count: data.panelCount ?? null,
      ev_status: data.evStatus || null,
      annual_km: data.annualKm ?? null,
      airco_rooms: data.aircoRooms ?? null,
      smart_devices: data.smartDevices ?? [],
      battery_goals: data.batteryGoals ?? [],
      estimated_savings: data.estimatedSavings ?? 0,
      notes: data.energyProfile
        ? `${data.notes || ""}\n\nRekenparameters: ${data.calcConfigVersion ? `versie ${data.calcConfigVersion}` : "standaardwaarden"}\nEnergieprofiel (maandmodel v1):\n${JSON.stringify(data.energyProfile, null, 2)}`
        : data.notes || null,
      region_code: regionFromPostcode(postcode),
      lead_type: leadType,
      max_partners: maxPartnersFor(leadType),
    })
    .select("id")
    .single();

  if (error || !lead) {
    console.error("insertLead failed", error);
    throw new Error("We konden je aanvraag niet opslaan. Probeer het opnieuw.");
  }
  return lead.id;
}

/**
 * Verdeelt een lead over geschikte partners.
 *
 * Kandidaten worden hier gefilterd en geshuffeld (ranking blijft ongewijzigd),
 * maar het claimen van een plek gebeurt uitsluitend in de databasefunctie
 * `allocate_lead_to_company`. Die vergrendelt de lead, telt de bestaande
 * toewijzingen binnen dezelfde transactie en weigert de overtollige claim.
 *
 * Idempotent: opnieuw aanroepen vult alleen de resterende plekken. Bestaande
 * toewijzingen worden nooit vervangen. Is de lead al vol, dan is de uitkomst
 * `already_full` en verandert er niets.
 */
export async function distributeLead(leadId: string) {
  const db = await adminDb();

  const { data: lead } = await db
    .from("leads")
    .select(
      "id, categories, region_code, lead_type, max_partners, phone_verified, state, fraud_status, duplicate_of_lead_id",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { assigned: 0, state: "new" as const, outcome: "lead_not_found" as const };

  // Verdedigende poort: een lead zonder geverifieerd telefoonnummer wordt nooit verdeeld.
  if (lead.phone_verified !== true) {
    throw new Error("LEAD_PHONE_NOT_VERIFIED");
  }

  // Fraudepoort (de database weigert dit ook zelf, dit voorkomt nutteloos werk).
  if (lead.fraud_status === "blocked") {
    return { assigned: 0, state: lead.state, outcome: "lead_blocked" as const };
  }
  if (lead.duplicate_of_lead_id) {
    return { assigned: 0, state: lead.state, outcome: "lead_duplicate" as const };
  }

  const categories = lead.categories ?? [];
  const since = monthStart();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: companies },
    { data: areaRows },
    { data: productRows },
    { data: purchases },
    { data: existing },
    { data: contracts },
  ] = await Promise.all([
    db.from("companies").select("id, active"),
    db.rpc("eligible_companies_for_lead", { p_lead: leadId }),
    db.from("company_products").select("company_id, category, active, monthly_max"),
    db
      .from("lead_purchases")
      .select("company_id, created_at, subscription_version_id, lead:leads(categories)")
      .gte("created_at", since),
    db.from("lead_purchases").select("company_id, products, credited").eq("lead_id", leadId),
    db
      .from("subscription_versions")
      .select("company_id, valid_from, lead_quota_per_month")
      .lte("valid_from", today)
      .order("valid_from", { ascending: false }),
  ]);

  const alreadyAssigned = new Set((existing ?? []).map((p) => p.company_id));
  const cap = Math.min(lead.max_partners, MAX_COMPANIES_PER_REQUEST);
  const slotsLeft = cap - alreadyAssigned.size;
  if (slotsLeft <= 0) {
    await db.rpc("update_lead_fulfillment", { p_lead: leadId });
    return { assigned: 0, state: "assigned" as const, outcome: "already_full" as const };
  }

  // Actief contract per bedrijf (nieuwste ingangsdatum t/m vandaag).
  const quotaByCompany = new Map<string, number>();
  (contracts ?? []).forEach((c) => {
    if (!quotaByCompany.has(c.company_id)) quotaByCompany.set(c.company_id, c.lead_quota_per_month);
  });

  const usedPerCategory = new Map<string, number>();
  const usedContract = new Map<string, number>();
  (purchases ?? []).forEach((p) => {
    if (p.subscription_version_id)
      usedContract.set(p.company_id, (usedContract.get(p.company_id) ?? 0) + 1);
    const cats = ((p.lead as { categories?: string[] } | null)?.categories ?? []) as string[];
    cats.forEach((c) => {
      const key = `${p.company_id}:${c}`;
      usedPerCategory.set(key, (usedPerCategory.get(key) ?? 0) + 1);
    });
  });

  // Werkgebied per product (straal, provincies of heel Nederland), berekend in de database.
  const coveredCats = new Map<string, string[]>(
    ((areaRows ?? []) as Array<{ company_id: string; categories: string[] }>).map((r) => [
      r.company_id,
      r.categories,
    ]),
  );

  // Voorfilter + bundel per bedrijf. De database beslist definitief.
  const candidates = (companies ?? [])
    .filter((c) => c.active && coveredCats.has(c.id) && !alreadyAssigned.has(c.id))
    .map((c) => {
      const covered = coveredCats.get(c.id)!;
      const quota = quotaByCompany.get(c.id);
      const active = (productRows ?? []).filter(
        (p) =>
          p.company_id === c.id &&
          p.active &&
          categories.includes(p.category) &&
          covered.includes(p.category),
      );
      if (quota !== undefined) {
        const left = quota - (usedContract.get(c.id) ?? 0);
        return {
          id: c.id,
          products: left > 0 ? active.map((p) => p.category) : [],
          remainingShare: quota > 0 ? Math.max(0, left) / quota : 0,
        };
      }
      // Oud contract: per product de maandcapaciteit.
      const withRoom = active.filter(
        (p) => (usedPerCategory.get(`${c.id}:${p.category}`) ?? 0) < p.monthly_max,
      );
      const share = withRoom.length
        ? Math.max(
            ...withRoom.map(
              (p) => 1 - (usedPerCategory.get(`${c.id}:${p.category}`) ?? 0) / p.monthly_max,
            ),
          )
        : 0;
      return { id: c.id, products: withRoom.map((p) => p.category), remainingShare: share };
    })
    .filter((c) => c.products.length > 0);

  const { allocateLeadToCompany, isLeadTerminal } = await import("@/lib/lead-allocation.server");
  const { loadRankingInputs } = await import("@/lib/quality.server");
  const { rankEligibleCompaniesForLead } = await import("@/lib/quality-policy");

  // Kwaliteitsranking bepaalt alleen de volgorde bij gelijke stand.
  const ids = candidates.map((c) => c.id);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [scores, { data: recentRows }] = await Promise.all([
    loadRankingInputs(ids),
    ids.length
      ? db
          .from("lead_purchases")
          .select("company_id")
          .in("company_id", ids)
          .gte("assigned_at", weekAgo)
      : Promise.resolve({ data: [] as Array<{ company_id: string }> }),
  ]);
  const recentPerCompany = new Map<string, number>();
  (recentRows ?? []).forEach((r) => {
    recentPerCompany.set(r.company_id, (recentPerCompany.get(r.company_id) ?? 0) + 1);
  });
  const ranked = rankEligibleCompaniesForLead(
    candidates.map((c) => ({
      companyId: c.id,
      overall: scores.get(c.id)?.overall ?? null,
      sampleSize: scores.get(c.id)?.sampleSize ?? 0,
      recent7d: recentPerCompany.get(c.id) ?? 0,
    })),
  );
  const rankOf = new Map(ranked.map((r, i) => [r.companyId, i]));

  const alreadyCovered = (existing ?? [])
    .filter((p) => !p.credited)
    .flatMap((p) =>
      (p.products as string[] | null)?.length ? (p.products as string[]) : categories,
    );
  let pending = candidates;
  let assigned = 0;
  let stopped: string | null = null;
  const covered = [...alreadyCovered];

  // Plan, wijs toe; mislukt er een (bv. net vol), dan plannen we opnieuw zonder dat bedrijf.
  for (let round = 0; round < 6 && assigned < slotsLeft && !stopped; round++) {
    const plan = planAllocation(
      categories,
      slotsLeft - assigned,
      pending.map((c) => ({
        companyId: c.id,
        products: c.products,
        remainingShare: c.remainingShare,
        rank: rankOf.get(c.id) ?? 999,
      })),
      covered,
    );
    if (plan.length === 0) break;
    const failed = new Set<string>();
    for (const item of plan) {
      const allocation = await allocateLeadToCompany({
        leadId,
        companyId: item.companyId,
        source: "assigned",
        products: item.products,
      });
      if (allocation.result === "allocated") {
        assigned += 1;
        covered.push(...item.products);
      } else if (isLeadTerminal(allocation.result)) {
        stopped = allocation.result;
        break;
      } else {
        failed.add(item.companyId);
      }
    }
    const done = new Set(plan.map((p) => p.companyId));
    pending = pending.filter((c) => !done.has(c.id));
    if (failed.size === 0) break;
  }

  const total = alreadyAssigned.size + assigned;
  const state =
    total === 0 ? ("new" as const) : total < cap ? ("underfilled" as const) : ("assigned" as const);

  if (total === 0) {
    await db
      .from("leads")
      .update({ state, distributed_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("distributed_at", null);
  }
  const { data: fulfillment } = await db.rpc("update_lead_fulfillment", { p_lead: leadId });

  return {
    assigned,
    state,
    fulfillment: (fulfillment as string | null) ?? null,
    outcome: stopped ?? ("distributed" as const),
  };
}
