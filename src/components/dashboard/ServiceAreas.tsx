import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { getServiceAreas, saveServiceArea, searchPlaces } from "@/lib/service-areas.functions";
import { PROVINCES, type AreaMode } from "@/lib/service-area-policy";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";

const panel = { boxShadow: "var(--shadow-panel)" };

type Area = Awaited<ReturnType<typeof getServiceAreas>>["areas"][number];

export function ServiceAreas() {
  const { data, isLoading } = useQuery({
    queryKey: ["service-areas"],
    queryFn: () => getServiceAreas(),
  });
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <p className="text-sm text-moss/70">
        Stel per dienst in waar je klanten wilt ontvangen: een straal rond een plaats, één of meer
        provincies, of heel Nederland.
        {data.areas.length === 0 &&
          data.legacyRegionCount > 0 &&
          ` Nu gebruik je nog ${data.legacyRegionCount} postcodegebieden uit je oude instelling.`}
      </p>
      {data.products.length === 0 && (
        <p className="rounded-2xl bg-background p-5 text-sm" style={panel}>
          Je hebt nog geen diensten.
        </p>
      )}
      {data.products.map((p) => (
        <AreaCard
          key={p.category}
          category={p.category}
          active={p.active}
          area={data.areas.find((a) => a.category === p.category)}
          canEdit={data.canEdit}
        />
      ))}
    </div>
  );
}

function AreaCard({
  category,
  active,
  area,
  canEdit,
}: {
  category: string;
  active: boolean;
  area?: Area;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<AreaMode>((area?.mode as AreaMode) ?? "radius");
  const [radius, setRadius] = useState(area?.radius_km ?? 30);
  const [provinces, setProvinces] = useState<string[]>(area?.provinces ?? []);
  const [place, setPlace] = useState<{ label: string; lat: number; lng: number } | null>(
    area?.center_lat != null && area.center_lng != null
      ? { label: area.center_label ?? "", lat: area.center_lat, lng: area.center_lng }
      : null,
  );
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);
  const results = useQuery({
    queryKey: ["places", debounced],
    queryFn: () => searchPlaces({ data: { q: debounced } }),
    enabled: debounced.length >= 2,
  });

  const save = useMutation({
    mutationFn: () =>
      saveServiceArea({
        data: {
          category,
          mode,
          ...(mode === "radius" && place
            ? {
                centerLabel: place.label,
                centerLat: place.lat,
                centerLng: place.lng,
                radiusKm: radius,
              }
            : {}),
          ...(mode === "provinces" ? { provinces: provinces as never } : {}),
        },
      }),
    onSuccess: () => {
      toast.success(`Werkgebied voor ${CATEGORY_LABEL[category] ?? category} opgeslagen.`);
      qc.invalidateQueries({ queryKey: ["service-areas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = mode === "national" || (mode === "radius" ? !!place : provinces.length > 0);

  return (
    <section className="rounded-2xl bg-background p-5" style={panel}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-ink">
          {CATEGORY_LABEL[category] ?? category}
        </h3>
        {!active && <span className="text-xs text-moss/60">Deze dienst staat uit</span>}
      </div>

      <fieldset disabled={!canEdit} className="mt-3 space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Soort werkgebied">
          {(
            [
              ["radius", "Straal rond een plaats"],
              ["provinces", "Provincies"],
              ["national", "Heel Nederland"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              onClick={() => setMode(id)}
              className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
                mode === id ? "bg-moss text-cloud" : "bg-muted text-moss"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "radius" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`place-${category}`}>Plaats</Label>
              {place && (
                <p className="text-sm text-ink">
                  Gekozen: <strong>{place.label}</strong>
                </p>
              )}
              <Input
                id={`place-${category}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek een plaats of postcode"
              />
              {debounced.length >= 2 && (
                <ul className="divide-y divide-moss/10 rounded-md border border-input text-sm">
                  {results.isLoading && <li className="p-2 text-moss/60">Zoeken…</li>}
                  {results.data?.length === 0 && (
                    <li className="p-2 text-moss/60">Niets gevonden.</li>
                  )}
                  {results.data?.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="w-full p-2 text-left hover:bg-muted"
                        onClick={() => {
                          setPlace({ label: r.label, lat: r.lat, lng: r.lng });
                          setQuery("");
                        }}
                      >
                        {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <Label>Straal: {radius} km</Label>
              <Slider
                min={1}
                max={250}
                step={1}
                value={[radius]}
                onValueChange={(v) => setRadius(v[0] ?? 30)}
              />
            </div>
          </div>
        )}

        {mode === "provinces" && (
          <div className="grid gap-2 sm:grid-cols-3">
            {PROVINCES.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={provinces.includes(p)}
                  onCheckedChange={(v) =>
                    setProvinces((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))
                  }
                />
                {p}
              </label>
            ))}
          </div>
        )}

        {canEdit && (
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>
            Opslaan
          </Button>
        )}
      </fieldset>
      {!canEdit && (
        <p className="mt-2 text-xs text-moss/60">Alleen de eigenaar kan dit wijzigen.</p>
      )}
    </section>
  );
}
