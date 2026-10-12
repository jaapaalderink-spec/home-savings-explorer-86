import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { getCoverageByRegion } from "@/lib/service-areas.functions";
import { GAP_REASON_LABEL } from "@/lib/service-area-policy";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";

const panel = { boxShadow: "var(--shadow-panel)" };
// Begrenzing van Nederland voor de eenvoudige kaartprojectie.
const BOX = { minLng: 3.3, maxLng: 7.3, minLat: 50.7, maxLat: 53.6 };

export function ProductCoverage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["coverage-by-region"],
    queryFn: () => getCoverageByRegion(),
  });
  const categories = useMemo(
    () => [...new Set((data ?? []).map((r) => r.category))].sort(),
    [data],
  );
  const [cat, setCat] = useState<string>("");
  const active = cat || categories[0] || "";
  const rows = (data ?? []).filter((r) => r.category === active);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const shown = onlyGaps ? rows.filter((r) => r.gap_reason) : rows;

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  const covered = rows.filter((r) => !r.gap_reason).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-ink" htmlFor="cov-cat">
          Product
        </label>
        <select
          id="cov-cat"
          value={active}
          onChange={(e) => setCat(e.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c] ?? c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyGaps}
            onChange={(e) => setOnlyGaps(e.target.checked)}
          />
          Alleen tekorten
        </label>
        <span className="text-sm text-moss/70">
          {covered} van {rows.length} gebieden gedekt · vraag over de laatste 90 dagen
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-2xl bg-background p-4" style={panel}>
          <svg
            viewBox="0 0 300 330"
            className="h-auto w-full"
            role="img"
            aria-label="Dekkingskaart"
          >
            {rows.map((r) => {
              const x = ((r.lng - BOX.minLng) / (BOX.maxLng - BOX.minLng)) * 300;
              const y = ((BOX.maxLat - r.lat) / (BOX.maxLat - BOX.minLat)) * 330;
              const color = !r.gap_reason
                ? "var(--color-leaf)"
                : r.gap_reason === "capaciteit_te_laag"
                  ? "var(--color-sun, orange)"
                  : "var(--destructive)";
              return (
                <circle
                  key={r.region_code}
                  cx={x}
                  cy={y}
                  r={4 + Math.min(r.demand, 20) / 3}
                  fill={color}
                  opacity={0.8}
                >
                  <title>
                    {r.region_name}: {r.providers} aanbieders, capaciteit {r.capacity}, vraag{" "}
                    {r.demand}
                    {r.gap_reason ? ` — ${GAP_REASON_LABEL[r.gap_reason]}` : ""}
                  </title>
                </circle>
              );
            })}
          </svg>
          <p className="mt-2 text-xs text-moss/60">
            Groen = gedekt, oranje = capaciteit te laag, rood = geen dekking. Grotere stip = meer
            vraag.
          </p>
        </div>

        <div className="max-h-[560px] overflow-auto rounded-2xl bg-background" style={panel}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-left text-xs uppercase tracking-wide text-moss/60">
              <tr>
                <th className="p-3">Gebied</th>
                <th className="p-3">Provincie</th>
                <th className="p-3">Aanbieders</th>
                <th className="p-3">Capaciteit p/m</th>
                <th className="p-3">Vraag</th>
                <th className="p-3">Tekortreden</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.region_code} className="border-t border-moss/10">
                  <td className="p-3">
                    <span className="font-semibold text-ink">{r.region_name}</span>{" "}
                    <span className="text-xs text-moss/60">{r.region_code}</span>
                  </td>
                  <td className="p-3 text-moss/80">{r.province}</td>
                  <td className="p-3 text-moss/80">{r.providers}</td>
                  <td className="p-3 text-moss/80">{r.capacity}</td>
                  <td className="p-3 text-moss/80">{r.demand}</td>
                  <td className="p-3 text-moss/80">
                    {r.gap_reason ? GAP_REASON_LABEL[r.gap_reason] : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
