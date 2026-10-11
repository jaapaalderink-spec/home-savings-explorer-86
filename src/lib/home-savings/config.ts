// Central, editable assumptions for the household energy model.
// None of these are live tariffs: every value is an illustrative default the
// visitor (or an admin editing this file) can override. Do not add subsidies,
// investment costs or tariffs here without a dated, sourced value.
export const ENERGY_CONFIG = {
  validFrom: "2026-01-01",
  reviewedAt: "2026-10-11",
  version: 3,
  tariffs: {
    electricityPrice: 0.29, // euro/kWh incl. taxes (assumption)
    gasPrice: 1.3, // euro/m3 incl. taxes (assumption)
    exportPrice: 0.05, // euro/kWh feed-in compensation (assumption)
    exportCost: 0, // euro/kWh feed-in charge, contract dependent (assumption)
    publicChargePrice: 0.5, // euro/kWh (assumption)
    gasConnectionFixed: 0, // euro/year, only saved when the connection is actually removed
    lowTariffHours: [23, 0, 1, 2, 3, 4, 5, 6], // daltarief on a representative weekday
  },
  netMeteringLastYear: 2026, // Dutch saldering ends 1 January 2027 (Wet beëindiging salderingsregeling)
  // From 2027 to 2030 a supplier must pay a reasonable feed-in compensation of at
  // least 50% of the bare supply price (fixed/variable contracts). The bare supply
  // price itself is an assumption; verify against the contract.
  legalMinExport: { fromYear: 2027, toYear: 2030, share: 0.5, bareSupplyPrice: 0.1 },
  // Representative (not historical) dynamic price shape. Spot average excl. VAT;
  // the hourly deviation is added to the all-in import price (x VAT) and to the
  // feed-in price. Midday dip deepens with solar production (summer can go negative).
  dynamic: { spotAvg: 0.09, vat: 1.21, eveningPeak: 0.45, solarDip: 1.3, nightDip: 0.15 },
  solar: { yieldPerKwp: 850, newWp: 450, existingWp: 350, adviseKwhShare: 0.9 },
  battery: {
    efficiency: 0.9,
    powerPerKwh: 0.5,
    adviseOptions: [5, 10, 15],
    minSoc: 0.05, // share of capacity kept as reserve
    maxSoc: 1,
    standbyW: 0, // unknown per device: set from the manufacturer's datasheet
    cycleCostPerKwh: 0, // wear cost per discharged kWh; no reliable figure, excluded
  },
  heat: {
    kwhPerM3: 8.8,
    boilerEfficiency: 0.95,
    scopByFlow: { "35": 4.2, "45": 3.6, "55": 2.9, "65": 2.3, unknown: 3.2 },
    insulationScopFactor: { good: 1.05, average: 1, poor: 0.9, unknown: 1 },
    hybridCoverage: 60,
    hotWaterCop: 2.5,
  },
  airco: { scop: 4, coolingKwhPerRoom: 100, heatShareGas: 20 },
  ev: { km: 12000, kwhPer100Km: 20, homeShare: 70 },
  // Investment, maintenance and subsidies are intentionally empty: without
  // reliable figures no payback period is shown.
  investment: {} as Partial<Record<"solar" | "battery" | "heatpump" | "ev" | "airco", number>>,
  sensitivity: 0.2,
} as const;

/**
 * Versioned catalogue of supplier contract terms. Each entry needs a source,
 * validity date and version. It is intentionally empty: no current supplier
 * terms have been verified. Visitors enter their own terms; otherwise the
 * labelled assumptions above apply.
 */
export type TariffSet = {
  id: string;
  supplier: string;
  product: string;
  contractType: "vast" | "variabel" | "dynamisch";
  validFrom: string;
  version: number;
  source: string;
  electricityPrice: number;
  electricityPriceLow?: number;
  exportPrice: number;
  exportCostModel: "none" | "perKwh" | "tiers" | "fixed" | "timeOfUse";
  exportCost?: number;
  exportCostTiers?: { upToKwh: number | null; annualCost: number }[];
};
export const TARIFF_SETS: TariffSet[] = [];
