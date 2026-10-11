// Central, editable assumptions for the household energy model.
// None of these are live tariffs: every value is an illustrative default.
// Admins can override the editable values via "Calculatorinstellingen"
// (published versions in the database); see ./calculator-settings.ts.
// Legal rules (saldering end date, legal minimum feed-in) are NOT editable there.
const DEFAULTS = {
  validFrom: "2026-01-01",
  reviewedAt: "2026-10-11",
  version: 5,
  defaults: { contractType: "onbekend" as "vast" | "variabel" | "dynamisch" | "onbekend" },
  tariffs: {
    electricityPrice: 0.29, // euro/kWh incl. taxes (assumption)
    gasPrice: 1.3, // euro/m3 incl. taxes (assumption)
    exportPrice: 0.05, // euro/kWh feed-in compensation (assumption)
    exportCost: 0, // euro/kWh feed-in charge, contract dependent (assumption)
    publicChargePrice: 0.5, // euro/kWh (assumption)
    gasConnectionFixed: 0, // euro/year, only saved when the connection is actually removed
    lowTariffHours: [23, 0, 1, 2, 3, 4, 5, 6] as number[], // daltarief on a representative weekday
  },
  netMeteringLastYear: 2026, // Dutch saldering ends 1 January 2027 (Wet beëindiging salderingsregeling)
  // From 2027 to 2030 a supplier must pay a reasonable feed-in compensation of at
  // least 50% of the bare supply price (fixed/variable contracts). The bare supply
  // price itself is an assumption; verify against the contract.
  legalMinExport: { fromYear: 2027, toYear: 2030, share: 0.5, bareSupplyPrice: 0.1 },
  // Representative (not historical) dynamic price shape. Spot average excl. VAT.
  dynamic: { spotAvg: 0.09, vat: 1.21, eveningPeak: 0.45, solarDip: 1.3, nightDip: 0.15 },
  solar: {
    yieldPerKwp: 850, // already includes normal system losses
    newWp: 450,
    existingWp: 350,
    adviseKwhShare: 0.9,
    defaultNewPanels: 8,
    extraLossShare: 0, // only if yieldPerKwp does NOT include system losses
    monthlyShare: [
      0.025, 0.045, 0.08, 0.115, 0.135, 0.14, 0.135, 0.115, 0.085, 0.065, 0.035, 0.025,
    ] as number[],
  },
  battery: {
    efficiency: 0.9,
    chargePowerPerKwh: 0.5,
    dischargePowerPerKwh: 0.5,
    adviseOptions: [5, 10, 15] as number[],
    defaultCapacity: 5,
    adviseLargeAboveKwh: 5000, // "Laat adviseren": larger battery above this consumption
    adviseLargeCapacity: 10,
    minSoc: 0.05,
    maxSoc: 1,
    standbyW: 0,
    cycleCostPerKwh: 0, // wear cost per discharged kWh; no reliable figure, excluded
    allowGridCharging: true, // only ever with smart strategy + dynamic contract
    lifetimeYears: 15,
    degradationByType: { lfp: 0.015, nmc: 0.025, unknown: 0.025 },
    intensiveUseExtra: 0.005,
  },
  horizon: { years: 15, startYear: 2027, tariffChangePerYear: 0 },
  mainYear: 2027,
  heat: {
    kwhPerM3: 8.8,
    boilerEfficiency: 0.95,
    scopByFlow: { "35": 4.2, "45": 3.6, "55": 2.9, "65": 2.3, unknown: 3.2 },
    insulationScopFactor: { good: 1.05, average: 1, poor: 0.9, unknown: 1 },
    hybridCoverage: 60,
    hotWaterCop: 2.5,
    hotWaterGas: 250,
    cookingGas: 30,
    monthlyShare: [0.17, 0.15, 0.13, 0.08, 0.04, 0.01, 0, 0, 0.03, 0.08, 0.13, 0.18] as number[],
  },
  airco: { scop: 4, seer: 4, coolingDemandPerRoom: 400, heatShareGas: 20, defaultRooms: 2 },
  ev: { km: 12000, kwhPer100Km: 18, chargeLoss: 0.11, homeShare: 70 },
  sensitivity: 0.2,
};

export type EnergyConfig = typeof DEFAULTS;

export const DEFAULT_ENERGY_CONFIG: EnergyConfig = structuredClone(DEFAULTS);

/** Live configuration read by the engine. Mutated only via calculator-settings. */
export const ENERGY_CONFIG: EnergyConfig = structuredClone(DEFAULTS);

/** Increments whenever ENERGY_CONFIG changes, for derived caches. */
export const configState = { stamp: 0, publishedVersion: null as number | null };

/**
 * Versioned catalogue of supplier contract terms (source, validity, last check).
 * Filled from the published admin configuration; empty by default.
 */
export type TariffSet = {
  id: string;
  supplier: string;
  product: string;
  contractType: "vast" | "variabel" | "dynamisch";
  validFrom: string;
  validTo?: string;
  version: number;
  source: string;
  checkedAt: string;
  electricityPrice: number;
  electricityPriceLow?: number;
  exportPrice: number;
  exportCostModel: "none" | "perKwh" | "tiers" | "fixed" | "timeOfUse";
  exportCost?: number;
  exportCostTiers?: { upToKwh: number | null; annualCost: number }[];
};
export const TARIFF_SETS: TariffSet[] = [];
