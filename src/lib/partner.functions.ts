import { adminRole } from "@/lib/admin-guard";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  TRIAL_LEAD_ALLOWANCE,
  planByName,
} from "@/lib/lead-pricing";
import { adminDb, average, monthStart, percentage } from "@/lib/partner-util";
import { LEAD_STATUSES, checkStatusTransition, type LeadStatus } from "@/lib/lead-status-policy";
import { PARTNER_VISIBLE_EVENTS } from "@/lib/audit-policy";
import { isBillingMonthClosed } from "@/lib/billing-period";

/** Profiel, bedrijf, rollen en het maandverbruik van de ingelogde partner. */
export const getPartnerContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: roleRows }] = await Promise.all([
      db.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      db.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    const roles = (roleRows ?? []).map((r) => r.role as string);

    if (!profile?.company_id) {
      return {
        profile: profile ?? null,
        company: null,
        roles,
        usedThisMonth: 0,
        limit: 0,
        trialUsed: 0,
        trialRemaining: TRIAL_LEAD_ALLOWANCE,
        trialActive: true,
      };
    }

    const [{ data: company }, { count }, { count: lifetimeCount }] = await Promise.all([
      db.from("companies").select("*").eq("id", profile.company_id).maybeSingle(),
      db
        .from("lead_purchases")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id)
        .gte("created_at", monthStart()),
      db
        .from("lead_purchases")
        .select("id", { count: "exact", head: true })
        .eq("company_id", profile.company_id),
    ]);

    // Proefperiode: levenslange telling, dus geen maandfilter.
    const trialUsed = Math.min(lifetimeCount ?? 0, TRIAL_LEAD_ALLOWANCE);

    return {
      profile,
      company,
      roles,
      usedThisMonth: count ?? 0,
      limit: company?.monthly_lead_limit ?? 0,
      trialUsed,
      trialRemaining: TRIAL_LEAD_ALLOWANCE - trialUsed,
      trialActive: trialUsed < TRIAL_LEAD_ALLOWANCE,
    };
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        categories: z.array(z.string().max(24)).min(1).max(6),
        plan: z.enum(["starter", "groei", "premium"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profile?.company_id) throw new Error("Je bent al aan een bedrijf gekoppeld.");

    const plan = planByName(data.plan);
    const { data: company, error } = await db
      .from("companies")
      .insert({
        name: data.name,
        categories: data.categories,
        plan_name: plan.id,
        monthly_lead_limit: plan.leads,
        monthly_fee_ex_vat: plan.price,
      })
      .select("*")
      .single();
    if (error || !company) throw new Error("Bedrijf aanmaken is mislukt.");

    await db.from("profiles").update({ company_id: company.id }).eq("id", context.userId);
    await db
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "owner" }, { onConflict: "user_id,role" });

    // standaard productcapaciteit voor de gekozen categorieën
    await db.from("company_products").upsert(
      data.categories.map((category) => ({
        company_id: company.id,
        category,
        active: true,
        monthly_max: Math.max(Math.round(plan.leads / data.categories.length), 1),
      })),
      { onConflict: "company_id,category" },
    );

    return { companyId: company.id, joinCode: company.join_code };
  });

/**
 * Bedrijfsgegevens bijwerken. Alleen deze vier velden zijn zelf aanpasbaar;
 * commerciele velden (abonnement, maandlimiet, maandbedrag, actief, bedrijfscode)
 * zijn admin-only en worden hier bewust niet geaccepteerd. De database blokkeert
 * directe wijzigingen: eigenaren hebben geen UPDATE-policy meer op companies.
 */
export const updateCompanyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        address: z.string().trim().max(160).optional(),
        billingEmail: z.string().trim().email().max(160).optional(),
        vatNumber: z.string().trim().max(24).optional(),
      })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isOwner }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      db.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
    ]);
    if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
    if (!isOwner) throw new Error("Alleen de eigenaar kan de bedrijfsgegevens wijzigen.");

    const { error } = await db.rpc("update_company_profile_audited", {
      p_company_id: profile.company_id,
      p_actor: context.userId,
      p_name: data.name,
      ...(data.address ? { p_address: data.address } : {}),
      ...(data.billingEmail ? { p_billing_email: data.billingEmail } : {}),
      ...(data.vatNumber ? { p_vat_number: data.vatNumber } : {}),
    });
    if (error) throw new Error("Bedrijfsgegevens opslaan is mislukt.");
    return { ok: true };
  });

/** Aansluiten met een bedrijfscode is vervangen door persoonlijke uitnodigingen. */
export const joinCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ code: z.string().trim().max(12) }).parse(data))
  .handler(async (): Promise<{ companyId: string; companyName: string }> => {
    throw new Error("Aansluiten gaat nu via een persoonlijke uitnodiging van de eigenaar.");
  });

/** Werkgebied en productcapaciteit van het eigen bedrijf. */
export const getCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();

    const { data: regions } = await db.from("regions").select("code, name").order("code");
    if (!profile?.company_id) {
      return {
        regions: regions ?? [],
        selected: [] as string[],
        products: [] as Array<{ category: string; active: boolean; monthly_max: number }>,
      };
    }

    const [{ data: mine }, { data: products }] = await Promise.all([
      db.from("company_regions").select("region_code").eq("company_id", profile.company_id),
      db
        .from("company_products")
        .select("category, active, monthly_max")
        .eq("company_id", profile.company_id),
    ]);

    return {
      regions: regions ?? [],
      selected: (mine ?? []).map((r) => r.region_code),
      products: products ?? [],
    };
  });

export const saveCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        regions: z.array(z.string().regex(/^[1-9][0-9]$/)).max(90),
        products: z
          .array(
            z.object({
              category: z.string().max(24),
              active: z.boolean(),
              monthlyMax: z.number().int().min(0).max(500),
            }),
          )
          .max(6),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isOwner }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      db.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
    ]);
    if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
    if (!isOwner) throw new Error("Alleen de eigenaar kan werkgebied en capaciteit wijzigen.");

    await db.from("company_regions").delete().eq("company_id", profile.company_id);
    if (data.regions.length > 0) {
      await db
        .from("company_regions")
        .insert(
          data.regions.map((region_code) => ({ company_id: profile.company_id!, region_code })),
        );
    }

    if (data.products.length > 0) {
      await db.from("company_products").upsert(
        data.products.map((p) => ({
          company_id: profile.company_id!,
          category: p.category,
          active: p.active,
          monthly_max: p.monthlyMax,
        })),
        { onConflict: "company_id,category" },
      );
    }

    return { ok: true };
  });

/** Oude marktacties blijven herkenbaar, maar geven geen aanvragen meer vrij. */
export const listMarketplace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error("De leadmarkt is gesloten. Ga naar Mijn leads voor ontvangen aanvragen.");
  });

export const purchaseLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ leadId: z.string().uuid() }).parse(data))
  .handler(async () => {
    throw new Error("De leadmarkt is gesloten. Ga naar Mijn leads voor ontvangen aanvragen.");
  });

/** Gekochte en toegewezen leads van het eigen bedrijf, met volledige contactgegevens. */
export const listPurchasedLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) return [];

    const [{ data }, { data: members }, { data: complaints }] = await Promise.all([
      db
        .from("lead_purchases")
        .select(
          "id, status, note, created_at, purchased_by, assigned_to, source, price_ex_vat, billable, credited, opened_at, first_contact_at, contacted_within_24h, response_score, lead:leads(*)",
        )
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false }),
      db.from("profiles").select("id, full_name, email").eq("company_id", profile.company_id),
      db
        .from("complaints")
        .select("purchase_id, status, reason")
        .eq("company_id", profile.company_id),
    ]);

    const owners = new Map<string, string>();
    (members ?? []).forEach((m) => owners.set(m.id, m.full_name || m.email || "Onbekend"));
    const complaintByPurchase = new Map(
      (complaints ?? []).map((c) => [
        c.purchase_id,
        { status: c.status as string, reason: c.reason as string },
      ]),
    );

    return (data ?? []).map((p) => ({
      id: p.id,
      status: p.status as string,
      note: p.note,
      createdAt: p.created_at,
      source: p.source as string,
      price: Number(p.price_ex_vat ?? 0),
      billable: p.billable,
      credited: p.credited,
      openedAt: p.opened_at,
      firstContactAt: p.first_contact_at,
      within24h: p.contacted_within_24h,
      responseScore: p.response_score ?? 0,
      accountManager: p.purchased_by ? (owners.get(p.purchased_by) ?? "Toegewezen") : "Toegewezen",
      assignedTo: p.assigned_to ?? null,
      assignedName: p.assigned_to ? (owners.get(p.assigned_to) ?? "Onbekend") : null,
      complaint: complaintByPurchase.get(p.id) ?? null,
      lead: p.lead,
    }));
  });

/** Teamleden van het eigen bedrijf plus of de gebruiker mag toewijzen. */
export const listAssignableMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isOwner }, { data: isAdmin }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      db.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      adminRole(db, context.userId, context.claims),
    ]);
    if (!profile?.company_id) return { members: [], canAssign: false, me: context.userId };

    const { data: members } = await db
      .from("profiles")
      .select("id, full_name, email")
      .eq("company_id", profile.company_id);

    return {
      me: context.userId,
      canAssign: Boolean(isOwner || isAdmin),
      members: (members ?? []).map((m) => ({
        id: m.id,
        name: m.full_name || m.email || "Onbekend",
      })),
    };
  });

/** Wijst één of meer leads toe aan een accountmanager (alleen eigenaar/beheerder). */
export const assignPurchases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        purchaseIds: z.array(z.string().uuid()).min(1).max(100),
        assignedTo: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isOwner }, { data: isAdmin }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      db.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      adminRole(db, context.userId, context.claims),
    ]);
    if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
    if (!isOwner && !isAdmin) throw new Error("Alleen de eigenaar kan leads toewijzen.");

    if (data.assignedTo) {
      const { data: member } = await db
        .from("profiles")
        .select("id, company_id")
        .eq("id", data.assignedTo)
        .maybeSingle();
      if (!member || member.company_id !== profile.company_id) {
        throw new Error("Dit teamlid hoort niet bij jouw bedrijf.");
      }
    }

    const { error } = await db
      .from("lead_purchases")
      .update({ assigned_to: data.assignedTo })
      .in("id", data.purchaseIds)
      .eq("company_id", profile.company_id);
    if (error) throw new Error("Toewijzen is mislukt.");
    return { ok: true, count: data.purchaseIds.length };
  });

/** Aanvragen van het eigen bedrijf per regio, voor de kaartweergave. */
export const listCompanyLeadsByRegion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) return [];

    const [{ data: purchases }, { data: regions }] = await Promise.all([
      db
        .from("lead_purchases")
        .select("status, lead:leads(region_code, categories)")
        .eq("company_id", profile.company_id),
      db.from("regions").select("code, name"),
    ]);

    const nameByCode = new Map((regions ?? []).map((r) => [r.code, r.name]));
    const agg = new Map<
      string,
      { leads: number; won: number; categories: Record<string, number> }
    >();
    (purchases ?? []).forEach((p) => {
      const lead = p.lead as { region_code?: string | null; categories?: string[] | null } | null;
      const code = lead?.region_code;
      if (!code) return;
      const entry = agg.get(code) ?? { leads: 0, won: 0, categories: {} };
      entry.leads += 1;
      if ((p.status as string) === "won") entry.won += 1;
      (lead?.categories ?? []).forEach((c) => {
        entry.categories[c] = (entry.categories[c] ?? 0) + 1;
      });
      agg.set(code, entry);
    });

    return [...agg.entries()]
      .map(([code, entry]) => ({
        code,
        name: nameByCode.get(code) ?? code,
        leads: entry.leads,
        distributed: entry.won,
        categories: entry.categories,
        partners: 1,
        missingCategories: [] as string[],
      }))
      .sort((a, b) => b.leads - a.leads);
  });

/** Registreert de eerste keer openen van een lead (SLA). */
export const markLeadOpened = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ purchaseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");

    // Via de RPC, zodat de geschiedenis de juiste persoon vastlegt.
    const { data: opened } = await db.rpc("mark_purchase_opened", {
      p_purchase_id: data.purchaseId,
      p_company_id: profile.company_id,
      p_actor: context.userId,
    });
    return { ok: true, firstOpen: opened === true };
  });

export const updatePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        purchaseId: z.string().uuid(),
        status: z.enum(LEAD_STATUSES),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      adminRole(db, context.userId, context.claims),
    ]);
    if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");

    const { data: current } = await db
      .from("lead_purchases")
      .select("status, company_id")
      .eq("id", data.purchaseId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!current) throw new Error("Lead niet gevonden.");

    const check = checkStatusTransition(
      current.status as LeadStatus,
      data.status,
      isAdmin === true,
    );
    if (!check.ok) throw new Error(check.reason);

    const { data: rows, error } = await db.rpc("set_purchase_status", {
      p_purchase_id: data.purchaseId,
      p_company_id: profile.company_id,
      p_status: data.status,
      ...(data.note ? { p_note: data.note } : {}),
      p_actor: context.userId,
      p_source: isAdmin === true ? "admin" : "partner",
    });
    if (error) throw new Error("Bijwerken is mislukt.");
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row?.result === "not_found") throw new Error("Lead niet gevonden.");

    // Kwaliteitsscore bijwerken: direct bij een eindstatus, anders alleen als verouderd.
    const quality = await import("@/lib/quality.server");
    if (data.status === "won" || data.status === "lost") {
      await quality.recalculateQualityScores(profile.company_id).catch(() => undefined);
    } else {
      await quality.refreshQualityScoreIfStale(profile.company_id);
    }

    return { ok: true, changed: row?.changed === true };
  });

/** Tijdlijn van één ingekochte lead: statusgeschiedenis plus gebeurtenissen. */
export const getPurchaseTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ purchaseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      adminRole(db, context.userId, context.claims),
    ]);

    const { data: purchase } = await db
      .from("lead_purchases")
      .select("id, company_id")
      .eq("id", data.purchaseId)
      .maybeSingle();
    if (!purchase) throw new Error("Lead niet gevonden.");
    if (isAdmin !== true && purchase.company_id !== profile?.company_id) {
      throw new Error("Geen toegang tot deze lead.");
    }

    const [{ data: history }, { data: events }] = await Promise.all([
      db
        .from("lead_purchase_status_history")
        .select("id, from_status, to_status, changed_by, changed_by_role, source, note, created_at")
        .eq("lead_purchase_id", data.purchaseId)
        .order("created_at", { ascending: true }),
      db
        .from("audit_events")
        .select("id, event_type, actor_user_id, actor_role, source, metadata, created_at")
        .eq("entity_type", "lead_purchase")
        .eq("entity_id", data.purchaseId)
        .order("created_at", { ascending: true }),
    ]);

    const visible = (events ?? []).filter(
      (e) => isAdmin === true || PARTNER_VISIBLE_EVENTS.has(e.event_type),
    );

    return {
      isAdmin: isAdmin === true,
      history: history ?? [],
      events: visible,
    };
  });

/** Beheeroverzicht van gebeurtenissen, optioneel gefilterd. */
export const listAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        entityType: z
          .enum([
            "lead",
            "lead_purchase",
            "company",
            "complaint",
            "invoice",
            "credit_note",
            "payment",
          ])
          .optional(),
        entityId: z.string().uuid().optional(),
        companyId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .partial()
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: isAdmin } = await adminRole(db, context.userId, context.claims);
    if (!isAdmin) throw new Error("Alleen beheer kan het logboek inzien.");

    let query = db
      .from("audit_events")
      .select(
        "id, event_type, entity_type, entity_id, actor_user_id, actor_company_id, actor_role, source, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.entityType) query = query.eq("entity_type", data.entityType);
    if (data.entityId) query = query.eq("entity_id", data.entityId);
    if (data.companyId) query = query.eq("actor_company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error("Logboek laden is mislukt.");
    return rows ?? [];
  });

/** Reclamatie indienen op een ingekochte lead. */
export const fileComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        purchaseId: z.string().uuid(),
        reason: z.enum([
          "unreachable",
          "invalid_phone",
          "duplicate",
          "out_of_area",
          "no_interest",
          "spam",
        ]),
        details: z.string().trim().max(600).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");

    const { data: purchase } = await db
      .from("lead_purchases")
      .select("id, company_id")
      .eq("id", data.purchaseId)
      .maybeSingle();
    if (!purchase || purchase.company_id !== profile.company_id) {
      throw new Error("Deze lead hoort niet bij jullie bedrijf.");
    }

    const { error } = await db.from("complaints").insert({
      purchase_id: data.purchaseId,
      company_id: profile.company_id,
      created_by: context.userId,
      reason: data.reason,
      details: data.details ?? null,
    });
    if (error) throw new Error("Er is al een reclamatie ingediend voor deze lead.");
    return { ok: true };
  });

/** Reclamaties: eigen bedrijf, of alles voor beheerders. */
export const listComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      adminRole(db, context.userId, context.claims),
    ]);

    let query = db
      .from("complaints")
      .select(
        "id, reason, details, status, review_note, credit_ex_vat, created_at, reviewed_at, company:companies(name), credit_note:credit_notes(credit_number, total_inc_vat, status), purchase:lead_purchases(price_ex_vat, is_trial, invoice_id, lead:leads(first_name, last_name, postcode, categories))",
      )
      .order("created_at", { ascending: false });

    if (!isAdmin) {
      if (!profile?.company_id) return { isAdmin: false, items: [] };
      query = query.eq("company_id", profile.company_id);
    }

    const { data } = await query;
    return { isAdmin: Boolean(isAdmin), items: data ?? [] };
  });

export const reviewComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        complaintId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().max(600).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: isAdmin } = await adminRole(db, context.userId, context.claims);
    if (!isAdmin) throw new Error("Alleen platformbeheerders beoordelen reclamaties.");

    // Beoordeling, leadmarkering en eventuele creditnota gebeuren in één
    // databasehandeling: nooit "goedgekeurd zonder credit" of dubbele credits.
    const { data: rows, error } = await db.rpc("review_complaint_with_credit", {
      p_complaint_id: data.complaintId,
      p_approve: data.approve,
      p_actor: context.userId,
      ...(data.note ? { p_note: data.note } : {}),
    });
    if (error) throw new Error("Beoordelen is mislukt.");

    const row = (rows ?? [])[0];
    if (!row || row.result === "complaint_not_found") throw new Error("Reclamatie niet gevonden.");

    // Alleen een goedgekeurde reclamatie verandert de kwaliteitsscore; toch
    // herberekenen we in beide gevallen zodat de cijfers actueel blijven.
    const { data: complaint } = await db
      .from("complaints")
      .select("company_id")
      .eq("id", data.complaintId)
      .maybeSingle();
    if (complaint?.company_id) {
      const { recalculateQualityScores } = await import("@/lib/quality.server");
      await recalculateQualityScores(complaint.company_id).catch(() => undefined);
    }

    return {
      ok: true,
      result: row.result,
      creditNumber: row.credit_number,
      creditTotalIncVat: row.total_inc_vat === null ? null : Number(row.total_inc_vat),
      creditExVat: Number(row.credit_ex_vat ?? 0),
    };
  });

/** Facturen van het eigen bedrijf (beheerders zien alles). */
export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      adminRole(db, context.userId, context.claims),
    ]);

    let query = db
      .from("invoices")
      .select(
        "id, invoice_number, period_start, period_end, subtotal_ex_vat, vat_amount, total_inc_vat, credit_applied_inc_vat, amount_due_inc_vat, status, due_date, paid_at, payment_status, last_payment_attempt_at, payment_review_required, credit_notes:credit_notes!credit_notes_original_invoice_id_fkey(credit_number, total_inc_vat, status), company:companies(name), lines:invoice_lines(description, quantity, unit_price_ex_vat, amount_ex_vat), payments(provider_payment_id, status, amount, paid_at, created_at)",
      )
      .order("period_start", { ascending: false });

    if (!isAdmin) {
      if (!profile?.company_id) return { isAdmin: false, items: [] };
      query = query.eq("company_id", profile.company_id);
    }

    const { data } = await query;
    return { isAdmin: Boolean(isAdmin), items: data ?? [] };
  });

/** Alleen afgesloten maanden; iedere bedrijfsfactuur wordt atomair eenmaal uitgegeven. */
export const generateInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ year: z.number().int().min(2025).max(2100), month: z.number().int().min(1).max(12) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId, _role: "admin",
    });
    if (roleError || !isAdmin) throw new Error("Alleen platformbeheerders factureren na tweestapsverificatie.");
    if (!isBillingMonthClosed(data.year, data.month))
      throw new Error("Deze kalendermaand is nog niet afgesloten in Nederland. Facturatie gebeurt uitsluitend achteraf.");
    const db = await adminDb();
    const { data: companies, error } = await db.from("companies").select("id");
    if (error) throw new Error("Bedrijven ophalen is mislukt; er zijn geen facturen aangemaakt.");
    let created = 0;
    for (const company of companies ?? []) {
      const { data: result, error: invoiceError } = await db.rpc("issue_company_month_invoice", {
        p_company: company.id, p_year: data.year, p_month: data.month,
      });
      if (invoiceError) throw new Error(`Maandafsluiting onderbroken na ${created} nieuwe facturen. Probeer opnieuw; bestaande facturen worden niet dubbel gemaakt.`);
      if (result?.[0]?.created) created += 1;
    }
    return { ok: true, created };
  });

/** Teamoverzicht voor de eigenaar: account managers met prestaties en SLA. */
export const listTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
      db.rpc("has_role", { _user_id: context.userId, _role: "owner" }),
      adminRole(db, context.userId, context.claims),
    ]);
    if (!isOwner && !isAdmin) throw new Error("Alleen de bedrijfseigenaar ziet het teamoverzicht.");

    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id)
      return {
        members: [] as Array<never>,
        unassigned: 0,
        sla: { score: 0, opened24h: 0, contacted24h: 0, contacted48h: 0 },
      };

    const [{ data: members }, { data: purchases }, { data: roles }] = await Promise.all([
      db
        .from("profiles")
        .select("id, full_name, email, created_at")
        .eq("company_id", profile.company_id),
      db
        .from("lead_purchases")
        .select(
          "purchased_by, assigned_to, status, created_at, price_ex_vat, response_score, contacted_within_24h, contacted_within_48h, opened_at",
        )
        .eq("company_id", profile.company_id),
      db.from("user_roles").select("user_id, role"),
    ]);

    const roleByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = roleByUser.get(r.user_id) ?? [];
      list.push(r.role as string);
      roleByUser.set(r.user_id, list);
    });

    const all = purchases ?? [];
    const sla = {
      score: average(all.map((p) => p.response_score ?? 0)),
      opened24h: percentage(all.map((p) => Boolean(p.opened_at))),
      contacted24h: percentage(all.map((p) => p.contacted_within_24h)),
      contacted48h: percentage(all.map((p) => p.contacted_within_48h)),
    };

    return {
      sla,
      unassigned: all.filter((p) => !p.assigned_to).length,
      members: (members ?? []).map((m) => {
        const own = all.filter((p) => p.purchased_by === m.id);
        const mine = all.filter((p) => p.assigned_to === m.id);
        const won = mine.filter((p) => p.status === "won").length;
        const open = mine.filter((p) => p.status === "new" || p.status === "contacted").length;
        return {
          id: m.id,
          name: m.full_name || m.email || "Onbekend",
          email: m.email,
          roles: roleByUser.get(m.id) ?? [],
          purchased: own.length,
          assigned: mine.length,
          open,
          won,
          conversion: mine.length === 0 ? 0 : Math.round((won / mine.length) * 100),
          spend: mine.reduce((s, p) => s + Number(p.price_ex_vat ?? 0), 0),
          responseScore: average(mine.map((p) => p.response_score ?? 0)),
          contacted24h: percentage(mine.map((p) => p.contacted_within_24h)),
        };
      }),
    };
  });

/** Platformoverzicht voor beheerders, inclusief SLA per partner. */
export const listPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: isAdmin } = await adminRole(db, context.userId, context.claims);
    if (!isAdmin) throw new Error("Alleen platformbeheerders.");

    const [{ data: companies }, { count: leadCount }, { data: purchases }, { data: leadStates }] =
      await Promise.all([
        db
          .from("companies")
          .select("id, name, plan_name, monthly_lead_limit, monthly_fee_ex_vat, created_at"),
        db.from("leads").select("id", { count: "exact", head: true }),
        db
          .from("lead_purchases")
          .select(
            "company_id, status, price_ex_vat, billable, credited, response_score, contacted_within_24h",
          ),
        db.from("leads").select("state"),
      ]);

    const states = (leadStates ?? []).reduce<Record<string, number>>((acc, l) => {
      const key = (l.state as string) ?? "new";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    return {
      totalLeads: leadCount ?? 0,
      states,
      companies: (companies ?? []).map((c) => {
        const own = (purchases ?? []).filter((p) => p.company_id === c.id);
        return {
          id: c.id,
          name: c.name,
          plan_name: c.plan_name,
          monthly_lead_limit: c.monthly_lead_limit,
          purchased: own.length,
          revenue:
            Number(c.monthly_fee_ex_vat ?? 0) +
            own
              .filter((p) => p.billable && !p.credited)
              .reduce((s, p) => s + Number(p.price_ex_vat ?? 0), 0),
          responseScore: average(own.map((p) => p.response_score ?? 0)),
          contacted24h: percentage(own.map((p) => p.contacted_within_24h)),
        };
      }),
    };
  });

/**
 * Creditnota's van het eigen bedrijf (beheerders zien alles) plus het
 * openstaande tegoed. Alleen lezen: aanmaken en wijzigen gebeurt uitsluitend
 * in de database bij het goedkeuren van een reclamatie.
 */
export const listCreditNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const [{ data: profile }, { data: isAdmin }] = await Promise.all([
      db.from("profiles").select("company_id").eq("id", context.userId).maybeSingle(),
      adminRole(db, context.userId, context.claims),
    ]);

    let query = db
      .from("credit_notes")
      .select(
        "id, credit_number, status, subtotal_ex_vat, vat_rate, vat_amount, total_inc_vat, reason, description, issued_at, applied_at, company:companies(name), invoice:invoices!credit_notes_original_invoice_id_fkey(id, invoice_number), applied_invoice:invoices!credit_notes_applied_to_invoice_id_fkey(invoice_number), complaint_id, purchase:lead_purchases(id, lead:leads(first_name, last_name, postcode))",
      )
      .order("issued_at", { ascending: false });

    if (!isAdmin) {
      if (!profile?.company_id) return { isAdmin: false, items: [], openCreditIncVat: 0 };
      query = query.eq("company_id", profile.company_id);
    }

    const { data } = await query;
    const items = data ?? [];
    const openCreditIncVat =
      Math.round(
        items
          .filter((n) => n.status === "open")
          .reduce((sum, n) => sum + Number(n.total_inc_vat ?? 0), 0) * 100,
      ) / 100;

    return { isAdmin: Boolean(isAdmin), items, openCreditIncVat };
  });

/** Kwaliteitsscores van alle bedrijven — alleen beheer. */
export const listQualityScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: isAdmin } = await adminRole(db, context.userId, context.claims);
    if (!isAdmin) throw new Error("Alleen beheer ziet kwaliteitsscores.");

    const { data } = await db
      .from("company_quality_scores")
      .select(
        "company_id, overall_score, response_score, complaint_score, engagement_score, conversion_score, sample_size, quality_warning, metrics, calculated_at, company:companies(name, active)",
      )
      .order("overall_score", { ascending: false });

    return { items: data ?? [] };
  });

/** Eenvoudige prestatieweergave voor de eigen partner (geen concurrentiegegevens). */
export const getMyQualityScore = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (!profile?.company_id) return { score: null };

    const { refreshQualityScoreIfStale } = await import("@/lib/quality.server");
    await refreshQualityScoreIfStale(profile.company_id);

    const { data } = await db
      .from("company_quality_scores")
      .select(
        "response_score, complaint_score, engagement_score, conversion_score, sample_size, metrics, calculated_at",
      )
      .eq("company_id", profile.company_id)
      .maybeSingle();

    return { score: data ?? null };
  });

/** Herberekent kwaliteitsscores op basis van de echte historie — alleen beheer. */
export const recalculateQuality = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ companyId: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: isAdmin } = await adminRole(db, context.userId, context.claims);
    if (!isAdmin) throw new Error("Alleen beheer kan scores herberekenen.");

    const { recalculateQualityScores } = await import("@/lib/quality.server");
    const { updated } = await recalculateQualityScores(data.companyId);
    return { ok: true, updated };
  });
