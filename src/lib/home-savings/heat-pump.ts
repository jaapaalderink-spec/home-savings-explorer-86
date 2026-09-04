import {
  MARKET,
  AdviceResult,
  HouseType,
  EnergyContractType,
  clamp,
  bandwidth,
  confidenceFromCompleteness,
} from "./shared";

export type EnergyLabel = "a++" | "a+" | "a" | "b" | "c" | "d" | "e" | "f" | "g" | "onbekend";

export interface HeatPumpInput {
  houseType: HouseType;
  currentHeating: "gas" | "elektrisch" | "anders";
  buildYear: number;
  energyLabel: EnergyLabel;
  contract?: EnergyContractType;
  /** Warm water wordt al door een warmteboiler verzorgd: minder gas te vervangen. */
  hasHeatBoiler?: boolean;
}

const ASSUMPTIONS = {
  gasPricePerM3: MARKET.gasPricePerM3,
  electricityPricePerKwh: MARKET.electricityPricePerKwh,
  baseGasUseByHouse: {
    rijtjeshuis: 1500,
    hoekwoning: 1850,
    vrijstaand: 2600,
    appartement: 1050,
  } as Record<HouseType, number>,
  // Realistische seizoensprestatie (SCOP) van een all-electric warmtepomp in NL.
  heatPumpCop: 3.2,
  minBuildYear: 1900,
  step: 50,
};

const insulationFactor: Record<string, number> = {
  modern: 0.78,
  recent: 0.92,
  older: 1.12,
  old: 1.3,
};

const labelFactor: Record<EnergyLabel, number> = {
  "a++": 0.7,
  "a+": 0.75,
  a: 0.8,
  b: 0.9,
  c: 1.0,
  d: 1.1,
  e: 1.2,
  f: 1.3,
  g: 1.4,
  onbekend: 1.0,
};

function yearBucket(year: number): keyof typeof insulationFactor {
  if (year >= 2015) return "modern";
  if (year >= 1995) return "recent";
  if (year >= 1975) return "older";
  return "old";
}

export function calculateHeatPumpAdvice(input: HeatPumpInput): AdviceResult {
  const houseType = input.houseType || "rijtjeshuis";
  const currentHeating = input.currentHeating || "gas";
  const buildYear = clamp(input.buildYear || 1985, ASSUMPTIONS.minBuildYear, 2025);

  const baseGasUse = ASSUMPTIONS.baseGasUseByHouse[houseType];
  const insulation = insulationFactor[yearBucket(buildYear)];
  const adjustedGasUse = Math.round(
    baseGasUse * (insulation ?? 1) * (input.hasHeatBoiler ? 0.88 : 1),
  );

  let practicalSavings = 0;
  const reasons: string[] = [];
  const badges: string[] = [];

  if (currentHeating === "gas") {
    const gasCost = adjustedGasUse * ASSUMPTIONS.gasPricePerM3;
    const heatDemandKwh = adjustedGasUse * MARKET.gasKwhPerM3 * MARKET.boilerEfficiency;
    const electricityNeeded = heatDemandKwh / ASSUMPTIONS.heatPumpCop;
    const newElectricityCost = electricityNeeded * ASSUMPTIONS.electricityPricePerKwh;
    practicalSavings = Math.max(gasCost - newElectricityCost, 0);
    reasons.push("Een warmtepomp vervangt je gasketel en verlaagt je gasrekening fors.");
    if (buildYear < 1980) {
      reasons.push("Oudere woningen isoleren vaak wat minder, houd rekening met een hybride warmtepomp.");
    } else {
      reasons.push("Je woning is goed geïsoleerd genoeg voor een efficiënte volledig-elektrische warmtepomp.");
    }
    if (input.contract === "dynamisch") {
      practicalSavings *= 1.08;
      badges.push("dynamisch contract");
    }
  } else {
    practicalSavings = adjustedGasUse * 0.4 * (ASSUMPTIONS.gasPricePerM3 - ASSUMPTIONS.electricityPricePerKwh);
    reasons.push("Met een efficiëntere warmtepomp verbruik je minder stroom voor verwarming dan nu.");
  }

  practicalSavings = Math.round(practicalSavings / ASSUMPTIONS.step) * ASSUMPTIONS.step;
  practicalSavings = Math.max(practicalSavings, 0);
  const range = bandwidth(practicalSavings, 0.25, ASSUMPTIONS.step);

  const fieldsFilled = [input.houseType, input.currentHeating, input.buildYear].filter(Boolean).length;
  const confidence = confidenceFromCompleteness(fieldsFilled, 3);

  if (input.hasHeatBoiler) {
    reasons.push(
      "Je warmteboiler verzorgt het warme water al, dus de warmtepomp hoeft hier alleen de ruimteverwarming over te nemen.",
    );
    badges.push("warm water via boiler");
  }
  if (buildYear >= 2015) badges.push("goed geïsoleerd");
  if (houseType === "vrijstaand") badges.push("groot gasverbruik");

  return {
    practicalSavings,
    range,
    beforeAfter: {
      label: "Gasverbruik",
      before: `${Math.round(adjustedGasUse)} m³/jaar`,
      after: currentHeating === "gas" ? "±0 m³/jaar" : `${Math.round(adjustedGasUse * 0.5)} m³/jaar`,
    },
    confidence,
    explanationReasons: reasons,
    badges,
  };
}
