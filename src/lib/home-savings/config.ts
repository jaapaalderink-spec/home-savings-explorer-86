// Central, editable assumptions for the household energy model.
// None of these are live tariffs: every value is an illustrative default the
// visitor (or an admin editing this file) can override. Do not add subsidies,
// investment costs or tariffs here without a dated, sourced value.
export const ENERGY_CONFIG = {
  validFrom: "2026-01-01",
  reviewedAt: "2026-10-11",
  tariffs: {
    electricityPrice: 0.29, // euro/kWh incl. taxes (assumption)
    gasPrice: 1.3, // euro/m3 incl. taxes (assumption)
    exportPrice: 0.05, // euro/kWh feed-in compensation (assumption)
    exportCost: 0, // euro/kWh feed-in charge, contract dependent (assumption)
    publicChargePrice: 0.5, // euro/kWh (assumption)
    gasConnectionFixed: 0, // euro/year, only saved when the connection is actually removed
  },
  netMeteringLastYear: 2026, // Dutch saldering ends 1 January 2027
  solar: { yieldPerKwp: 850, newWp: 450, existingWp: 350, adviseKwhShare: 0.9 },
  battery: { efficiency: 0.9, powerPerKwh: 0.5, adviseOptions: [5, 10, 15] },
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
