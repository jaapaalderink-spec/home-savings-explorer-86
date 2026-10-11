import { z } from "zod";
import type { AdviceResult } from "./shared";
import { ENERGY_CONFIG as C } from "./config";

const amount = (max: number, fallback: number) =>
  z.number().finite().min(0).max(max).default(fallback);
export const energyProfileSchema = z.object({
  consumption: amount(100000, 3500),
  gas: amount(20000, 1500),
  hotWaterGas: amount(5000, 250),
  cookingGas: amount(1000, 30),
  contractType: z.enum(["vast", "variabel", "dynamisch", "onbekend"]).default("onbekend"),
  electricityPrice: amount(2, C.tariffs.electricityPrice),
  gasPrice: amount(10, C.tariffs.gasPrice),
  exportPrice: z.number().finite().min(-1).max(2).default(C.tariffs.exportPrice),
  exportCost: amount(1, C.tariffs.exportCost),
  netMetering: z.boolean().default(false),
  year: z.number().int().min(2026).max(2040).default(2026),
  existingPanels: amount(100, 0),
  existingWp: amount(1000, C.solar.existingWp),
  existingYield: z.number().finite().min(0).max(100000).nullable().default(null),
  newPanels: amount(100, 8),
  adviseSolar: z.boolean().default(false),
  newWp: amount(1000, C.solar.newWp),
  yieldPerKwp: z.number().min(200).max(1300).default(C.solar.yieldPerKwp),
  daytimeShare: amount(100, 35), // legacy field, superseded by hourly profiles
  heating: z.enum(["gas", "hybrid", "heatpump", "resistance", "district"]).default("gas"),
  heatingElectricity: amount(50000, 3000),
  existingScop: z.number().min(1).max(7).default(3),
  target: z.enum(["hybrid", "electric"]).default("hybrid"),
  adviseHeatpump: z.boolean().default(false),
  replaceHeatpump: z.boolean().default(false),
  flowTemperature: z.enum(["35", "45", "55", "65", "unknown"]).default("unknown"),
  insulation: z.enum(["good", "average", "poor", "unknown"]).default("unknown"),
  scop: z.number().min(1).max(7).nullable().default(null),
  hybridCoverage: amount(100, C.heat.hybridCoverage),
  hotWaterCop: z.number().min(1).max(5).default(C.heat.hotWaterCop),
  gasConnectionFixed: amount(1000, C.tariffs.gasConnectionFixed),
  canDisconnectGas: z.boolean().default(false),
  existingBattery: amount(100, 0),
  newBattery: amount(100, 5),
  adviseBattery: z.boolean().default(false),
  batteryEfficiency: z.number().min(0.5).max(1).default(C.battery.efficiency),
  hasEv: z.boolean().default(false),
  hasCharger: z.boolean().default(false),
  evKm: amount(120000, C.ev.km),
  evKwhPer100Km: z.number().min(5).max(50).default(C.ev.kwhPer100Km),
  homeChargeShare: amount(100, C.ev.homeShare),
  smartCharging: z.boolean().default(false),
  publicChargePrice: amount(2, C.tariffs.publicChargePrice),
  hasAirco: z.boolean().default(false),
  aircoMode: z.enum(["cool", "both"]).default("both"),
  aircoHeatingShare: amount(100, C.airco.heatShareGas),
  aircoScop: z.number().min(1).max(7).default(C.airco.scop),
  coolingKwh: amount(10000, 200),
  provided: z.array(z.string()).default([]),
  // Contract terms (all optional; empty means: use labelled assumptions).
  supplier: z.string().max(80).default(""),
  contractName: z.string().max(120).default(""),
  contractEndDate: z.string().max(10).default(""),
  electricityPriceLow: z.number().finite().min(0).max(2).nullable().default(null),
  exportCostModel: z.enum(["none", "perKwh", "tiers", "fixed", "timeOfUse"]).default("perKwh"),
  exportCostNight: z.number().finite().min(0).max(1).nullable().default(null),
  exportCostTiers: z
    .array(z.object({ upToKwh: z.number().min(0).max(100000).nullable(), annualCost: z.number().min(0).max(5000) }))
    .max(20)
    .default([]),
  exportCostFixed: amount(5000, 0),
  tariffPeriods: z
    .array(
      z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        electricityPrice: z.number().finite().min(0).max(2),
        exportPrice: z.number().finite().min(-1).max(2).optional(),
        exportCost: z.number().finite().min(0).max(1).optional(),
      }),
    )
    .max(24)
    .default([]),
  consumptionBasis: z.enum(["gross", "net"]).default("gross"),
  batteryStrategy: z.enum(["self", "smart"]).default("self"),
  gridCharging: z.boolean().default(false),
  batteryStandbyW: amount(200, C.battery.standbyW),
});
export type EnergyProfile = z.infer<typeof energyProfileSchema>;
export const DEFAULT_PROFILE = energyProfileSchema.parse({});
export const MEASURES = ["solar", "heatpump", "battery", "ev", "airco"] as const;
export type Measure = (typeof MEASURES)[number];
export const MEASURE_LABEL: Record<Measure, string> = {
  solar: "Zonnepanelen",
  heatpump: "Warmtepomp",
  battery: "Thuisbatterij",
  ev: "Laadpaal",
  airco: "Airco",
};

// Monthly fractions: approximate NL seasonality.
const SUN = [0.025, 0.045, 0.08, 0.115, 0.135, 0.14, 0.135, 0.115, 0.085, 0.065, 0.035, 0.025];
const HEAT = [0.17, 0.15, 0.13, 0.08, 0.04, 0.01, 0, 0, 0.03, 0.08, 0.13, 0.18];
const DAYLIGHT = [8, 9.8, 11.8, 13.8, 15.6, 16.6, 16.2, 14.7, 12.6, 10.6, 8.7, 7.6];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const HEAT_PER_M3 = C.heat.kwhPerM3 * C.heat.boilerEfficiency;
const norm = (a: number[]) => {
  const s = a.reduce((x, y) => x + y, 0);
  return a.map((v) => (s > 0 ? v / s : 0));
};
const H = Array.from({ length: 24 }, (_, h) => h);
const SUN_SHAPE = DAYLIGHT.map((dl) =>
  norm(H.map((h) => Math.max(0, Math.sin((Math.PI * (h + 0.5 - (12.5 - dl / 2))) / dl)))),
);
const BASE_SHAPE = norm(
  H.map((h) => (h < 6 ? 0.025 : h < 9 ? 0.045 : h < 17 ? 0.035 : h < 22 ? 0.065 : 0.04)),
);
const HEAT_SHAPE = norm(H.map((h) => (h < 6 ? 0.03 : h < 10 ? 0.06 : h < 17 ? 0.035 : h < 23 ? 0.05 : 0.03)));
const EV_EVENING = norm(H.map((h) => (h >= 18 && h <= 23 ? 1 : 0)));
const EV_SOLAR = norm(H.map((h) => (h >= 10 && h <= 15 ? 1 : 0)));
const COOL_SHAPE = norm(H.map((h) => (h >= 12 && h <= 18 ? 1 : 0)));

export function effectiveScop(p: EnergyProfile) {
  return p.scop ?? C.heat.scopByFlow[p.flowTemperature] * C.heat.insulationScopFactor[p.insulation];
}
export const usesNetMetering = (p: EnergyProfile) =>
  p.netMetering && p.year <= C.netMeteringLastYear;
const newSolarKwh = (p: EnergyProfile) =>
  p.adviseSolar
    ? Math.max(0, p.consumption * C.solar.adviseKwhShare - existingSolarKwh(p))
    : ((p.newPanels * p.newWp) / 1000) * p.yieldPerKwp;
const existingSolarKwh = (p: EnergyProfile) =>
  p.existingPanels > 0
    ? (p.existingYield ?? ((p.existingPanels * p.existingWp) / 1000) * p.yieldPerKwp)
    : 0;
const newBatteryKwh = (p: EnergyProfile) =>
  p.adviseBattery ? (p.consumption > 5000 ? 10 : 5) : p.newBattery;

// Representative dynamic price shape per month (mean 1 over the day). Not historical data.
const DYN_SHAPE = SUN.map((sunM, m) => {
  const D = C.dynamic;
  const peak = Math.max(...SUN_SHAPE[m]!);
  const raw = H.map(
    (h) =>
      (h >= 17 && h <= 21 ? 1 + D.eveningPeak : h < 6 ? 1 - D.nightDip : 1) -
      D.solarDip * (peak > 0 ? SUN_SHAPE[m]![h]! / peak : 0) * (sunM / Math.max(...SUN)),
  );
  const mean = raw.reduce((x, y) => x + y, 0) / 24;
  return raw.map((v) => v - mean + 1);
});
const pad = (n: number) => String(n).padStart(2, "0");

/** Contract terms that apply in a month (tariff periods override from their start date). */
export function termsFor(p: EnergyProfile, month: number) {
  const date = `${p.year}-${pad(month + 1)}-01`;
  const period = [...p.tariffPeriods]
    .sort((a, b) => a.from.localeCompare(b.from))
    .filter((t) => t.from <= date)
    .pop();
  return {
    electricityPrice: period?.electricityPrice ?? p.electricityPrice,
    exportPrice: period?.exportPrice ?? p.exportPrice,
    exportCost: period?.exportCost ?? p.exportCost,
  };
}
/** Legal minimum feed-in compensation (2027-2030) for fixed/variable contracts. */
export function exportFloor(p: EnergyProfile) {
  const L = C.legalMinExport;
  return p.contractType !== "dynamisch" && p.year >= L.fromYear && p.year <= L.toYear
    ? L.share * L.bareSupplyPrice
    : -Infinity;
}
/** Hourly import/export price and per-kWh export charge for a month and hour. */
export function hourlyTariff(p: EnergyProfile, month: number, hour: number) {
  const t = termsFor(p, month);
  const dynamic = p.contractType === "dynamisch";
  const low = !dynamic && p.electricityPriceLow !== null && C.tariffs.lowTariffHours.includes(hour as never);
  const spotDev = C.dynamic.spotAvg * (DYN_SHAPE[month]![hour]! - 1);
  const night = C.tariffs.lowTariffHours.includes(hour as never);
  const exportCostRate =
    p.exportCostModel === "perKwh"
      ? t.exportCost
      : p.exportCostModel === "timeOfUse"
        ? night
          ? (p.exportCostNight ?? t.exportCost)
          : t.exportCost
        : 0;
  return {
    bucket: dynamic ? "d" : low ? "l" : "n",
    importPrice: dynamic ? t.electricityPrice + C.dynamic.vat * spotDev : low ? p.electricityPriceLow! : t.electricityPrice,
    exportPrice: dynamic ? t.exportPrice + spotDev : Math.max(t.exportPrice, exportFloor(p)),
    exportCostRate,
  };
}
/** Annual export charge that depends on the full-year export volume (tiers/fixed). */
export function annualExportCharge(p: EnergyProfile, grossExportKwh: number) {
  if (p.exportCostModel === "fixed") return p.exportCostFixed;
  if (p.exportCostModel !== "tiers" || !p.exportCostTiers.length) return 0;
  const tiers = [...p.exportCostTiers].sort((a, b) => (a.upToKwh ?? Infinity) - (b.upToKwh ?? Infinity));
  return (tiers.find((t) => grossExportKwh <= (t.upToKwh ?? Infinity)) ?? tiers[tiers.length - 1]!).annualCost;
}

type Options = { performance?: number; cooling?: boolean };
function simulate(p: EnergyProfile, selected: Set<string>, opt: Options = {}) {
  const performance = opt.performance ?? 1;
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
  let aircoHeat = 0;
  if (selected.has("airco") && !p.hasAirco) {
    if (p.aircoMode === "both") {
      // Only replace remaining gas space heating; never claim the same heat twice.
      const remainingSpaceGas = Math.max(0, gas - Math.min(hotGas, gas) - p.cookingGas);
      const replaced = Math.min(remainingSpaceGas, (remainingSpaceGas * p.aircoHeatingShare) / 100);
      gas -= replaced;
      aircoHeat = (replaced * HEAT_PER_M3) / (p.aircoScop * performance);
    }
    cooling = opt.cooling === false ? 0 : p.coolingKwh;
  }
  const evEnergy = p.hasEv ? (p.evKm * p.evKwhPer100Km) / 100 : 0;
  // Existing home charging is already inside measured consumption: subtract, then re-add once.
  const currentHomeEv = p.hasCharger ? (evEnergy * p.homeChargeShare) / 100 : 0;
  const homeEv = p.hasCharger || selected.has("ev") ? (evEnergy * p.homeChargeShare) / 100 : 0;
  const existingProd = existingSolarKwh(p);
  // A "net" meter reading (import minus export) hides self-consumed existing solar.
  const grossConsumption = p.consumption + (p.consumptionBasis === "net" ? existingProd : 0);
  const base = Math.max(0, grossConsumption - currentHeatElectricity - currentHomeEv);
  const newProd = selected.has("solar") ? newSolarKwh(p) * performance : 0;
  const production = existingProd + newProd;
  const newCapacity = selected.has("battery") ? newBatteryKwh(p) : 0;
  const capacity = p.existingBattery + newCapacity;
  const power = capacity * C.battery.powerPerKwh;
  const eff = p.batteryEfficiency;
  const minE = capacity * C.battery.minSoc;
  const maxE = capacity * C.battery.maxSoc;
  const dynamic = p.contractType === "dynamisch";
  const gridChargeAllowed = p.batteryStrategy === "smart" && p.gridCharging && dynamic && capacity > 0;
  const evShape = p.smartCharging && production > 0 ? EV_SOLAR : EV_EVENING;
  const t = {
    demand: 0,
    direct: 0,
    charged: 0, // from solar
    gridCharged: 0,
    discharged: 0,
    dischargedSolar: 0,
    imports: 0,
    exports: 0,
  };
  const buckets: Record<string, { i: number; e: number; ic: number; er: number }> = {};
  let exportCostVariable = 0;
  let evSolar = 0;
  let balanceError = 0;
  for (let m = 0; m < 12; m++) {
    const d = DAYS[m]!;
    const sunDay = (production * SUN[m]!) / d;
    const parts = {
      base: base / 365,
      heat: ((spaceElectricity + aircoHeat) * HEAT[m]!) / d,
      water: waterElectricity / 365,
      ev: homeEv / 365,
      cool: (cooling * SUN[m]!) / d,
    };
    // Day runs 06:00 -> 05:59 so evening/night use of daytime storage stays within one cycle.
    const hours = H.map((i) => {
      const h = (i + 6) % 24;
      const evLoad = parts.ev * evShape[h]!;
      const load =
        parts.base * BASE_SHAPE[h]! +
        parts.heat * HEAT_SHAPE[h]! +
        parts.water * BASE_SHAPE[h]! +
        evLoad +
        parts.cool * COOL_SHAPE[h]!;
      return { h, load, evLoad, sun: sunDay * SUN_SHAPE[m]![h]!, tariff: hourlyTariff(p, m, h) };
    });
    let gridBudget = 0;
    let gridThreshold = -Infinity;
    if (gridChargeAllowed) {
      // Only charge from the grid what the evening needs beyond expected solar surplus.
      const deficit = hours.reduce((s, x) => s + Math.max(0, x.load - x.sun), 0);
      const surplus = hours.reduce((s, x) => s + Math.max(0, x.sun - x.load), 0);
      const room = maxE - minE;
      gridBudget = Math.max(0, Math.min(room, deficit) - Math.min(surplus * eff, room)) / eff;
      const top = hours.map((x) => x.tariff.importPrice).sort((a, b) => b - a).slice(0, 4);
      gridThreshold = (top.reduce((a, b) => a + b, 0) / top.length) * eff - C.battery.cycleCostPerKwh;
    }
    let socSolar = 0;
    let socGrid = 0;
    const day = { ...t, demand: 0, direct: 0, charged: 0, gridCharged: 0, discharged: 0, dischargedSolar: 0, imports: 0, exports: 0 };
    const hourly: { imp: number; exp: number; tariff: (typeof hours)[number]["tariff"] }[] = [];
    for (const { load, evLoad, sun, tariff } of hours) {
      const direct = Math.min(sun, load);
      if (evLoad > 0 && load > 0) evSolar += ((direct * evLoad) / load) * d;
      const surplus = sun - direct;
      const deficit = load - direct;
      const soc = minE + socSolar + socGrid;
      // Physical storage: only real solar surplus, unless grid charging is enabled.
      const charge = surplus > 0 ? Math.min(surplus, power, Math.max(0, maxE - soc) / eff) : 0;
      let gridCharge = 0;
      if (gridChargeAllowed && gridBudget > 0 && deficit > 0 && tariff.importPrice < gridThreshold)
        gridCharge = Math.min(power - charge, Math.max(0, maxE - soc - charge * eff) / eff, gridBudget);
      gridBudget -= gridCharge;
      // Never charge and discharge in the same hour.
      const avail = socSolar + socGrid;
      const discharge = deficit > 0 && charge + gridCharge === 0 ? Math.min(deficit, power, avail) : 0;
      const fromSolar = avail > 0 ? (discharge * socSolar) / avail : 0;
      socSolar += charge * eff - fromSolar;
      socGrid += gridCharge * eff - (discharge - fromSolar);
      const imp = deficit - discharge + gridCharge;
      const exp = surplus - charge;
      balanceError = Math.max(
        balanceError,
        Math.abs(sun - direct - charge - exp),
        Math.abs(load + gridCharge - direct - discharge - imp),
      );
      hourly.push({ imp, exp, tariff });
      day.demand += load;
      day.direct += direct;
      day.charged += charge;
      day.gridCharged += gridCharge;
      day.discharged += discharge;
      day.dischargedSolar += fromSolar;
      day.imports += imp;
      day.exports += exp;
    }
    // Energy left at the end of the cycle was never useful: unwind it.
    // Solar leftover is booked as export (hour 14), grid leftover as not imported.
    const unusedSolar = socSolar / eff;
    const unusedGrid = socGrid / eff;
    day.charged -= unusedSolar;
    day.exports += unusedSolar;
    day.gridCharged -= unusedGrid;
    day.imports -= unusedGrid;
    if (unusedSolar > 0) hourly[8]!.exp += unusedSolar;
    if (unusedGrid > 0) {
      const last = hourly.filter((x) => x.imp > 0);
      let rest = unusedGrid;
      for (const x of last) {
        const take = Math.min(rest, x.imp);
        x.imp -= take;
        rest -= take;
      }
    }
    for (const { imp, exp, tariff } of hourly) {
      const b = (buckets[tariff.bucket] ??= { i: 0, e: 0, ic: 0, er: 0 });
      b.i += imp * d;
      b.e += exp * d;
      b.ic += imp * tariff.importPrice * d;
      b.er += exp * tariff.exportPrice * d;
      exportCostVariable += exp * tariff.exportCostRate * d;
    }
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += day[k] * d;
  }
  // Saldering is an invoice-level offset of kWh, first within a tariff period, then across.
  const netMetering = usesNetMetering(p);
  let netted = 0;
  let importCost = 0;
  let exportRevenue = 0;
  const left: { i: number; e: number; ip: number; ep: number }[] = [];
  for (const b of Object.values(buckets)) {
    const ip = b.i > 0 ? b.ic / b.i : 0;
    const ep = b.e > 0 ? b.er / b.e : 0;
    const off = netMetering ? Math.min(b.i, b.e) : 0;
    netted += off;
    importCost += b.ic - off * ip;
    exportRevenue += b.er - off * ep;
    left.push({ i: b.i - off, e: b.e - off, ip, ep });
  }
  if (netMetering)
    for (const a of left)
      for (const b of left) {
        const off = Math.min(a.i, b.e);
        if (off <= 0) continue;
        netted += off;
        importCost -= off * a.ip;
        exportRevenue -= off * b.ep;
        a.i -= off;
        b.e -= off;
      }
  const exportCosts = exportCostVariable + annualExportCharge(p, t.exports);
  const avgImportPrice = t.imports > 0 ? Object.values(buckets).reduce((s, b) => s + b.ic, 0) / t.imports : p.electricityPrice;
  const standbyKwh = newCapacity > 0 ? (p.batteryStandbyW * 8760) / 1000 : 0;
  const standbyCost = standbyKwh * (avgImportPrice || p.electricityPrice);
  const gasDisconnected =
    wantsHeat && p.target === "electric" && p.canDisconnectGas && gas <= 1e-9;
  const gasCost = gas * p.gasPrice;
  const fixedCost = gasDisconnected ? 0 : p.gas > 0 ? p.gasConnectionFixed : 0;
  const publicChargeCost = (evEnergy - homeEv) * p.publicChargePrice;
  const cost = importCost - exportRevenue + exportCosts + standbyCost + gasCost + fixedCost + publicChargeCost;
  return {
    cost,
    gas,
    ...t,
    production,
    existingProduction: existingProd,
    newProduction: newProd,
    grossConsumption,
    losses: t.charged + t.gridCharged - t.discharged,
    netted,
    importCost,
    exportRevenue,
    exportCosts,
    standbyKwh,
    standbyCost,
    gasCost,
    fixedCost,
    publicChargeCost,
    selfConsumption: production > 0 ? (t.direct + t.dischargedSolar) / production : 0,
    heatpumpKwh: wantsHeat ? spaceElectricity + waterElectricity : 0,
    aircoKwh: aircoHeat + cooling,
    evHomeKwh: homeEv,
    evSolarKwh: evSolar,
    balanceError,
  };
}
export { simulate };
export type Simulation = ReturnType<typeof simulate>;

export function calculateScenario(input: EnergyProfile, categories: readonly string[]) {
  const p = energyProfileSchema.parse(input);
  const selected = MEASURES.filter((id) => categories.includes(id));
  const cache = new Map<string, Simulation>();
  const sim = (ids: readonly string[]) => {
    const key = MEASURES.filter((m) => ids.includes(m)).join(",");
    let s = cache.get(key);
    if (!s) cache.set(key, (s = simulate(p, new Set(ids))));
    return s;
  };
  const before = sim([]);
  const after = sim(selected);
  const savings = before.cost - after.cost;
  const uncertain = [1 - C.sensitivity, 1 + C.sensitivity].map(
    (performance) => before.cost - simulate(p, new Set(selected), { performance }).cost,
  );
  const standalone = Object.fromEntries(
    selected.map((id) => [id, before.cost - sim([id]).cost]),
  ) as Partial<Record<Measure, number>>;
  const synergy = savings - Object.values(standalone).reduce((a, b) => a + b, 0);
  const comfortCost = selected.includes("airco")
    ? after.cost - simulate(p, new Set(selected), { cooling: false }).cost
    : 0;
  const notes = [
    "Vergelijking met je huidige installaties; bedragen zijn energiekosten, exclusief aanschaf, onderhoud en subsidies.",
    usesNetMetering(p)
      ? `Rekenjaar ${p.year} met saldering.`
      : `Rekenjaar ${p.year} zonder saldering${p.year > C.netMeteringLastYear ? " (salderingsregeling eindigt 1 januari 2027)" : ""}, met netto terugleververgoeding na terugleverkosten.`,
    `Uurmodel met een representatieve dag per maand en standaardprofielen; geen gemeten uurdata. Aannames geldig vanaf ${C.validFrom}.`,
  ];
  if (selected.includes("heatpump"))
    notes.push(
      p.heating === "district"
        ? "Bij stadswarmte ontbreekt een passend warmtetarief en verbruik; de warmtepomp is niet financieel doorgerekend."
        : `Warmtepomp: seizoensrendement ${effectiveScop(p).toFixed(1)}${p.scop === null ? " (aanname op basis van aanvoertemperatuur en isolatie)" : " (ingevuld)"}. Laat warmteverlies en afgiftesysteem door een installateur controleren.`,
    );
  if (p.existingPanels > 0)
    notes.push(
      `Bestaand: ${p.existingPanels} panelen; ${Math.round(existingSolarKwh(p))} kWh/jaar ${p.existingYield === null ? "geschat" : "gemeten"}. Deze opbrengst zit al in de uitgangssituatie.`,
    );
  if (selected.includes("battery"))
    notes.push(
      "De batterij laadt alleen met zonneoverschot binnen haar vermogen en capaciteit, met laadverlies, en ontlaadt dezelfde avond en nacht. Er wordt niets van zomer naar winter verschoven.",
    );
  if (selected.includes("ev") && !p.hasEv)
    notes.push("Zonder elektrische auto is voor de laadpaal geen besparing berekend.");
  if (p.hotWaterGas + p.cookingGas > p.gas)
    notes.push("De ingevulde verdeling van gas is groter dan het totale gasverbruik; controleer deze invoer.");
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
  const contributions: Partial<Record<Measure, number>> = {};
  const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1));
  for (const id of selected) {
    const others = selected.filter((x) => x !== id);
    let contribution = 0;
    for (let mask = 0; mask < 2 ** others.length; mask++) {
      const subset = others.filter((_, i) => mask & (1 << i));
      const weight =
        (factorial(subset.length) * factorial(selected.length - subset.length - 1)) /
        factorial(selected.length);
      contribution += weight * (sim(subset).cost - sim([...subset, id]).cost);
    }
    contributions[id] = contribution;
    results[id] = {
      practicalSavings: contribution,
      range: {
        min: Math.min(contribution * 0.75, contribution * 1.25),
        max: Math.max(contribution * 0.75, contribution * 1.25),
      },
      confidence: "low",
      explanationReasons: [
        `Los aangeschaft: ${Math.round(standalone[id] ?? 0)} euro per jaar. Bijdrage in je pakket: ${Math.round(contribution)} euro per jaar.`,
        ...notes,
      ],
      badges: ["inclusief bestaande installaties", "indicatief uurmodel"],
    };
  }
  const result = {
    profile: p,
    selected,
    before,
    after,
    savings,
    standalone,
    contributions,
    synergy,
    comfortCost,
    results,
    notes,
    payback: paybackYears(selected, savings),
    range: { min: Math.min(savings, ...uncertain), max: Math.max(savings, ...uncertain) },
    advice: [] as string[],
  };
  result.advice = buildAdvice(result);
  return result;
}
export type ScenarioResult = ReturnType<typeof calculateScenario>;

/** Indicative simple payback only when reliable investment data is configured. */
export function paybackYears(selected: readonly Measure[], savings: number): number | null {
  const inv = C.investment as Partial<Record<Measure, number>>;
  if (!selected.length || selected.some((id) => inv[id] == null) || savings <= 0) return null;
  return selected.reduce((s, id) => s + (inv[id] ?? 0), 0) / savings;
}

function buildAdvice(r: Omit<ScenarioResult, "advice"> & { advice: string[] }): string[] {
  const out: string[] = [];
  const has = (id: Measure) => r.selected.includes(id);
  const p = r.profile;
  const hasSolar = has("solar") || p.existingPanels > 0;
  if (has("ev") && p.hasEv && hasSolar) {
    const share = r.after.evHomeKwh > 0 ? r.after.evSolarKwh / r.after.evHomeKwh : 0;
    out.push(
      p.smartCharging
        ? `Je zonnepanelen en laadpaal werken samen: met overdag laden komt in deze berekening ongeveer ${Math.round(share * 100)}% van het thuisladen direct van je eigen zonnestroom. Dit vraagt een laadpaal met slimme sturing en een auto die overdag thuis staat.`
        : "Je zonnepanelen en laadpaal kunnen goed samenwerken. Door overdag te laden, kun je meer van je zelf opgewekte stroom direct gebruiken. Zet 'Slim laden overdag' aan om dit door te rekenen.",
    );
  }
  if (has("battery")) {
    const s = r.standalone.battery ?? 0;
    out.push(
      s <= 0
        ? "In jouw situatie levert een thuisbatterij financieel weinig of niets op, bijvoorbeeld door saldering of weinig zonneoverschot. Laat dit vooral meewegen als je om andere redenen een batterij overweegt."
        : "Een thuisbatterij kan jouw eigenverbruik verhogen. Of dit financieel aantrekkelijk is, hangt af van jouw energietarief, het batterijformaat en jouw dagelijkse stroomverbruik.",
    );
    if (p.contractType === "dynamisch")
      out.push("Extra opbrengst door handelen op dynamische prijzen is niet meegerekend; die is niet vooraf te garanderen.");
  }
  if (has("heatpump") && hasSolar)
    out.push("Een warmtepomp verbruikt vooral in de winter stroom, als je zonnepanelen weinig opleveren. Zonnestroom dekt daarom maar een beperkt deel van dat verbruik.");
  if (has("airco") && r.comfortCost > 0.5)
    out.push(`Koelen met een airco is een comfortverbetering en kost naar schatting ${Math.round(r.comfortCost)} euro per jaar aan stroom. Dat is niet als besparing geteld.`);
  if (has("airco") && has("heatpump"))
    out.push("Airco en warmtepomp vervangen samen nooit meer gas dan er is: de airco rekent alleen met de warmtevraag die de warmtepomp overlaat.");
  if (r.selected.length > 1) {
    if (r.synergy < -1)
      out.push(`Samen leveren je maatregelen ${Math.round(-r.synergy)} euro per jaar minder op dan de optelsom van losse aanschaf. Ze gebruiken deels dezelfde zonnestroom of dezelfde warmtevraag, die maar één keer bespaard kan worden.`);
    else if (r.synergy > 1)
      out.push(`Samen leveren je maatregelen ${Math.round(r.synergy)} euro per jaar meer op dan de optelsom van losse aanschaf, doordat ze elkaars energie benutten.`);
  }
  if (has("battery") && has("ev"))
    out.push("Een thuisbatterij is te klein om een elektrische auto op te laden; in de berekening gaat opgeslagen stroom naar het gewone verbruik binnen haar capaciteit.");
  return out;
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
