/** Server-only leadopslag en automatische leadverdeling. */
import { adminDb, monthStart, shuffle } from "@/lib/partner-util";
import { leadTypeFor, leadTypePrice, maxPartnersFor, regionFromPostcode } from "@/lib/lead-pricing";
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
 * Verdeelt een lead over geschikte partners:
 * regio in werkgebied, categorie actief, maandcapaciteit vrij, abonnement actief.
 * Te weinig kandidaten -> underfilled, resterende plekken blijven in de leadmarkt.
 */
export async function distributeLead(leadId: string) {
  const db = await adminDb();

  const { data: lead } = await db
    .from("leads")
    .select("id, categories, region_code, lead_type, max_partners")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { assigned: 0, state: "new" as const };

  const categories = lead.categories ?? [];
  const price = leadTypePrice(lead.lead_type);
  const since = monthStart();

  const [{ data: companies }, { data: regionRows }, { data: productRows }, { data: purchases }] =
    await Promise.all([
      db.from("companies").select("id, monthly_lead_limit, active"),
      db.from("company_regions").select("company_id, region_code"),
      db.from("company_products").select("company_id, category, active, monthly_max"),
      db.from("lead_purchases").select("company_id, created_at, lead:leads(categories)").gte("created_at", since),
    ]);

  const usedThisMonth = new Map<string, number>();
  const usedPerCategory = new Map<string, number>();
  (purchases ?? []).forEach((p) => {
    usedThisMonth.set(p.company_id, (usedThisMonth.get(p.company_id) ?? 0) + 1);
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

  const eligible = (companies ?? []).filter((c) => {
    if (!c.active) return false;
    if (!inRegion.has(c.id)) return false;
    const products = (productRows ?? []).filter((p) => p.company_id === c.id && p.active);
    const match = products.filter((p) => categories.includes(p.category));
    if (match.length === 0) return false;
    // minstens één matchende categorie mag deze maand nog leads ontvangen
    const hasRoom = match.some(
      (p) => (usedPerCategory.get(`${c.id}:${p.category}`) ?? 0) < p.monthly_max,
    );
    return hasRoom;
  });

  const winners = shuffle(eligible).slice(0, lead.max_partners);

  for (const company of winners) {
    const used = usedThisMonth.get(company.id) ?? 0;
    const withinBundle = used < (company.monthly_lead_limit ?? 0);
    const { error } = await db.from("lead_purchases").insert({
      lead_id: leadId,
      company_id: company.id,
      source: "assigned",
      price_ex_vat: withinBundle ? 0 : price,
      billable: !withinBundle,
    });
    if (error) console.error("assign failed", company.id, error.message);
  }

  const state = winners.length === 0 ? "new" : winners.length < lead.max_partners ? "underfilled" : "assigned";
  await db
    .from("leads")
    .update({ state, distributed_at: new Date().toISOString() })
    .eq("id", leadId);

  return { assigned: winners.length, state };
}
