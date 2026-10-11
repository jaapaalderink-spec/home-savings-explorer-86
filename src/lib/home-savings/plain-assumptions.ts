import { ENERGY_CONFIG as C } from "./config";

const eur = (n: number) => `€ ${n.toFixed(2).replace(".", ",")}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Consumer-friendly summary of the active assumptions for the chosen measures. */
export function plainAssumptions(selected: readonly string[]): string[] {
  const out = [
    `We rekenen met een stroomprijs van ${eur(C.tariffs.electricityPrice)} per kWh en een gasprijs van ${eur(C.tariffs.gasPrice)} per m³, tenzij je zelf je tarieven invult.`,
    `Voor het jaar ${C.mainYear}: de salderingsregeling is dan afgeschaft. Teruggeleverde stroom levert ongeveer ${eur(C.tariffs.exportPrice)} per kWh op.`,
  ];
  if (selected.includes("solar"))
    out.push(
      `Voor nieuwe zonnepanelen rekenen we met gemiddeld ${C.solar.newWp} Wp per paneel en ${C.solar.yieldPerKwp} kWh per kWp per jaar.`,
    );
  if (selected.includes("battery"))
    out.push(
      `Voor een thuisbatterij gebruiken we een geschat opslagrendement van ${pct(C.battery.efficiency)} en rekenen we ${C.battery.lifetimeYears} jaar vooruit, met wat capaciteitsverlies per jaar.`,
    );
  if (selected.includes("heatpump"))
    out.push(
      `Een warmtepomp haalt gemiddeld ${String(C.heat.scopByFlow.unknown).replace(".", ",")} keer zoveel warmte uit een kWh stroom; dit passen we aan op je isolatie.`,
    );
  if (selected.includes("airco"))
    out.push(
      `Een airco gebruikt per ruimte ongeveer ${Math.round(C.airco.coolingDemandPerRoom / C.airco.seer)} kWh per jaar om te koelen. Verwarmt de airco ook, dan vervangt hij een deel van het gas dat na andere maatregelen nog over is.`,
    );
  if (selected.includes("ev"))
    out.push(
      `Een elektrische auto verbruikt gemiddeld ${C.ev.kwhPer100Km} kWh per 100 km, plus ${pct(C.ev.chargeLoss)} laadverlies. Openbaar laden kost ongeveer ${eur(C.tariffs.publicChargePrice)} per kWh.`,
    );
  out.push("Aanschaf- en installatiekosten zijn niet meegerekend.");
  return out;
}
