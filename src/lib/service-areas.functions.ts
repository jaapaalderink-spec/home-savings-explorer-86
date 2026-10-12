import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";
import { PROVINCES } from "@/lib/service-area-policy";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/mapbox";

async function memberContext(userId: string, requireOwner: boolean) {
  const db = await adminDb();
  const [{ data: profile }, { data: isOwner }] = await Promise.all([
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    db.rpc("has_role", { _user_id: userId, _role: "owner" }),
  ]);
  if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
  if (requireOwner && !isOwner) throw new Error("Alleen de eigenaar kan werkgebieden wijzigen.");
  return { db, companyId: profile.company_id, isOwner: !!isOwner };
}

export const getServiceAreas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, companyId, isOwner } = await memberContext(context.userId, false);
    const [{ data: products }, { data: areas }, { data: regions }] = await Promise.all([
      db.from("company_products").select("category, active").eq("company_id", companyId),
      db
        .from("service_areas")
        .select(
          "category, mode, center_label, center_lat, center_lng, radius_km, provinces, updated_at",
        )
        .eq("company_id", companyId),
      db.from("company_regions").select("region_code").eq("company_id", companyId),
    ]);
    return {
      canEdit: isOwner,
      products: products ?? [],
      areas: (areas ?? []).map((a) => ({
        ...a,
        center_lat: a.center_lat === null ? null : Number(a.center_lat),
        center_lng: a.center_lng === null ? null : Number(a.center_lng),
      })),
      legacyRegionCount: (regions ?? []).length,
    };
  });

const areaSchema = z
  .object({
    category: z.string().min(2).max(24),
    mode: z.enum(["radius", "provinces", "national"]),
    centerLabel: z.string().trim().max(160).optional(),
    centerLat: z.number().min(50.6).max(53.7).optional(),
    centerLng: z.number().min(3.2).max(7.3).optional(),
    radiusKm: z.number().int().min(1).max(250).optional(),
    provinces: z.array(z.enum(PROVINCES)).max(PROVINCES.length).optional(),
  })
  .superRefine((v, ctx) => {
    if (
      v.mode === "radius" &&
      (v.centerLat === undefined || v.centerLng === undefined || !v.radiusKm)
    )
      ctx.addIssue({
        code: "custom",
        message: "Kies een plaats uit de zoekresultaten en een straal.",
      });
    if (v.mode === "provinces" && !v.provinces?.length)
      ctx.addIssue({ code: "custom", message: "Kies minstens één provincie." });
  });

export const saveServiceArea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => areaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { db, companyId } = await memberContext(context.userId, true);
    const { data: product } = await db
      .from("company_products")
      .select("category")
      .eq("company_id", companyId)
      .eq("category", data.category)
      .maybeSingle();
    if (!product) throw new Error("Dit product hoort niet bij jouw diensten.");

    const row = {
      company_id: companyId,
      category: data.category,
      mode: data.mode,
      center_label: data.mode === "radius" ? (data.centerLabel ?? null) : null,
      center_lat: data.mode === "radius" ? data.centerLat! : null,
      center_lng: data.mode === "radius" ? data.centerLng! : null,
      radius_km: data.mode === "radius" ? data.radiusKm! : null,
      provinces: data.mode === "provinces" ? data.provinces! : [],
    };
    const { error } = await db
      .from("service_areas")
      .upsert(row, { onConflict: "company_id,category" });
    if (error) throw new Error("Werkgebied opslaan is mislukt.");
    const { data: regionCount } = await db.rpc("sync_company_regions_from_areas", {
      p_company: companyId,
    });
    await db.rpc("log_audit_event_api", {
      p_event: "COMPANY_PROFILE_UPDATED",
      p_entity: "company",
      p_entity_id: companyId,
      p_company: companyId,
      p_actor: context.userId,
      p_source: "partner",
      p_metadata: { service_area: row },
    } as never);
    return { ok: true, regionCount: regionCount ?? 0 };
  });

/** Plaats zoeken; alleen een resultaat uit deze lijst kan als middelpunt dienen. */
export const searchPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const mapboxKey = process.env["MAPBOX_API_KEY"];
    if (!lovableKey || !mapboxKey) throw new Error("Plaatsen zoeken is nu niet beschikbaar.");
    const res = await fetch(
      `${GATEWAY_URL}/geocoding/v5/mapbox.places/${encodeURIComponent(data.q)}.json?country=nl&types=place,locality,postcode&language=nl&limit=6`,
      { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": mapboxKey } },
    );
    if (!res.ok) throw new Error("Plaatsen zoeken is mislukt.");
    const json = (await res.json()) as {
      features?: Array<{ id: string; center?: [number, number]; place_name?: string }>;
    };
    return (json.features ?? [])
      .filter((f) => f.center?.length === 2)
      .map((f) => ({
        id: f.id,
        label: (f.place_name ?? "").replace(/, Nederland$/, ""),
        lng: f.center![0],
        lat: f.center![1],
      }));
  });

export const getCoverageByRegion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb();
    const { data: isAdmin } = await db.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Alleen platformbeheerders.");
    const { data, error } = await db.rpc("coverage_by_region", { p_days: 90 });
    if (error) throw new Error("Dekking ophalen is mislukt.");
    return (data ?? []).map((r) => ({ ...r, lat: Number(r.lat), lng: Number(r.lng) }));
  });
