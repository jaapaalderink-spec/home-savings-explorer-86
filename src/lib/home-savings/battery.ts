import {
  AdviceResult,
  EnergyContractType,
  clamp,
  bandwidth,
  confidenceFromCompleteness,
  MARKET,
} from "./shared";

export interface BatteryInput {
  annualConsumptionKwh: number;
  annualFeedInKwh: number;
  goals: Array<"besparing" | "dynamisch" | "zelfconsumptie" | "noodstroom">;
  contract?: EnergyContractType;
  /** kWh overschot dat een warmteboiler al als warmte opslaat (niet dubbel tellen). */
  boilerSurplusKwh?: number;
}

const ASSUMPTIONS = {
  pricePerKwh: MARKET.electricityPricePerKwh,
  feedInValuePerKwh: MARKET.feedInValuePerKwh,
  step: 25,
  usableUsableFactor: 0.9,
  cyclePerYear: 280,
};

export function calculateBatteryAdvice(input: BatteryInput): AdviceResult {
  const annualConsumptionKwh = clamp(input.annualConsumptionKwh || 3500, 1500, 8000);
  const rawFeedInKwh = clamp(input.annualFeedInKwh || 2000, 0, 6000);
  const boilerSurplusKwh = clamp(input.boilerSurplusKwh || 0, 0, rawFeedInKwh);
  // Wat de warmteboiler al opslaat, kan de batterij niet nog eens opslaan.
  const annualFeedInKwh = Math.max(rawFeedInKwh - boilerSurplusKwh, 0);
  const goals = input.goals || [];

  // Voor: zonnepanelen leveren terug, lage terugleververgoeding
  const beforeFeedInSavings = annualFeedInKwh * ASSUMPTIONS.feedInValuePerKwh;

  // Na: een deel van de teruglevering sla je op en gebruik je zelf
  const selfConsumptionIncreaseKwh = Math.min(annualFeedInKwh * 0.6, ASSUMPTIONS.cyclePerYear * 10);
  const afterSavings =
    selfConsumptionIncreaseKwh * ASSUMPTIONS.pricePerKwh +
    (annualFeedInKwh - selfConsumptionIncreaseKwh) * ASSUMPTIONS.feedInValuePerKwh;

  let practicalSavings = Math.max(afterSavings - beforeFeedInSavings, 0);
  practicalSavings = Math.round(practicalSavings / ASSUMPTIONS.step) * ASSUMPTIONS.step;

  const contract = input.contract || "onbekend";
  let contractBoost = 1;
  if (goals.includes("dynamisch") || contract === "dynamisch") {
    contractBoost = 1.35;
    practicalSavings = Math.round(practicalSavings * contractBoost);
  }

  const range = bandwidth(practicalSavings, 0.24, ASSUMPTIONS.step);

  const reasons: string[] = [];
  reasons.push("Een thuisbatterij slaat overtollige zonne-stroom op voor gebruik 's avonds of 's nachts.");
  if (annualFeedInKwh > 1500) {
    reasons.push(`Je levert ${Math.round(annualFeedInKwh)} kWh/jaar terug — veel ruimte om zelf meer te verbruiken.`);
  } else {
    reasons.push("Je teruglevering is beperkt, een batterij levert vooral waarde in combinatie met dynamische tarieven.");
  }
  if (goals.includes("noodstroom")) {
    reasons.push("Je hebt noodstroom gekozen, dus een batterij met backup-functie past goed.");
  }
  if (goals.includes("dynamisch") || contract === "dynamisch") {
    reasons.push("Met een dynamisch contract laad je goedkoop op en ontlaad je op dure uren, wat de besparing flink verhoogt.");
  }

  if (boilerSurplusKwh > 0) {
    reasons.push(
      `Je warmteboiler gebruikt al ongeveer ${Math.round(boilerSurplusKwh)} kWh van je overschot, dus die kWh rekenen we hier niet nog een keer mee.`,
    );
  }

  const badges: string[] = [];
  if (boilerSurplusKwh > 0) badges.push("gecombineerd met warmteboiler");
  if (contract === "dynamisch" || goals.includes("dynamisch")) badges.push("dynamisch energiecontract");
  if (goals.includes("noodstroom")) badges.push("noodstroom gewenst");
  if (annualFeedInKwh > 2500) badges.push("veel teruglevering");

  const filled = [input.annualConsumptionKwh, input.annualFeedInKwh, goals.length > 0, contract !== "onbekend"].filter(Boolean).length;
  const confidence = confidenceFromCompleteness(filled, 4);

  return {
    practicalSavings,
    range,
    beforeAfter: {
      label: "Eigen stroomgebruik uit zon",
      before: `${Math.round((annualConsumptionKwh * 0.3) / 100) * 100} kWh/jaar`,
      after: `${Math.round(((annualConsumptionKwh * 0.3) + selfConsumptionIncreaseKwh) / 100) * 100} kWh/jaar`,
    },
    confidence,
    explanationReasons: reasons,
    badges,
  };
}
