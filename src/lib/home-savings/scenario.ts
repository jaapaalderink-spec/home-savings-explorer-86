import { z } from "zod";
import type { AdviceResult } from "./shared";
import { ENERGY_CONFIG as C, DEFAULT_ENERGY_CONFIG as D0, configState } from "./config";

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
  year: z.number().int().min(2026).max(2040).default(C.mainYear),
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
  evKwhPer100Km: z.number().min(5).max(50).default(20),
  homeChargeShare: amount(100, C.ev.homeShare),
  smartCharging: z.boolean().default(false),
  publicChargePrice: amount(2, C.tariffs.publicChargePrice),
  hasAirco: z.boolean().default(false),
  aircoMode: z.enum(["cool", "both"]).default("both"),
  aircoHeatingShare: amount(100, C.airco.heatShareGas),
  aircoScop: z.number().min(1).max(7).default(C.airco.scop),
  coolingKwh: amount(10000, 200),
  aircoRooms: amount(20, D0.airco.defaultRooms),
  provided: z.array(z.string()).default([]),
  // Contract terms (all optional; empty means: use labelled assumptions).
  supplier: z.string().max(80).default(""),
  contractName: z.string().max(120).default(""),
  contractEndDate: z.string().max(10).default(""),
  electricityPriceLow: z.number().finite().min(0).max(2).nullable().default(null),
  exportCostModel: z.enum(["none", "perKwh", "tiers", "fixed", "timeOfUse"]).default("perKwh"),
  exportCostNight: z.number().finite().min(0).max(1).nullable().default(null),
  exportCostTiers: z
    .array(
      z.object({
        upToKwh: z.number().min(0).max(100000).nullable(),
        annualCost: z.number().min(0).max(5000),
      }),
    )
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
  batteryType: z.enum(["lfp", "nmc", "unknown"]).default("unknown"),
  /** Manufacturer capacity loss in % per year; null = cautious default per type. */
  batteryDegradationPct: z.number().min(0).max(10).nullable().default(null),
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
const DAYLIGHT = [8, 9.8, 11.8, 13.8, 15.6, 16.6, 16.2, 14.7, 12.6, 10.6, 8.7, 7.6];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
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
const HEAT_SHAPE = norm(
  H.map((h) => (h < 6 ? 0.03 : h < 10 ? 0.06 : h < 17 ? 0.035 : h < 23 ? 0.05 : 0.03)),
);
const EV_EVENING = norm(H.map((h) => (h >= 18 && h <= 23 ? 1 : 0)));
const EV_SOLAR = norm(H.map((h) => (h >= 10 && h <= 15 ? 1 : 0)));
const heatPerM3 = () => C.heat.kwhPerM3 * C.heat.boilerEfficiency;
const solarFactor = () => 1 - C.solar.extraLossShare;

/**
 * Technical fields the consumer no longer edits: when they still hold the shipped
 * code default and were not explicitly provided, use the live (admin-published)
 * configuration instead. Explicit values (provided, or non-default) always win.
 */
const LIVE_DEFAULTS: [keyof EnergyProfile, () => unknown][] = [
  ["electricityPrice", () => C.tariffs.electricityPrice],
  ["gasPrice", () => C.tariffs.gasPrice],
  ["exportPrice", () => C.tariffs.exportPrice],
  ["exportCost", () => C.tariffs.exportCost],
  ["publicChargePrice", () => C.tariffs.publicChargePrice],
  ["gasConnectionFixed", () => C.tariffs.gasConnectionFixed],
  ["existingWp", () => C.solar.existingWp],
  ["newWp", () => C.solar.newWp],
  ["yieldPerKwp", () => C.solar.yieldPerKwp],
  ["hybridCoverage", () => C.heat.hybridCoverage],
  ["hotWaterCop", () => C.heat.hotWaterCop],
  ["hotWaterGas", () => C.heat.hotWaterGas],
  ["cookingGas", () => C.heat.cookingGas],
  ["batteryEfficiency", () => C.battery.efficiency],
  ["batteryStandbyW", () => C.battery.standbyW],
  ["evKwhPer100Km", () => C.ev.kwhPer100Km * (1 + C.ev.chargeLoss)],
  ["homeChargeShare", () => C.ev.homeShare],
  ["aircoHeatingShare", () => C.airco.heatShareGas],
  ["aircoScop", () => C.airco.scop],
];
export function withLiveDefaults(p: EnergyProfile, opts: { year?: boolean } = {}): EnergyProfile {
  const q = { ...p } as Record<string, unknown>;
  for (const [k, live] of LIVE_DEFAULTS)
    if (!p.provided.includes(k) && q[k] === DEFAULT_PROFILE[k]) q[k] = live();
  if (!p.provided.includes("coolingKwh") && p.coolingKwh === DEFAULT_PROFILE.coolingKwh)
    q["coolingKwh"] = Math.round((p.aircoRooms * C.airco.coolingDemandPerRoom) / C.airco.seer);
  if (opts.year && !p.provided.includes("year") && p.year === DEFAULT_PROFILE.year)
    q["year"] = C.mainYear;
  if (!p.provided.includes("contractType") && p.contractType === "onbekend")
    q["contractType"] = C.defaults.contractType;
  return q as EnergyProfile;
}

const COOL_SHAPE = norm(H.map((h) => (h >= 12 && h <= 18 ? 1 : 0)));

export function effectiveScop(p: EnergyProfile) {
  return p.scop ?? C.heat.scopByFlow[p.flowTemperature] * C.heat.insulationScopFactor[p.insulation];
}
export const usesNetMetering = (p: EnergyProfile) =>
  p.netMetering && p.year <= C.netMeteringLastYear;
const newSolarKwh = (p: EnergyProfile) =>
  p.adviseSolar
    ? Math.max(0, p.consumption * C.solar.adviseKwhShare - existingSolarKwh(p))
    : ((p.newPanels * p.newWp) / 1000) * p.yieldPerKwp * solarFactor();
const existingSolarKwh = (p: EnergyProfile) =>
  p.existingPanels > 0
    ? (p.existingYield ?? ((p.existingPanels * p.existingWp) / 1000) * p.yieldPerKwp * solarFactor())
    : 0;
const newBatteryKwh = (p: EnergyProfile) =>
  p.adviseBattery
    ? p.consumption > C.battery.adviseLargeAboveKwh
      ? C.battery.adviseLargeCapacity
      : C.battery.defaultCapacity
    : p.newBattery;

// Representative dynamic price shape per month (mean 1 over the day). Not historical data.
let dynCache: { stamp: number; shape: number[][] } | null = null;
const dynShape = () => {
  if (dynCache?.stamp === configState.stamp) return dynCache.shape;
  const SUN = C.solar.monthlyShare;
  const shape = SUN.map((sunM, m) => {
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
  dynCache = { stamp: configState.stamp, shape };
  return shape;
};
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
  const low =
    !dynamic && p.electricityPriceLow !== null && C.tariffs.lowTariffHours.includes(hour as never);
  const spotDev = C.dynamic.spotAvg * (dynShape()[month]![hour]! - 1);
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
    importPrice: dynamic
      ? t.electricityPrice + C.dynamic.vat * spotDev
      : low
        ? p.electricityPriceLow!
        : t.electricityPrice,
    exportPrice: dynamic ? t.exportPrice + spotDev : Math.max(t.exportPrice, exportFloor(p)),
    exportCostRate,
  };
}
/** Annual export charge that depends on the full-year export volume (tiers/fixed). */
export function annualExportCharge(p: EnergyProfile, grossExportKwh: number) {
  if (p.exportCostModel === "fixed") return p.exportCostFixed;
  if (p.exportCostModel !== "tiers" || !p.exportCostTiers.length) return 0;
  const tiers = [...p.exportCostTiers].sort(
    (a, b) => (a.upToKwh ?? Infinity) - (b.upToKwh ?? Infinity),
  );
  return (tiers.find((t) => grossExportKwh <= (t.upToKwh ?? Infinity)) ?? tiers[tiers.length - 1]!)
    .annualCost;
}

type Options = { performance?: number; cooling?: boolean; batteryHealth?: number };
function simulate(input: EnergyProfile, selected: Set<string>, opt: Options = {}) {
  const p = withLiveDefaults(input);
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
    const heat = spaceGas * heatPerM3() + electricHeat;
    const coverage = p.target === "electric" ? 1 : p.hybridCoverage / 100;
    spaceElectricity = (heat * coverage) / (effectiveScop(p) * performance);
    if (p.target === "hybrid") gas = p.gas - spaceGas + (heat * (1 - coverage)) / heatPerM3();
    else {
      gas = Math.max(0, p.gas - spaceGas - hotGas);
      waterElectricity = (hotGas * heatPerM3()) / (p.hotWaterCop * performance);
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
      aircoHeat = (replaced * heatPerM3()) / (p.aircoScop * performance);
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
  const newCapacity = selected.has("battery") ? newBatteryKwh(p) * (opt.batteryHealth ?? 1) : 0;
  const capacity = p.existingBattery + newCapacity;
  const power = capacity * C.battery.chargePowerPerKwh;
  const outPower = capacity * C.battery.dischargePowerPerKwh;
  const eff = p.batteryEfficiency;
  const minE = capacity * C.battery.minSoc;
  const maxE = capacity * C.battery.maxSoc;
  const dynamic = p.contractType === "dynamisch";
  const gridChargeAllowed =
    C.battery.allowGridCharging &&
    p.batteryStrategy === "smart" &&
    p.gridCharging &&
    dynamic &&
    capacity > 0;
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
    const sunDay = (production * C.solar.monthlyShare[m]!) / d;
    const parts = {
      base: base / 365,
      heat: ((spaceElectricity + aircoHeat) * C.heat.monthlyShare[m]!) / d,
      water: waterElectricity / 365,
      ev: homeEv / 365,
      cool: (cooling * C.solar.monthlyShare[m]!) / d,
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
      const top = hours
        .map((x) => x.tariff.importPrice)
        .sort((a, b) => b - a)
        .slice(0, 4);
      gridThreshold =
        (top.reduce((a, b) => a + b, 0) / top.length) * eff - C.battery.cycleCostPerKwh;
    }
    let socSolar = 0;
    let socGrid = 0;
    const day = {
      ...t,
      demand: 0,
      direct: 0,
      charged: 0,
      gridCharged: 0,
      discharged: 0,
      dischargedSolar: 0,
      imports: 0,
      exports: 0,
    };
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
        gridCharge = Math.min(
          power - charge,
          Math.max(0, maxE - soc - charge * eff) / eff,
          gridBudget,
        );
      gridBudget -= gridCharge;
      // Never charge and discharge in the same hour.
      const avail = socSolar + socGrid;
      const discharge =
        deficit > 0 && charge + gridCharge === 0 ? Math.min(deficit, outPower, avail) : 0;
      const fromSolar = avail > 0 ? (discharge * socSolar) / avail : 0;
      socSolar = Math.max(0, socSolar + charge * eff - fromSolar);
      socGrid = Math.max(0, socGrid + gridCharge * eff - (discharge - fromSolar));
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
    for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += Math.max(0, day[k]) * d;
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
  const avgImportPrice =
    t.imports > 0
      ? Object.values(buckets).reduce((s, b) => s + b.ic, 0) / t.imports
      : p.electricityPrice;
  const standbyKwh = newCapacity > 0 ? (p.batteryStandbyW * 8760) / 1000 : 0;
  const standbyCost = standbyKwh * (avgImportPrice || p.electricityPrice);
  const gasDisconnected = wantsHeat && p.target === "electric" && p.canDisconnectGas && gas <= 1e-9;
  const gasCost = gas * p.gasPrice;
  const fixedCost = gasDisconnected ? 0 : p.gas > 0 ? p.gasConnectionFixed : 0;
  const publicChargeCost = (evEnergy - homeEv) * p.publicChargePrice;
  const cost =
    importCost - exportRevenue + exportCosts + standbyCost + gasCost + fixedCost + publicChargeCost;
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
  const p = withLiveDefaults(energyProfileSchema.parse(input), { year: true });
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
  const battery = selected.includes("battery") ? batteryReport(p, selected) : null;
  const notes = [
    "Vergelijking met je huidige installaties; bedragen zijn energiekosten, exclusief aanschaf, onderhoud en subsidies.",
    usesNetMetering(p)
      ? `Rekenjaar ${p.year} met saldering.`
      : `Rekenjaar ${p.year} zonder saldering${p.year > C.netMeteringLastYear ? " (salderingsregeling eindigt 1 januari 2027)" : ""}, met netto terugleververgoeding na terugleverkosten.`,
    `Uurmodel met een representatieve dag per maand en standaardprofielen; geen gemeten uurdata. Aannames geldig vanaf ${C.validFrom}.`,
    contractNote(p),
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
  if (selected.includes("ev") && !p.hasEv)
    notes.push("Zonder elektrische auto is voor de laadpaal geen besparing berekend.");
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
      explanationReasons:
        id === "battery" && battery
          ? [battery.conclusion]
          : [
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
    range: { min: Math.min(savings, ...uncertain), max: Math.max(savings, ...uncertain) },
    battery,
    comparisons: compareSolarBattery(p, selected),
    advice: [] as string[],
  };
  result.advice = buildAdvice(result);
  return result;
}
export type ScenarioResult = ReturnType<typeof calculateScenario>;

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
  if (has("battery") && r.battery) {
    out.push(r.battery.conclusion);
    if (r.battery.strategyNote) out.push(r.battery.strategyNote);
    if (p.contractType === "dynamisch" && !(p.batteryStrategy === "smart" && p.gridCharging))
      out.push(
        "Slim laden en ontladen op dynamische uurprijzen is niet meegerekend. Zet 'Slimme optimalisatie' en 'Laden uit het net' aan om een indicatie te zien; onbalanshandel wordt nooit meegerekend.",
      );
  }
  if (has("heatpump") && hasSolar)
    out.push(
      "Een warmtepomp verbruikt vooral in de winter stroom, als je zonnepanelen weinig opleveren. Zonnestroom dekt daarom maar een beperkt deel van dat verbruik.",
    );
  if (has("airco") && r.comfortCost > 0.5)
    out.push(
      `Koelen met een airco is een comfortverbetering en kost naar schatting ${Math.round(r.comfortCost)} euro per jaar aan stroom. Dat is niet als besparing geteld.`,
    );
  if (has("airco") && has("heatpump"))
    out.push(
      "Airco en warmtepomp vervangen samen nooit meer gas dan er is: de airco rekent alleen met de warmtevraag die de warmtepomp overlaat.",
    );
  if (r.selected.length > 1) {
    if (r.synergy < -1)
      out.push(
        `Samen leveren je maatregelen ${Math.round(-r.synergy)} euro per jaar minder op dan de optelsom van losse aanschaf. Ze gebruiken deels dezelfde zonnestroom of dezelfde warmtevraag, die maar één keer bespaard kan worden.`,
      );
    else if (r.synergy > 1)
      out.push(
        `Samen leveren je maatregelen ${Math.round(r.synergy)} euro per jaar meer op dan de optelsom van losse aanschaf, doordat ze elkaars energie benutten.`,
      );
  }
  if (has("battery") && has("ev"))
    out.push(
      "Een thuisbatterij is te klein om een elektrische auto op te laden; in de berekening gaat opgeslagen stroom naar het gewone verbruik binnen haar capaciteit.",
    );
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

const round = (n: number) => Math.round(n);
function contractNote(p: EnergyProfile) {
  const name = [p.supplier, p.contractName].filter(Boolean).join(" – ");
  const label = {
    vast: "vast contract",
    variabel: "variabel contract",
    dynamisch: "dynamisch contract (representatief uurprijsprofiel, geen historische prijzen)",
    onbekend: "onbekend contract: standaardaannames",
  }[p.contractType];
  return `Contract: ${label}${name ? ` (${name})` : ""}. De werkelijke uitkomst hangt af van je energieleverancier en contractvoorwaarden.`;
}

export type BatteryYear = {
  year: number;
  netMetering: boolean;
  avoidedImport: number;
  missedExport: number;
  exportCostSaving: number;
  standbyCost: number;
  lossKwh: number;
  lossValue: number;
  net: number;
  range: { min: number; max: number };
  extraSelfKwh: number;
  importReductionKwh: number;
  exportReductionKwh: number;
  selfShareBefore: number;
  selfShareAfter: number;
  gridChargedKwh: number;
};

/** Annual capacity loss used for the long-term horizon (manufacturer value wins). */
export function batteryDegradation(p: EnergyProfile) {
  if (p.batteryDegradationPct !== null) return p.batteryDegradationPct / 100;
  const intensive = p.batteryStrategy === "smart" && p.gridCharging;
  return C.battery.degradationByType[p.batteryType] + (intensive ? C.battery.intensiveUseExtra : 0);
}

/**
 * Indicative energy-cost saving of the new battery over the configured horizon,
 * with declining capacity and the legal rules of each calendar year. Purchase,
 * installation and replacement are NOT included: this is never a net profit.
 */
export function batteryLifetime(p: EnergyProfile, selected: readonly string[]) {
  const rest = new Set(selected.filter((x) => x !== "battery"));
  const withB = new Set([...rest, "battery"]);
  const d = batteryDegradation(p);
  const H0 = C.horizon;
  const years = Array.from({ length: H0.years }, (_, i) => {
    const f = (1 + H0.tariffChangePerYear) ** i;
    const q: EnergyProfile = {
      ...p,
      year: Math.min(2040, H0.startYear + i),
      netMetering: false,
      electricityPrice: p.electricityPrice * f,
      electricityPriceLow: p.electricityPriceLow === null ? null : p.electricityPriceLow * f,
      exportPrice: p.exportPrice * f,
      exportCost: p.exportCost * f,
      gasPrice: p.gasPrice * f,
    };
    const health = (1 - d) ** i;
    const saving = simulate(q, rest).cost - simulate(q, withB, { batteryHealth: health }).cost;
    return { index: i + 1, year: H0.startYear + i, health, saving };
  });
  const total = years.reduce((s, y) => s + y.saving, 0);
  return {
    horizonYears: H0.years,
    degradationPerYear: d,
    degradationSource:
      p.batteryDegradationPct !== null ? ("fabrikant" as const) : ("voorzichtige aanname" as const),
    firstYear: years[0]!.saving,
    average: total / H0.years,
    cumulative: total,
    // Cautious band: ±sensitivity on the cumulative energy saving, never a narrow range.
    range: {
      min: Math.min(total * (1 - C.sensitivity * 1.5), total * (1 + C.sensitivity * 1.5)),
      max: Math.max(total * (1 - C.sensitivity * 1.5), total * (1 + C.sensitivity * 1.5)),
    },
    finalHealth: years[years.length - 1]!.health,
    years,
  };
}

/**
 * Marginal battery value: the same home configuration with and without the new
 * battery, for 2026 with saldering and the main year (2027) without.
 */
export function batteryReport(p: EnergyProfile, selected: readonly string[]) {
  const rest = selected.filter((x) => x !== "battery");
  const years = (
    [
      [2026, true],
      [2027, false],
    ] as const
  ).map(([year, netMetering]): BatteryYear => {
    const q = { ...p, year: year === 2027 ? Math.max(2027, p.year) : 2026, netMetering };
    const without = simulate(q, new Set(rest));
    const withB = simulate(q, new Set([...rest, "battery"]));
    const net = without.cost - withB.cost;
    // Honest band: battery efficiency and solar yield/consumption both uncertain.
    const alt = [
      ...[0.85, 0.95].map(
        (batteryEfficiency) =>
          without.cost - simulate({ ...q, batteryEfficiency }, new Set([...rest, "battery"])).cost,
      ),
      ...[1 - C.sensitivity, 1 + C.sensitivity].map(
        (performance) =>
          simulate(q, new Set(rest), { performance }).cost -
          simulate(q, new Set([...rest, "battery"]), { performance }).cost,
      ),
    ];
    const lossKwh = withB.losses - without.losses;
    const lossValue =
      lossKwh *
      (usesNetMetering(q) && without.imports > without.exports
        ? q.electricityPrice
        : Math.max(q.exportPrice - q.exportCost, 0));
    return {
      year: q.year,
      netMetering: usesNetMetering(q),
      avoidedImport: without.importCost - withB.importCost,
      missedExport: withB.exportRevenue - without.exportRevenue,
      exportCostSaving: without.exportCosts - withB.exportCosts,
      standbyCost: -(withB.standbyCost - without.standbyCost),
      lossKwh,
      lossValue,
      net,
      // Never narrower than ±25%: hourly profiles and tariffs are assumptions.
      range: {
        min: Math.min(net, ...alt, net - Math.abs(net) * 0.25),
        max: Math.max(net, ...alt, net + Math.abs(net) * 0.25),
      },
      extraSelfKwh:
        withB.direct + withB.dischargedSolar - (without.direct + without.dischargedSolar),
      importReductionKwh: without.imports - withB.imports,
      exportReductionKwh: without.exports - withB.exports,
      selfShareBefore: without.selfConsumption,
      selfShareAfter: withB.selfConsumption,
      gridChargedKwh: withB.gridCharged,
    };
  });
  const [y26, y27] = years as [BatteryYear, BatteryYear];
  const lifetime = batteryLifetime(p, selected);
  const conclusion = batteryConclusion(p, y26, y27, lifetime.cumulative);
  const strategyNote =
    p.batteryStrategy === "smart"
      ? "Slimme optimalisatie vraagt een energiemanagementsysteem of een batterij met sturing op uurprijzen."
      : null;
  return { years, y2026: y26, y2027: y27, lifetime, conclusion, strategyNote, comparedWith: rest };
}

function batteryConclusion(
  p: EnergyProfile,
  y26: BatteryYear,
  y27: BatteryYear,
  cumulative: number,
) {
  const base =
    "Een thuisbatterij wekt zelf geen stroom op; ze helpt je bestaande zonnestroom beter te benutten.";
  if (y27.net > 25) {
    const tail =
      y26.net <= 5
        ? ` In 2026 levert ze met saldering nog weinig op (${signed(y26.net)}), omdat teruggeleverde stroom dan nog tegen de volle prijs wordt verrekend.`
        : "";
    return `${base} Vanaf 2027 bespaart de batterij in jouw situatie ongeveer ${signed(y27.net)} per jaar: je gebruikt ${round(y27.extraSelfKwh)} kWh meer eigen zonnestroom en koopt ${round(y27.importReductionKwh)} kWh minder in. Over ${C.horizon.years} jaar is dat indicatief ${signed(cumulative)} aan lagere energiekosten (aanschaf niet meegerekend).${tail}`;
  }
  const why: string[] = [];
  if (y27.extraSelfKwh < 150) why.push("er is weinig zonneoverschot om op te slaan");
  if (p.exportPrice - p.exportCost >= p.electricityPrice * 0.6)
    why.push(
      "je terugleververgoeding ligt dicht bij je stroomprijs, dus opslaan levert weinig extra op",
    );
  if (y27.lossValue > Math.max(y27.net, 0)) why.push("het opslagverlies weegt zwaar");
  if (Math.abs(y27.standbyCost) > 5) why.push("het stand-byverbruik kost geld");
  const improve = [
    p.existingPanels + p.newPanels < 10 ? "meer zonnepanelen" : null,
    p.exportCost === 0 && p.exportCostModel !== "tiers" && p.exportCostModel !== "fixed"
      ? "terugleverkosten in je contract (die vermijd je met opslag)"
      : null,
    p.contractType !== "dynamisch" ? "een dynamisch contract met slimme sturing" : null,
    "meer stroomverbruik 's avonds en 's nachts",
  ].filter(Boolean);
  return `${base} In jouw situatie levert ze vanaf 2027 weinig of niets op (${signed(y27.net)} per jaar)${why.length ? `, omdat ${why.join(" en ")}` : ""}. Het resultaat kan verbeteren met ${improve.join(", ")}.`;
}

const signed = (n: number) => `${n >= 0 ? "+" : "−"}€ ${Math.abs(Math.round(n))}`;

/** Scenarios A-D (current, +battery, +solar, +solar+battery) per year, other selected measures held equal. */
export function compareSolarBattery(p: EnergyProfile, selected: readonly string[]) {
  const rest = selected.filter((x) => x !== "solar" && x !== "battery");
  const sets = { A: [], B: ["battery"], C: ["solar"], D: ["solar", "battery"] } as const;
  return ([2026, 2027] as const).map((year) => {
    const q = {
      ...p,
      year: year === 2027 ? Math.max(2027, p.year) : 2026,
      netMetering: year === 2026,
    };
    const costs = Object.fromEntries(
      Object.entries(sets).map(([k, ids]) => [k, simulate(q, new Set([...rest, ...ids])).cost]),
    ) as Record<keyof typeof sets, number>;
    return {
      year: q.year,
      costs,
      batteryOnExisting: costs.A - costs.B,
      batteryWithNewSolar: costs.C - costs.D,
      package: costs.A - costs.D,
    };
  });
}

/** Full traceable breakdown for the admin calculation check. */
export function debugScenario(input: EnergyProfile, categories: readonly string[]) {
  const p = withLiveDefaults(energyProfileSchema.parse(input), { year: true });
  const selected = MEASURES.filter((id) => categories.includes(id));
  return {
    profile: p,
    selected,
    tariffs: H.filter((h) => h % 3 === 0).map((h) => ({
      hour: h,
      jan: hourlyTariff(p, 0, h),
      jun: hourlyTariff(p, 5, h),
    })),
    exportFloor: exportFloor(p),
    before: simulate(p, new Set()),
    after: simulate(p, new Set(selected)),
    battery: selected.includes("battery") ? batteryReport(p, selected) : null,
    comparisons: compareSolarBattery(p, selected),
  };
}
