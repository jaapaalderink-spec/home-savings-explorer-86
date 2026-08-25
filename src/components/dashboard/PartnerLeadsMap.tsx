import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Mail, MapPin, Phone, UserCheck } from "lucide-react";
import { NL_CENTER, regionCenter } from "@/lib/regions-geo";
import { geocodePostcodes } from "@/lib/geocode-client";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";

export type MapLead = {
  id: string;
  status: string;
  price: number;
  createdAt: string;
  assignedName: string | null;
  lead: Record<string, unknown> | null;
};

const TOKEN = import.meta.env["VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN"] as string | undefined;

const STATUS_COLOR: Record<string, string> = {
  new: "#f0b84f",
  contacted: "#4f8f62",
  quoted: "#315642",
  won: "#17211b",
  lost: "#9aa79d",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Nieuw",
  contacted: "Gebeld",
  quoted: "Offerte uit",
  won: "Gewonnen",
  lost: "Verloren",
};

/** Deterministische spreiding zodat leads op dezelfde postcode niet overlappen. */
function jitter(seed: string, index: number): [number, number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  const angle = ((hash + index * 97) % 360) * (Math.PI / 180);
  const radius = 0.008 + ((hash % 5) / 5) * 0.012;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.6];
}

function normalize(postcode: string) {
  return postcode.replace(/\s+/g, "").toUpperCase().slice(0, 6);
}

/** Kaart met de ingekochte leads van het eigen bedrijf, gekleurd op opvolgstatus. */
export default function PartnerLeadsMap({ leads }: { leads: MapLead[] }) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [geocoded, setGeocoded] = useState<Record<string, [number, number]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const postcodes = useMemo(
    () =>
      [
        ...new Set(
          leads
            .map((p) => normalize(String(p.lead?.["postcode"] ?? "")))
            .filter((p) => p.length >= 4),
        ),
      ],
    [leads],
  );

  useEffect(() => {
    if (!TOKEN || postcodes.length === 0) return;
    let active = true;
    geocodePostcodes(postcodes, TOKEN).then((cache) => {
      if (active) setGeocoded(cache);
    });
    return () => {
      active = false;
    };
  }, [postcodes]);

  const features = useMemo(
    () =>
      leads
        .map((p, index) => {
          const postcode = normalize(String(p.lead?.["postcode"] ?? ""));
          if (postcode.length < 4) return null;
          const base = geocoded[postcode] ?? regionCenter(postcode.slice(0, 2));
          if (!base) return null;
          const [dx, dy] = jitter(postcode + p.id, index);
          return {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [base[0] + dx, base[1] + dy] },
            properties: {
              id: p.id,
              color: STATUS_COLOR[p.status] ?? "#4f8f62",
              approx: geocoded[postcode] ? 0 : 1,
            },
          };
        })
        .filter((f): f is NonNullable<typeof f> => f !== null),
    [leads, geocoded],
  );

  const approxCount = features.filter((f) => f.properties.approx === 1).length;
  const selected = leads.find((p) => p.id === selectedId) ?? null;

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

    const apply = () => {
      const data = { type: "FeatureCollection" as const, features };
      const src = instance.getSource("my-leads") as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        src.setData(data);
        return;
      }
      instance.addSource("my-leads", { type: "geojson", data });
      instance.addLayer({
        id: "my-leads-circles",
        type: "circle",
        source: "my-leads",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, 12],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.85,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });
      instance.on("click", "my-leads-circles", (e) => {
        const feature = e.features?.[0] as { properties?: Record<string, unknown> } | undefined;
        const id = feature?.properties?.["id"];
        if (typeof id === "string") setSelectedId(id);
      });
      instance.on("mouseenter", "my-leads-circles", () => {
        instance.getCanvas().style.cursor = "pointer";
      });
      instance.on("mouseleave", "my-leads-circles", () => {
        instance.getCanvas().style.cursor = "";
      });
    };

    if (instance.isStyleLoaded()) apply();
    else instance.once("load", apply);
  }, [features]);

  if (!TOKEN) {
    return (
      <p className="rounded-2xl bg-background p-6 text-sm text-moss/80" style={{ boxShadow: "var(--shadow-panel)" }}>
        Koppel Mapbox om je leads op de kaart te zien. Gebruik intussen de lijstweergave.
      </p>
    );
  }

  const lead = (selected?.lead ?? {}) as Record<string, unknown>;
  const categories = (lead["categories"] as string[] | null) ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs text-moss/75">
        {Object.entries(STATUS_LABEL).map(([id, label]) => (
          <span key={id} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[id], border: "1px solid #17211b22" }}
            />
            {label}
          </span>
        ))}
        <span className="ml-auto">
          {features.length} leads op de kaart
          {approxCount > 0 ? ` · ${approxCount} benaderd op gebiedsniveau` : ""}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div
          ref={container}
          role="application"
          aria-label="Kaart met de ingekochte leads van jouw bedrijf"
          className="h-[26rem] w-full overflow-hidden rounded-2xl"
          style={{ boxShadow: "var(--shadow-panel)" }}
        />
        <aside className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
          {selected ? (
            <div className="space-y-2 text-xs text-moss/80">
              <p className="text-sm font-bold text-ink">
                {String(lead["first_name"] ?? "")} {String(lead["last_name"] ?? "")}
              </p>
              <p className="inline-flex items-center gap-1">
                <MapPin size={12} /> {String(lead["postcode"] ?? "")} {String(lead["house_number"] ?? "")}{" "}
                {String(lead["city"] ?? "")}
              </p>
              <p className="inline-flex items-center gap-1">
                <Mail size={12} /> {String(lead["email"] ?? "")}
              </p>
              <p className="inline-flex items-center gap-1">
                <Phone size={12} /> {String(lead["phone"] ?? "")}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {categories.map((c) => (
                  <span
                    key={c}
                    className="rounded-full px-2 py-0.5 font-semibold text-moss"
                    style={{ backgroundColor: "#f7e3bd" }}
                  >
                    {CATEGORY_LABEL[c] ?? c}
                  </span>
                ))}
              </div>
              <p className="pt-1 font-semibold text-moss">
                Status: {STATUS_LABEL[selected.status] ?? selected.status}
              </p>
              <p className="inline-flex items-center gap-1">
                <UserCheck size={12} /> {selected.assignedName ?? "Niet toegewezen"}
              </p>
              <p>
                {formatEuro(selected.price)} · {new Date(selected.createdAt).toLocaleDateString("nl-NL")}
              </p>
            </div>
          ) : (
            <p className="text-sm text-moss/70">
              Klik op een stip om de contactgegevens en status van die lead te zien.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
