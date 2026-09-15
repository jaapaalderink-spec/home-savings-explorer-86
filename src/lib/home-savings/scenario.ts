import { z } from "zod";
import type { AdviceResult } from "./shared";

const amount = (max: number, fallback: number) =>
  z.number().finite().min(0).max(max).default(fallback);
export const energyProfileSchema = z.object({
  consumption: amount(100000, 3500),
  gas: amount(20000, 1500),
  hotWaterGas: amount(5000, 250),
  cookingGas: amount(1000, 30),
  electricityPrice: amount(2, 0.29),
  gasPrice: amount(10, 1.3),
  exportPrice: z.number().finite().min(-1).max(2).default(0.05),
  netMetering: z.boolean().default(false),
  existingPanels: amount(100, 0),
  existingWp: amount(1000, 350),
  existingYield: z.number().finite().min(0).max(100000).nullable().default(null),
  newPanels: amount(100, 8),
  newWp: amount(1000, 450),
  yieldPerKwp: z.number().min(200).max(1300).default(850),
  daytimeShare: amount(100, 35),
  heating: z.enum(["gas", "hybrid", "heatpump", "resistance", "district"]).default("gas"),
  heatingElectricity: amount(50000, 3000),
  existingScop: z.number().min(1).max(7).default(3),
  target: z.enum(["hybrid", "electric"]).default("hybrid"),
  replaceHeatpump: z.boolean().default(false),
  flowTemperature: z.enum(["35", "45", "55", "65", "unknown"]).default("unknown"),
  scop: z.number().min(1).max(7).nullable().default(null),
  hybridCoverage: amount(100, 60),
  hotWaterCop: z.number().min(1).max(5).default(2.5),
  existingBattery: amount(100, 0),
  newBattery: amount(100, 5),
  batteryEfficiency: z.number().min(0.5).max(1).default(0.9),
  hasEv: z.boolean().default(false),
  hasCharger: z.boolean().default(false),
  evKm: amount(120000, 12000),
  evKwhPer100Km: z.number().min(5).max(50).default(20),
  homeChargeShare: amount(100, 70),
  publicChargePrice: amount(2, 0.5),
  hasAirco: z.boolean().default(false),
  aircoHeatingShare: amount(100, 20),
  aircoScop: z.number().min(1).max(7).default(4),
  coolingKwh: amount(10000, 200),
});
export type EnergyProfile = z.infer<typeof energyProfileSchema>;
export const DEFAULT_PROFILE = energyProfileSchema.parse({});
export const MEASURES = ["solar", "heatpump", "battery", "ev", "airco"] as const;
export type Measure = (typeof MEASURES)[number];

// Monthly fractions: deliberately approximate NL seasonality, not an hourly simulation.
const SUN = [0.025, 0.045, 0.08, 0.115, 0.135, 0.14, 0.135, 0.115, 0.085, 0.065, 0.035, 0.025];
const HEAT = [0.17, 0.15, 0.13, 0.08, 0.04, 0.01, 0, 0, 0.03, 0.08, 0.13, 0.18];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const HEAT_PER_M3 = 8.8 * 0.95;
export function effectiveScop(p: EnergyProfile) {
  return p.scop ?? { "35": 4.2, "45": 3.6, "55": 2.9, "65": 2.3, unknown: 3.2 }[p.flowTemperature];
}

function simulate(p: EnergyProfile, selected: Set<string>, performance = 1) {
  const spaceGas = Math.max(0, p.gas - p.hotWaterGas - p.cookingGas);
  const hotGas = Math.min(p.hotWaterGas, p.gas);
  const currentHeatElectricity = ["hybrid", "heatpump", "resistance"].includes(p.heating)
    ? p.heatingElectricity
    : 0;
  const electricHeat = currentHeatElectricity * (p.heating === "resistance" ? 1 : p.existingScop);
  let spaceElectricity = currentHeatElectricity;
  let waterElectricity = 0;
  let gas = p.gas;
  const wantsHeat =
    selected.has("heatpump") &&
    p.heating !== "district" &&
    (!["hybrid", "heatpump"].includes(p.heating) || p.replaceHeatpump);
  if (wantsHeat) {
    // Measured heating electricity includes hot water: preserve its demand without inventing gas.
    const heat = spaceGas * HEAT_PER_M3 + electricHeat;
    const coverage = p.target === "electric" ? 1 : p.hybridCoverage / 100;
    spaceElectricity = (heat * coverage) / (effectiveScop(p) * performance);
    if (p.target === "hybrid") gas = p.gas - spaceGas + (heat * (1 - coverage)) / HEAT_PER_M3;
    else {
      gas = Math.max(0, p.gas - spaceGas - hotGas);
      waterElectricity = (hotGas * HEAT_PER_M3) / (p.hotWaterCop * performance);
    }
  }
  let cooling = 0;
  if (selected.has("airco") && !p.hasAirco) {
    // Only replace remaining gas space heating; never claim the same heat twice.
    const remainingSpaceGas = Math.max(0, gas - hotGas - p.cookingGas);
    const replaced = (remainingSpaceGas * p.aircoHeatingShare) / 100;
    gas -= replaced;
    spaceElectricity += (replaced * HEAT_PER_M3) / (p.aircoScop * performance);
    cooling = p.coolingKwh;
  }
  const evEnergy = p.hasEv ? (p.evKm * p.evKwhPer100Km) / 100 : 0;
  const currentHomeEv = p.hasCharger ? (evEnergy * p.homeChargeShare) / 100 : 0;
  const homeEv = p.hasCharger || selected.has("ev") ? (evEnergy * p.homeChargeShare) / 100 : 0;
  const base = Math.max(0, p.consumption - currentHeatElectricity - currentHomeEv);
  const production =
    (p.existingPanels > 0
      ? (p.existingYield ?? ((p.existingPanels * p.existingWp) / 1000) * p.yieldPerKwp)
      : 0) +
    (selected.has("solar") ? ((p.newPanels * p.newWp) / 1000) * p.yieldPerKwp * performance : 0);
  const capacity = p.existingBattery + (selected.has("battery") ? p.newBattery : 0);
  let demand = 0,
    direct = 0,
    charged = 0,
    discharged = 0,
    imports = 0,
    exports = 0;
  for (let m = 0; m < 12; m++) {
    const load =
      base / 12 +
      spaceElectricity * HEAT[m]! +
      waterElectricity / 12 +
      homeEv / 12 +
      cooling * SUN[m]!;
    const sun = production * SUN[m]!;
    const simultaneous = Math.min(sun, (load * p.daytimeShare) / 100);
    const charge = Math.min(
      Math.max(0, sun - simultaneous),
      capacity * DAYS[m]!,
      (load - simultaneous) / p.batteryEfficiency,
    );
    const discharge = charge * p.batteryEfficiency;
    demand += load;
    direct += simultaneous;
    charged += charge;
    discharged += discharge;
    imports += load - simultaneous - discharge;
    exports += sun - simultaneous - charge;
  }
  const offset = p.netMetering ? Math.min(imports, exports) : 0;
  const cost =
    (imports - offset) * p.electricityPrice -
    (exports - offset) * p.exportPrice +
    gas * p.gasPrice +
    (evEnergy - homeEv) * p.publicChargePrice;
  return { cost, gas, demand, production, direct, charged, discharged, imports, exports };
}

export function calculateScenario(input: EnergyProfile, categories: readonly string[]) {
  const p = energyProfileSchema.parse(input);
  const selected = MEASURES.filter((id) => categories.includes(id));
  const before = simulate(p, new Set());
  const after = simulate(p, new Set(selected));
  const savings = before.cost - after.cost;
  const uncertain = [0.8, 1.2].map(
    (factor) => before.cost - simulate(p, new Set(selected), factor).cost,
  );
  const notes = [
    "Vergelijking met je huidige installaties; bedragen zijn energiekosten, exclusief aanschaf, onderhoud en vaste aansluitkosten.",
    p.netMetering
      ? "Scenario met jaarlijkse saldering (2026)."
      : "Scenario zonder saldering (vanaf 2027), met je netto terugleververgoeding.",
    "Maandmodel met geschatte verdeling over dag en seizoen; geen gemeten uurprofiel. Dynamische handel is niet als gegarandeerde winst opgenomen.",
  ];
  if (selected.includes("heatpump"))
    notes.push(
      p.heating === "district"
        ? "Bij stadswarmte ontbreekt een passend warmtetarief en verbruik; de warmtepomp is niet financieel doorgerekend."
        : `Warmtepomp: seizoensrendement ${effectiveScop(p).toFixed(1)}${p.scop === null ? " (aanname op basis van aanvoertemperatuur)" : " (ingevuld)"}; tapwater apart waar het huidige gasverbruik dit bevat. Laat warmteverlies en afgiftesysteem controleren.`,
    );
  if (p.existingPanels > 0)
    notes.push(
      `Bestaand: ${p.existingPanels} panelen van ${p.existingWp} Wp; ${Math.round(before.production)} kWh/jaar ${p.existingYield === null ? "geschat" : "gemeten"}. Deze opbrengst zit al in de uitgangssituatie.`,
    );
  if (selected.includes("battery"))
    notes.push(
      "De batterij gebruikt alleen het resterende zonneoverschot, na direct verbruik, met laadverliezen en maximaal een cyclus per dag.",
    );
  if (selected.includes("ev"))
    notes.push(
      p.hasEv
        ? "Laadpaal: thuisladen vervangt openbaar laden voor dezelfde elektrische auto; geen benzinebesparing toegerekend."
        : "Zonder elektrische auto is voor de laadpaal geen besparing berekend.",
    );
  if (p.hotWaterGas + p.cookingGas > p.gas)
    notes.push(
      "De ingevulde verdeling van gas is groter dan het totale gasverbruik; controleer deze invoer.",
    );
  if (
    p.consumption <
    (["hybrid", "heatpump", "resistance"].includes(p.heating) ? p.heatingElectricity : 0) +
      (p.hasEv && p.hasCharger ? (((p.evKm * p.evKwhPer100Km) / 100) * p.homeChargeShare) / 100 : 0)
  )
    notes.push(
      "Het opgegeven stroomverbruik is kleiner dan het verbruik van de bestaande apparaten; controleer het totale verbruik inclusief eigen zonnestroom.",
    );
  // Shapley allocation: average marginal contribution across every subset, independent of click order.
  const results: Record<string, AdviceResult> = {};
  const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
  for (const id of selected) {
    const others = selected.filter((x) => x !== id);
    let contribution = 0;
    for (let mask = 0; mask < 2 ** others.length; mask++) {
      const subset = others.filter((_, i) => mask & (1 << i));
      const weight =
        (factorial(subset.length) * factorial(selected.length - subset.length - 1)) /
        factorial(selected.length);
      contribution +=
        weight * (simulate(p, new Set(subset)).cost - simulate(p, new Set([...subset, id])).cost);
    }
    results[id] = {
      practicalSavings: contribution,
      range: {
        min: Math.min(contribution * 0.75, contribution * 1.25),
        max: Math.max(contribution * 0.75, contribution * 1.25),
      },
      confidence: "low",
      explanationReasons: [
        "Bijdrage aan het gekozen pakket ten opzichte van je huidige woning. Onderlinge effecten zijn over de maatregelen verdeeld.",
        ...notes,
      ],
      badges: ["inclusief bestaande installaties", "indicatief maandmodel"],
    };
  }
  return {
    before,
    after,
    savings,
    results,
    notes,
    range: { min: Math.min(savings, ...uncertain), max: Math.max(savings, ...uncertain) },
  };
}

export function parseProfile(value: string | null): EnergyProfile {
  try {
    return energyProfileSchema.parse(JSON.parse(value ?? "{}"));
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function profileFromSearch(search: URLSearchParams): EnergyProfile {
  if (search.has("energyProfile")) return parseProfile(search.get("energyProfile"));
  const p = { ...DEFAULT_PROFILE };
  const owned = (search.get("owned") ?? "").split(",");
  const read = (key: string, fallback: number, max: number) => {
    const raw = search.get(key);
    const n = raw === null || raw === "" ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
  };
  p.consumption = read("consumption", p.consumption, 100000);
  if (owned.includes("solar")) {
    p.existingPanels = read("panels", 8, 100);
    p.newPanels = 0;
  } else p.newPanels = read("panels", p.newPanels, 100);
  if (owned.includes("battery")) {
    p.existingBattery = 5;
    p.newBattery = 0;
  }
  const heating = search.get("heating");
  if (heating === "warmtepomp") p.heating = "heatpump";
  else if (heating === "hybride" || owned.includes("heatpump")) p.heating = "hybrid";
  else if (heating === "stadswarmte") p.heating = "district";
  p.hasCharger = owned.includes("ev");
  p.hasEv = search.get("evStatus") === "nu";
  p.evKm = read("evKm", p.evKm, 120000);
  p.hasAirco = owned.includes("airco");
  return p;
}
