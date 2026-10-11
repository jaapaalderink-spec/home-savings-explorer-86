import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPartnerContext } from "@/lib/partner.functions";
import { debugScenario, MEASURES, MEASURE_LABEL, parseProfile, type EnergyProfile } from "@/lib/home-savings/scenario";

const EXAMPLE = JSON.stringify(
  { existingPanels: 8, existingYield: 3000, newPanels: 8, netMetering: true, year: 2026, provided: ["existingPanels", "existingYield"] },
  null,
  2,
);
const n = (v: number, d = 0) => v.toLocaleString("nl-NL", { maximumFractionDigits: d, minimumFractionDigits: d });

/** Admin-only check of every intermediate value of one calculation. */
export function CalculationDebug() {
  const { data } = useQuery({ queryKey: ["partner-context"], queryFn: () => getPartnerContext() });
  const [json, setJson] = useState(EXAMPLE);
  const [cats, setCats] = useState<string[]>(["solar", "battery"]);
  if (!data?.roles.includes("admin")) return <p className="text-sm text-moss">Alleen voor beheerders.</p>;

  let profile: EnergyProfile;
  let error = "";
  try {
    // Accept a raw profile or a full quotation URL containing energyProfile=...
    const raw = json.includes("energyProfile=") ? new URL(json.trim()).searchParams.get("energyProfile") : json;
    JSON.parse(raw ?? "");
    profile = parseProfile(raw);
  } catch {
    error = "Ongeldige invoer; standaardprofiel gebruikt.";
    profile = parseProfile(null);
  }
  const d = debugScenario(profile, cats);
  const src = (k: keyof EnergyProfile) => (d.profile.provided.includes(k) ? "ingevoerd" : "geschat");
  const sims = [
    ["Vóór", d.before],
    ["Ná", d.after],
  ] as const;
  const rows: [string, (s: typeof d.before) => string, string?][] = [
    ["Bestaande opwek (kWh)", (s) => n(s.existingProduction), src("existingYield")],
    ["Nieuwe opwek (kWh)", (s) => n(s.newProduction), src("newPanels")],
    ["Huishoudelijk verbruik bruto (kWh)", (s) => n(s.grossConsumption), src("consumption")],
    ["Totale vraag in model (kWh)", (s) => n(s.demand)],
    ["Direct eigenverbruik (kWh)", (s) => n(s.direct)],
    ["Batterijlading uit zon (kWh)", (s) => n(s.charged)],
    ["Batterijlading uit net (kWh)", (s) => n(s.gridCharged)],
    ["Batterijontlading (kWh)", (s) => n(s.discharged)],
    ["Batterijverliezen (kWh)", (s) => n(s.losses)],
    ["Netafname (kWh)", (s) => n(s.imports)],
    ["Teruglevering (kWh)", (s) => n(s.exports)],
    ["Salderingsvolume (kWh)", (s) => n(s.netted)],
    ["Stroominkoop (€)", (s) => n(s.importCost, 2)],
    ["Terugleververgoeding (€)", (s) => n(s.exportRevenue, 2)],
    ["Terugleverkosten (€)", (s) => n(s.exportCosts, 2), src("exportCostModel")],
    ["Stand-by batterij (€)", (s) => n(s.standbyCost, 2), src("batteryStandbyW")],
    ["Gas (€)", (s) => n(s.gasCost, 2), src("gas")],
    ["Openbaar laden (€)", (s) => n(s.publicChargeCost, 2)],
    ["Energiekosten (€)", (s) => n(s.cost, 2)],
    ["Max. balansfout per uur", (s) => s.balanceError.toExponential(1)],
  ];

  return (
    <div className="space-y-4 rounded-2xl bg-background p-5 text-sm">
      <h2 className="text-lg font-semibold text-ink">Rekencontrole</h2>
      <textarea
        className="h-40 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
        value={json}
        onChange={(e) => setJson(e.target.value)}
        aria-label="Woningprofiel (JSON) of offertelink"
      />
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-3">
        {MEASURES.map((m) => (
          <label key={m} className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={cats.includes(m)}
              onChange={(e) => setCats((c) => (e.target.checked ? [...c, m] : c.filter((x) => x !== m)))}
            />
            {MEASURE_LABEL[m]}
          </label>
        ))}
      </div>
      <p className="text-moss">
        Rekenjaar {d.profile.year} ({src("year")}) · saldering {d.profile.netMetering && d.profile.year <= 2026 ? "ja" : "nee"} ·
        contract {d.profile.contractType} ({src("contractType")}) · stroom € {d.profile.electricityPrice} ({src("electricityPrice")}) ·
        teruglevering € {d.profile.exportPrice} ({src("exportPrice")}) · terugleverkosten {d.profile.exportCostModel} €{" "}
        {d.profile.exportCost} · wettelijk minimum {Number.isFinite(d.exportFloor) ? `€ ${d.exportFloor}` : "n.v.t."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-moss/70">
              <th className="py-1">Gegeven</th>
              {sims.map(([l]) => (
                <th key={l} className="text-right">{l}</th>
              ))}
              <th className="pl-3">Herkomst</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f, origin]) => (
              <tr key={label} className="border-t border-moss/10">
                <td className="py-1">{label}</td>
                {sims.map(([l, s]) => (
                  <td key={l} className="text-right tabular-nums">{f(s)}</td>
                ))}
                <td className="pl-3 text-moss/60">{origin ?? "berekend"}</td>
              </tr>
            ))}
            <tr className="border-t border-moss/30 font-semibold">
              <td className="py-1">Netto jaarlijkse besparing (€)</td>
              <td colSpan={2} className="text-right">{n(d.before.cost - d.after.cost, 2)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {d.battery && (
        <div className="overflow-x-auto">
          <p className="font-semibold text-ink">Batterij marginaal (zelfde configuratie zonder batterij)</p>
          <table className="w-full text-xs">
            <tbody>
              {d.battery.years.map((y) => (
                <tr key={y.year} className="border-t border-moss/10">
                  <td className="py-1">{y.year}{y.netMetering ? " saldering" : ""}</td>
                  <td>inkoop +{n(y.avoidedImport, 2)}</td>
                  <td>vergoeding {n(y.missedExport, 2)}</td>
                  <td>terugleverkosten +{n(y.exportCostSaving, 2)}</td>
                  <td>verlies {n(y.lossKwh)} kWh</td>
                  <td className="font-semibold">netto {n(y.net, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="overflow-x-auto">
        <p className="font-semibold text-ink">Scenario's A-D (energiekosten €/jaar)</p>
        <table className="w-full text-xs">
          <tbody>
            {d.comparisons.map((c) => (
              <tr key={c.year} className="border-t border-moss/10">
                <td className="py-1">{c.year}</td>
                {(["A", "B", "C", "D"] as const).map((k) => (
                  <td key={k}>{k}: {n(c.costs[k], 2)}</td>
                ))}
                <td>batterij D−C {n(c.batteryWithNewSolar, 2)}</td>
                <td>pakket D−A {n(c.package, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
