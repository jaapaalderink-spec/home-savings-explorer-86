import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";
import { PROVINCES, SERVICE_CATEGORIES } from "@/lib/service-area-policy";
import {
  DEFAULT_TERMS,
  areaProblem,
  companyTotal,
  type Area,
  type CompanyArea,
  type CostTerms,
  type RecipientRow,
} from "@/lib/lead-settings-policy";

type Db = Awaited<ReturnType<typeof adminDb>>;

/** Hoofdaccount, of accountmanager met expliciete toestemming van het hoofdaccount. */
async function settingsContext(userId: string) {
  const db = await adminDb();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
  const companyId = profile.company_id;
  const owner = roles?.some((r) => r.role === "owner") === true;
  const manager = roles?.some((r) => r.role === "account_manager") === true;
  if (!owner && !manager) throw new Error("Geen toegang tot het partnerportaal.");
  let delegated = false;
  if (!owner) {
    const { data } = await db
      .from("lead_recipients")
      .select("can_edit_settings")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle();
    delegated = data?.can_edit_settings === true;
  }
  return { db, companyId, owner, canEdit: owner || delegated };
}

function monthStartUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function loadMembers(db: Db, companyId: string) {
  const { data: profiles } = await db
    .from("profiles")
    .select("id, full_name, email")
    .eq("company_id", companyId);
  const ids = (profiles ?? []).map((p) => p.id);
  const { data: roles } = ids.length
    ? await db.from("user_roles").select("user_id, role").in("user_id", ids)
    : { data: [] as Array<{ user_id: string; role: string }> };
  return (profiles ?? [])
    .map((p) => {
      const r = (roles ?? []).filter((x) => x.user_id === p.id).map((x) => x.role);
      const role = r.includes("owner") ? "owner" : r.includes("account_manager") ? "account_manager" : null;
      return { id: p.id, name: p.full_name || p.email || "Onbekend", email: p.email, role };
    })
    .filter((m): m is typeof m & { role: "owner" | "account_manager" } => m.role !== null)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? 1 : -1));
}

function companyAreaOf(a: {
  mode: string;
  center_lat: number | string | null;
  center_lng: number | string | null;
  radius_km: number | null;
  provinces: string[];
} | undefined): CompanyArea {
  if (!a) return null;
  if (a.mode === "national") return { mode: "national" };
  if (a.mode === "provinces") return { mode: "provinces", provinces: a.provinces ?? [] };
  return {
    mode: "radius",
    centerLat: Number(a.center_lat),
    centerLng: Number(a.center_lng),
    radiusKm: a.radius_km ?? 0,
  };
}

async function loadTerms(db: Db, companyId: string): Promise<CostTerms & { contract: boolean; packageQuota: number | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("subscription_versions")
    .select("platform_fee_ex_vat, seat_fee_ex_vat, paid_seats, base_lead_price_ex_vat, extra_product_price_ex_vat, package_code, lead_quota_per_month")
    .eq("company_id", companyId)
    .lte("valid_from", today)
    .order("valid_from", { ascending: false })
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { ...DEFAULT_TERMS, paidSeats: 0, contract: false, packageQuota: null };
  return {
    platformFee: Number(data.platform_fee_ex_vat),
    seatFee: Number(data.seat_fee_ex_vat),
    paidSeats: data.paid_seats,
    baseLeadPrice: Number(data.base_lead_price_ex_vat),
    extraProductPrice: Number(data.extra_product_price_ex_vat),
    contract: true,
    packageQuota: data.package_code ? data.lead_quota_per_month : null,
  };
}

export const getLeadSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, companyId, owner, canEdit } = await settingsContext(context.userId);
    const since = monthStartUtc();
    const [members, terms, { data: prefs }, { data: recipients }, { data: services }, { data: products }, { data: areas }, { data: month }] =
      await Promise.all([
        loadMembers(db, companyId),
        loadTerms(db, companyId),
        db.from("company_lead_preferences").select("settings_enabled, accept_extra_products").eq("company_id", companyId).maybeSingle(),
        db.from("lead_recipients").select("user_id, paused, can_edit_settings").eq("company_id", companyId),
        db.from("lead_recipient_services").select("*").eq("company_id", companyId),
        db.from("company_products").select("category, active").eq("company_id", companyId),
        db.from("service_areas").select("category, mode, center_label, center_lat, center_lng, radius_km, provinces").eq("company_id", companyId),
        db.from("lead_purchases").select("assigned_to, primary_product, products, price_ex_vat, billable").eq("company_id", companyId).gte("created_at", since),
      ]);

    const delivered: Record<string, number> = {};
    let extraParts = 0;
    let accrued = 0;
    (month ?? []).forEach((p) => {
      if (p.primary_product && p.assigned_to) {
        const k = `${p.assigned_to}:${p.primary_product}`;
        delivered[k] = (delivered[k] ?? 0) + 1;
      }
      if (p.primary_product) extraParts += Math.max((p.products?.length ?? 1) - 1, 0);
      if (p.billable) accrued += Math.round(Number(p.price_ex_vat) * 100);
    });

    const rows = members.map((m) => {
      const r = (recipients ?? []).find((x) => x.user_id === m.id);
      return {
        userId: m.id,
        name: m.name,
        role: m.role,
        paused: r?.paused ?? false,
        canEditSettings: m.role === "owner" ? true : r?.can_edit_settings ?? false,
        services: SERVICE_CATEGORIES.map((category) => {
          const s = (services ?? []).find((x) => x.user_id === m.id && x.category === category);
          const area: Area =
            !s?.area_mode
              ? { mode: null }
              : s.area_mode === "national"
                ? { mode: "national" }
                : s.area_mode === "provinces"
                  ? { mode: "provinces", provinces: s.provinces ?? [] }
                  : {
                      mode: "radius",
                      centerLat: Number(s.center_lat),
                      centerLng: Number(s.center_lng),
                      radiusKm: s.radius_km ?? 30,
                      centerLabel: s.center_label ?? "",
                    };
          return {
            category,
            enabled: s?.enabled ?? false,
            monthlyMax: s?.monthly_max ?? 0,
            delivered: delivered[`${m.id}:${category}`] ?? 0,
            area,
          };
        }),
      };
    });

    const deliveredPrimary = (month ?? []).filter((p) => p.primary_product).length;
    return {
      owner,
      canEdit,
      settingsEnabled: prefs?.settings_enabled ?? false,
      acceptExtraProducts: prefs?.accept_extra_products ?? true,
      companyServices: SERVICE_CATEGORIES.map((category) => {
        const p = (products ?? []).find((x) => x.category === category);
        const a = (areas ?? []).find((x) => x.category === category);
        return {
          category,
          active: p?.active ?? false,
          area: companyAreaOf(a),
          areaLabel: a
            ? a.mode === "national"
              ? "Heel Nederland"
              : a.mode === "provinces"
                ? (a.provinces ?? []).join(", ")
                : `${a.radius_km} km rond ${a.center_label ?? "gekozen plaats"}`
            : null,
        };
      }),
      rows,
      terms,
      month: { deliveredPrimary, extraParts, accruedVariable: accrued / 100 },
    };
  });

const areaSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.null() }),
  z.object({ mode: z.literal("national") }),
  z.object({ mode: z.literal("provinces"), provinces: z.array(z.enum(PROVINCES)).min(1).max(PROVINCES.length) }),
  z.object({
    mode: z.literal("radius"),
    centerLat: z.number().min(50.6).max(53.7),
    centerLng: z.number().min(3.2).max(7.3),
    radiusKm: z.number().int().min(1).max(250),
    centerLabel: z.string().trim().max(160).optional(),
  }),
]);

const saveSchema = z.object({
  acceptExtraProducts: z.boolean(),
  rows: z
    .array(
      z.object({
        userId: z.string().uuid(),
        paused: z.boolean(),
        canEditSettings: z.boolean(),
        services: z
          .array(
            z.object({
              category: z.enum(SERVICE_CATEGORIES),
              enabled: z.boolean(),
              monthlyMax: z.number().int().min(0).max(10000),
              area: areaSchema,
            }),
          )
          .length(SERVICE_CATEGORIES.length),
      }),
    )
    .min(1)
    .max(100),
});

export const saveLeadSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { db, companyId, owner, canEdit } = await settingsContext(context.userId);
    if (!canEdit) throw new Error("Je hebt geen toestemming om de leadinstellingen te wijzigen.");

    const members = await loadMembers(db, companyId);
    const memberIds = new Set(members.map((m) => m.id));
    if (data.rows.some((r) => !memberIds.has(r.userId)))
      throw new Error("Een ontvanger hoort niet (meer) bij jouw bedrijf. Herlaad de pagina.");

    const [{ data: products }, { data: areas }, { data: existing }] = await Promise.all([
      db.from("company_products").select("category, active").eq("company_id", companyId),
      db.from("service_areas").select("category, mode, center_lat, center_lng, radius_km, provinces").eq("company_id", companyId),
      db.from("lead_recipients").select("user_id, can_edit_settings").eq("company_id", companyId),
    ]);

    const problems: string[] = [];
    for (const r of data.rows) {
      const name = members.find((m) => m.id === r.userId)!.name;
      for (const s of r.services) {
        if (!s.enabled) continue;
        const active = (products ?? []).some((p) => p.category === s.category && p.active);
        if (!active)
          problems.push(`${name}: de dienst ${s.category} staat voor het bedrijf uit. Zet deze eerst aan bij Werkgebied.`);
        const issue = areaProblem(companyAreaOf((areas ?? []).find((a) => a.category === s.category)), s.area as Area);
        if (issue) problems.push(`${name} (${s.category}): ${issue}`);
      }
    }
    if (problems.length) throw new Error(problems.slice(0, 3).join(" "));

    // Alleen het hoofdaccount mag bewerkrechten toekennen of intrekken.
    const prevEdit = new Map((existing ?? []).map((e) => [e.user_id, e.can_edit_settings]));
    const now = new Date().toISOString();
    const recipients = data.rows.map((r) => ({
      company_id: companyId,
      user_id: r.userId,
      paused: r.paused,
      can_edit_settings: owner ? r.canEditSettings : prevEdit.get(r.userId) ?? false,
      updated_by: context.userId,
      updated_at: now,
    }));
    const services = data.rows.flatMap((r) =>
      r.services.map((s) => ({
        company_id: companyId,
        user_id: r.userId,
        category: s.category,
        enabled: s.enabled,
        monthly_max: s.monthlyMax,
        area_mode: s.area.mode,
        center_label: s.area.mode === "radius" ? s.area.centerLabel ?? null : null,
        center_lat: s.area.mode === "radius" ? s.area.centerLat : null,
        center_lng: s.area.mode === "radius" ? s.area.centerLng : null,
        radius_km: s.area.mode === "radius" ? s.area.radiusKm : null,
        provinces: s.area.mode === "provinces" ? s.area.provinces : [],
        updated_at: now,
      })),
    );

    const r1 = await db.from("lead_recipients").upsert(recipients, { onConflict: "company_id,user_id" });
    if (r1.error) throw new Error("Opslaan van de ontvangers is mislukt.");
    const r2 = await db.from("lead_recipient_services").upsert(services, { onConflict: "company_id,user_id,category" });
    if (r2.error) throw new Error("Opslaan van de aantallen is mislukt.");
    const r3 = await db.from("company_lead_preferences").upsert(
      { company_id: companyId, settings_enabled: true, accept_extra_products: data.acceptExtraProducts, updated_by: context.userId, updated_at: now },
      { onConflict: "company_id" },
    );
    if (r3.error) throw new Error("Opslaan van de voorkeuren is mislukt.");

    // Bedrijfscapaciteit per dienst volgt uit de interne aantallen (voor overzicht en dekking).
    const rows: RecipientRow[] = data.rows.map((r) => ({ userId: r.userId, paused: r.paused, services: r.services as RecipientRow["services"] }));
    for (const c of SERVICE_CATEGORIES) {
      if (!(products ?? []).some((p) => p.category === c)) continue;
      const sum = rows.reduce((t, r) => t + r.services.filter((s) => s.category === c && s.enabled).reduce((a, s) => a + s.monthlyMax, 0), 0);
      await db.from("company_products").update({ monthly_max: sum }).eq("company_id", companyId).eq("category", c);
    }

    await db.rpc("log_audit_event_api", {
      p_event: "COMPANY_COMMERCIAL_SETTINGS_UPDATED",
      p_entity: "company",
      p_entity_id: companyId,
      p_company: companyId,
      p_actor: context.userId,
      p_source: "partner",
      p_metadata: { kind: "lead_settings", companyTotal: companyTotal(rows), acceptExtraProducts: data.acceptExtraProducts },
    } as never);

    return { ok: true, companyTotal: companyTotal(rows) };
  });
