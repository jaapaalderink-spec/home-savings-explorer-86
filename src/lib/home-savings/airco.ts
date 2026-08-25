import { AdviceResult, HouseType, clamp, bandwidth, confidenceFromCompleteness, MARKET } from "./shared";

export interface AircoInput {
  roomCount: number;
  houseType: HouseType;
}

const ASSUMPTIONS = {
  electricityPricePerKwh: MARKET.electricityPricePerKwh,
  gasPricePerM3: MARKET.gasPricePerM3,
  kwhPerRoomPerYear: 700,
  gasReplacePerRoom: 250,
  // Airco/lucht-lucht warmtepomp: hoge COP in het naseizoen, lager in de winter.
  heatPumpCop: 3.2,
  // Extra stroom voor koelen in de zomer per ruimte.
  coolingKwhPerRoom: 120,
  step: 25,
};

export function calculateAircoAdvice(input: AircoInput): AdviceResult {
  const roomCount = clamp(input.roomCount || 1, 1, 8);
  const houseType = input.houseType || "rijtjeshuis";

  const yearlyKwh = roomCount * ASSUMPTIONS.kwhPerRoomPerYear;
  const gasReplacedM3 = roomCount * ASSUMPTIONS.gasReplacePerRoom;

  // Besparing: airco (hoge COP) vervangt deel van gasverwarming in stookseizoen
  const gasSavings = gasReplacedM3 * ASSUMPTIONS.gasPricePerM3;
  const extraElectricity =
    ((gasReplacedM3 * MARKET.gasKwhPerM3 * MARKET.boilerEfficiency) / ASSUMPTIONS.heatPumpCop) *
    ASSUMPTIONS.electricityPricePerKwh;
  const coolingCost = roomCount * ASSUMPTIONS.coolingKwhPerRoom * ASSUMPTIONS.electricityPricePerKwh;
  let practicalSavings = Math.max(gasSavings - extraElectricity - coolingCost, 0);
  practicalSavings = Math.round(practicalSavings / ASSUMPTIONS.step) * ASSUMPTIONS.step;

  const range = bandwidth(practicalSavings, 0.25, ASSUMPTIONS.step);

  const reasons: string[] = [];
  reasons.push("Een moderne airco (met warmtepompfunctie) koelt én verwarmt efficiënt door de hoge COP.");
  if (roomCount >= 3) {
    reasons.push(`Met ${roomCount} ruimtes dekt de airco een groot deel van je verwarming en bespaar je veel gas.`);
  } else {
    reasons.push(`Voor ${roomCount} ruimte(s) is het een gerichte besparing op comfortabele temperaturen.`);
  }
  if (houseType === "appartement") {
    reasons.push("In een appartement is een multi-split airco vaak de makkelijkste keuze zonder gasaansluiting.");
  }

  const badges: string[] = [];
  if (roomCount >= 4) badges.push("meerdere ruimtes");
  if (houseType === "appartement") badges.push("appartement");

  const filled = [input.roomCount > 0, Boolean(input.houseType)].filter(Boolean).length;
  const confidence = confidenceFromCompleteness(filled, 2);

  return {
    practicalSavings,
    range,
    beforeAfter: {
      label: "Gasverbruik verwarming",
      before: `${Math.round(gasReplacedM3 * 1.6)} m³/jaar`,
      after: `${Math.round(gasReplacedM3 * 0.6)} m³/jaar`,
    },
    confidence,
    explanationReasons: reasons,
    badges,
  };
}
