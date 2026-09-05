import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { NL_CENTER, regionCenter } from "@/lib/regions-geo";
import { geocodePostcodes } from "@/lib/geocode-client";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";

export type RegionPoint = {
  code: string;
  name: string;
  leads: number;
  distributed: number;
  partners: number;
  categories: Record<string, number>;
  missingCategories: string[];
};

export type PostcodePoint = {
  postcode: string;
  city: string | null;
  region: string | null;
  leads: number;
  distributed: number;
  categories: Record<string, number>;
  lastAt: string;
  lng: number | null;
  lat: number | null;
};

type Mode = "region" | "postcode";

const TOKEN = import.meta.env["VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN"] as string | undefined;

/** Kleine deterministische spreiding zodat postcodes zonder exacte coördinaat niet overlappen. */
function jitter(seed: string, index: number): [number, number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  const angle = ((hash + index * 137) % 360) * (Math.PI / 180);
  const radius = 0.03 + ((hash % 7) / 7) * 0.05;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6];
}

/** Interactieve kaart van Nederland: aanvragen per postcodegebied of per postcode. */
export default function RegionMap({
  regions,
  postcodes = [],
}: {
  regions: RegionPoint[];
  postcodes?: PostcodePoint[];
}) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mode, setMode] = useState<Mode>("postcode");
  const [selectedRegion, setSelectedRegion] = useState<RegionPoint | null>(null);
  const [selectedPostcode, setSelectedPostcode] = useState<PostcodePoint | null>(null);

  const regionFeatures = useMemo(
    () =>
      regions
        .map((r) => {
          const center = regionCenter(r.code);
          if (!center) return null;
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: center },
            properties: {
              code: r.code,
              leads: r.leads,
              gap: r.missingCategories.length > 0 || r.partners === 0 ? 1 : 0,
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    [regions],
  );

  const [geocoded, setGeocoded] = useState<Record<string, [number, number]>>({});

  // Postcodes zonder servercoördinaat in de browser opzoeken met de publieke token.
  useEffect(() => {
    if (!TOKEN) return;
    const missing = postcodes
      .filter((p) => p.lng === null || p.lat === null)
      .map((p) => p.postcode);
    if (missing.length === 0) return;
    let active = true;
    geocodePostcodes(missing, TOKEN).then((cache) => {
      if (active) setGeocoded(cache);
    });
    return () => {
      active = false;
    };
  }, [postcodes]);

  const postcodeFeatures = useMemo(
    () =>
      postcodes
        .map((p, index) => {
          let coords: [number, number] | null =
            p.lng !== null && p.lat !== null ? [p.lng, p.lat] : (geocoded[p.postcode] ?? null);
          let approx = 0;
          if (!coords) {
            const fallback = regionCenter(p.region ?? p.postcode.slice(0, 2));
            if (!fallback) return null;
            const [dx, dy] = jitter(p.postcode, index);
            coords = [fallback[0] + dx, fallback[1] + dy];
            approx = 1;
          }
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: coords },
            properties: {
              postcode: p.postcode,
              leads: p.leads,
              approx,
              gap: p.distributed === 0 ? 1 : 0,
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    [postcodes, geocoded],
  );

  const approxCount = postcodes.filter(
    (p) => (p.lng === null || p.lat === null) && !geocoded[p.postcode],
  ).length;

  useEffect(() => {
    if (!container.current || !TOKEN || map.current) return;
    mapboxgl.accessToken = TOKEN;
    const instance = new mapboxgl.Map({
      container: container.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: NL_CENTER,
      zoom: 6.3,
      attributionControl: true,
    });
    instance.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const features = mode === "region" ? regionFeatures : postcodeFeatures;
    const max = Math.max(1, ...features.map((f) => f.properties.leads));
    const idKey = mode === "region" ? "code" : "postcode";

    const apply = () => {
      const data = { type: "FeatureCollection" as const, features };
      const src = instance.getSource("lead-points") as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        instance.setPaintProperty("lead-points-circles", "circle-radius", [
          "interpolate",
          ["linear"],
          ["get", "leads"],
          0,
          mode === "region" ? 8 : 6,
          max,
          mode === "region" ? 34 : 24,
        ]);
        return;
      }
      instance.addSource("lead-points", { type: "geojson", data });
      instance.addLayer({
        id: "lead-points-circles",
        type: "circle",
        source: "lead-points",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "leads"], 0, 6, max, 24],
          "circle-color": ["case", ["==", ["get", "gap"], 1], "#f0b84f", "#4f8f62"],
          "circle-opacity": 0.72,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#17211b",
        },
      });
      instance.addLayer({
        id: "lead-points-labels",
        type: "symbol",
        source: "lead-points",
        layout: { "text-field": ["get", "leads"], "text-size": 11 },
        paint: { "text-color": "#17211b" },
      });
      instance.on("click", "lead-points-circles", (e) => {
        const feature = e.features?.[0] as { properties?: Record<string, unknown> } | undefined;
        const id = feature?.properties?.[idKey] as string | undefined;
        if (!id) return;
        setSelectedRegion(regions.find((r) => r.code === id) ?? null);
        setSelectedPostcode(postcodes.find((p) => p.postcode === id) ?? null);
      });
      instance.on("mouseenter", "lead-points-circles", () => {
        instance.getCanvas().style.cursor = "pointer";
      });
      instance.on("mouseleave", "lead-points-circles", () => {
        instance.getCanvas().style.cursor = "";
      });
    };

    if (instance.isStyleLoaded()) apply();
    else instance.once("load", apply);
  }, [mode, regionFeatures, postcodeFeatures, regions, postcodes]);

  if (!TOKEN) {
    return (
      <p
        className="rounded-2xl bg-background p-6 text-sm text-moss/80"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        Koppel Mapbox om de kaart te tonen. Zonder kaart zie je de regio's in de tabel hieronder.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-full border border-moss/20 bg-background text-sm">
          {(
            [
              ["postcode", "Per postcode"],
              ["region", "Per gebied"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setSelectedRegion(null);
                setSelectedPostcode(null);
              }}
              aria-pressed={mode === value}
              className={`px-4 py-2 font-semibold transition-colors ${
                mode === value ? "bg-leaf text-background" : "text-moss/80 hover:bg-cloud"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-moss/70">
          {mode === "postcode"
            ? `${postcodes.length} postcodes met aanvragen${approxCount > 0 ? ` · ${approxCount} benaderd op gebiedsniveau` : ""}`
            : `${regions.length} postcodegebieden`}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <div
          ref={container}
          role="application"
          aria-label="Kaart van Nederland met aanvragen per postcode"
          className="h-[26rem] w-full overflow-hidden rounded-2xl"
          style={{ boxShadow: "var(--shadow-panel)" }}
        />
        <aside
          className="rounded-2xl bg-background p-4"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          {mode === "postcode" ? (
            !selectedPostcode ? (
              <p className="text-sm text-moss/70">
                Klik op een stip voor de postcodedetails. Groen = verdeeld, geel = nog geen partner.
              </p>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="text-lg font-bold text-ink">{selectedPostcode.postcode}</p>
                <p className="text-moss/80">
                  {selectedPostcode.city ?? "Onbekende plaats"}
                  {selectedPostcode.region ? ` · gebied ${selectedPostcode.region}` : ""}
                </p>
                <p className="text-moss/80">
                  {selectedPostcode.leads} aanvragen · {selectedPostcode.distributed} verdeeld
                </p>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-moss/60">
                    Categorieën
                  </p>
                  <ul className="mt-1 space-y-0.5 text-moss/80">
                    {Object.entries(selectedPostcode.categories).map(([cat, n]) => (
                      <li key={cat}>
                        {CATEGORY_LABEL[cat] ?? cat}: {n}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-xs text-moss/60">
                  Laatste aanvraag: {new Date(selectedPostcode.lastAt).toLocaleDateString("nl-NL")}
                </p>
              </div>
            )
          ) : !selectedRegion ? (
            <p className="text-sm text-moss/70">
              Klik op een gebied voor details. Groen = gedekt, geel = ontbrekende partnerdekking.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-lg font-bold text-ink">
                {selectedRegion.code} · {selectedRegion.name}
              </p>
              <p className="text-moss/80">
                {selectedRegion.leads} aanvragen · {selectedRegion.distributed} verdeeld ·{" "}
                {selectedRegion.partners} partners
              </p>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-moss/60">
                  Categorieën
                </p>
                <ul className="mt-1 space-y-0.5 text-moss/80">
                  {Object.entries(selectedRegion.categories).map(([cat, n]) => (
                    <li key={cat}>
                      {CATEGORY_LABEL[cat] ?? cat}: {n}
                    </li>
                  ))}
                </ul>
              </div>
              {selectedRegion.missingCategories.length > 0 && (
                <p
                  className="rounded-xl p-2 text-xs font-semibold text-ink"
                  style={{ backgroundColor: "#f7e3bd" }}
                >
                  Geen partner voor:{" "}
                  {selectedRegion.missingCategories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ")}
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
