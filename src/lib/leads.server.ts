/** Server-only leadopslag en automatische leadverdeling. */
import { adminDb, monthStart } from "@/lib/partner-util";
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
      notes: data.notes || null,
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

  const [
    { data: companies },
    { data: regionRows },
    { data: productRows },
    { data: purchases },
    { data: existing },
  ] = await Promise.all([
    db.from("companies").select("id, active"),
    db.from("company_regions").select("company_id, region_code"),
    db.from("company_products").select("company_id, category, active, monthly_max"),
    db
      .from("lead_purchases")
      .select("company_id, created_at, lead:leads(categories)")
      .gte("created_at", since),
    db.from("lead_purchases").select("company_id").eq("lead_id", leadId),
  ]);

  const alreadyAssigned = new Set((existing ?? []).map((p) => p.company_id));
  const slotsLeft = lead.max_partners - alreadyAssigned.size;
  if (slotsLeft <= 0) {
    return { assigned: 0, state: "assigned" as const, outcome: "already_full" as const };
  }

  const usedPerCategory = new Map<string, number>();
  (purchases ?? []).forEach((p) => {
    const cats = ((p.lead as { categories?: string[] } | null)?.categories ?? []) as string[];
    cats.forEach((c) => {
      const key = `${p.company_id}:${c}`;
      usedPerCategory.set(key, (usedPerCategory.get(key) ?? 0) + 1);
    });
  });

  const inRegion = new Set(
    (regionRows ?? [])
      .filter((r) => lead.region_code && r.region_code === lead.region_code)
      .map((r) => r.company_id),
  );

  // Voorfilter: bepaalt alleen de kandidatenlijst. De database beslist definitief.
  const eligible = (companies ?? []).filter((c) => {
    if (!c.active) return false;
    if (!inRegion.has(c.id)) return false;
    if (alreadyAssigned.has(c.id)) return false;
    const products = (productRows ?? []).filter((p) => p.company_id === c.id && p.active);
    const match = products.filter((p) => categories.includes(p.category));
    if (match.length === 0) return false;
    // minstens één matchende categorie mag deze maand nog leads ontvangen
    const hasRoom = match.some(
      (p) => (usedPerCategory.get(`${c.id}:${p.category}`) ?? 0) < p.monthly_max,
    );
    return hasRoom;
  });

  const { allocateLeadToCompany, isLeadTerminal } = await import("@/lib/lead-allocation.server");
  const { loadRankingInputs } = await import("@/lib/quality.server");
  const { rankEligibleCompaniesForLead } = await import("@/lib/quality-policy");

  // Ranking: alleen de volgorde van geschikte kandidaten, nooit de toewijzing zelf.
  const eligibleIds = eligible.map((c) => c.id);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [scores, { data: recentRows }] = await Promise.all([
    loadRankingInputs(eligibleIds),
    eligibleIds.length
      ? db
          .from("lead_purchases")
          .select("company_id")
          .in("company_id", eligibleIds)
          .gte("assigned_at", weekAgo)
      : Promise.resolve({ data: [] as Array<{ company_id: string }> }),
  ]);
  const recentPerCompany = new Map<string, number>();
  (recentRows ?? []).forEach((r) => {
    recentPerCompany.set(r.company_id, (recentPerCompany.get(r.company_id) ?? 0) + 1);
  });

  const ranked = rankEligibleCompaniesForLead(
    eligible.map((c) => ({
      companyId: c.id,
      overall: scores.get(c.id)?.overall ?? null,
      sampleSize: scores.get(c.id)?.sampleSize ?? 0,
      recent7d: recentPerCompany.get(c.id) ?? 0,
    })),
  );

  let assigned = 0;
  let stopped: string | null = null;
  for (const company of ranked.map((r) => ({ id: r.companyId }))) {
    if (assigned >= slotsLeft) break;
    const allocation = await allocateLeadToCompany({
      leadId,
      companyId: company.id,
      source: "assigned",
    });
    if (allocation.result === "allocated") {
      assigned += 1;
      continue;
    }
    if (isLeadTerminal(allocation.result)) {
      stopped = allocation.result;
      break;
    }
    // already_assigned / company_capacity_full / company_not_eligible: volgende kandidaat.
  }

  const total = alreadyAssigned.size + assigned;
  const state =
    total === 0
      ? ("new" as const)
      : total < lead.max_partners
        ? ("underfilled" as const)
        : ("assigned" as const);

  // Bij nul toewijzingen zet de databasefunctie niets; hier leggen we vast dat
  // de verdeling wél is uitgevoerd, zodat de lead in de leadmarkt komt.
  if (total === 0) {
    await db
      .from("leads")
      .update({ state, distributed_at: new Date().toISOString() })
      .eq("id", leadId)
      .is("distributed_at", null);
  }

  return { assigned, state, outcome: stopped ?? ("distributed" as const) };
}
