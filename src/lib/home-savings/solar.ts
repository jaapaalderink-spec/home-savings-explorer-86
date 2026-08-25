import {
  MARKET,
  AdviceResult,
  formatNumber,
  clamp,
  bandwidth,
  confidenceFromCompleteness,
} from "./shared";

export interface SolarInput {
  panelCount: number;
  annualConsumptionKwh: number;
  alreadyHasSolar: boolean;
  /** Een warmteboiler slaat overschot als warmte op en verhoogt de zelfconsumptie. */
  hasHeatBoiler?: boolean;
}

const ASSUMPTIONS = {
  yieldPerPanelPerYearKwh: 410,
  selfConsumptionShare: 0.42,
  feedInValuePerKwh: MARKET.feedInValuePerKwh,
  pricePerKwh: MARKET.electricityPricePerKwh,
  minPanels: 4,
  maxPanels: 24,
  step: 25,
};

export function calculateSolarAdvice(input: SolarInput): AdviceResult {
  const panelCount = clamp(input.panelCount, ASSUMPTIONS.minPanels, ASSUMPTIONS.maxPanels);
  const annualConsumptionKwh = clamp(input.annualConsumptionKwh || 3500, 1500, 8000);
  const alreadyHasSolar = input.alreadyHasSolar;

  const yearlyYieldKwh = round(panelCount * ASSUMPTIONS.yieldPerPanelPerYearKwh);

  const selfConsumptionShare =
    ASSUMPTIONS.selfConsumptionShare + (input.hasHeatBoiler ? 0.12 : 0);
  const selfUsedKwh = Math.min(
    yearlyYieldKwh * selfConsumptionShare,
    annualConsumptionKwh * (input.hasHeatBoiler ? 0.85 : 0.7),
  );
  const fedInKwh = Math.max(yearlyYieldKwh - selfUsedKwh, 0);

  let practicalSavings =
    selfUsedKwh * ASSUMPTIONS.pricePerKwh + fedInKwh * ASSUMPTIONS.feedInValuePerKwh;

  if (alreadyHasSolar) {
    practicalSavings *= 0.15;
  }

  practicalSavings = Math.round(practicalSavings / ASSUMPTIONS.step) * ASSUMPTIONS.step;
  const range = bandwidth(practicalSavings, 0.2, ASSUMPTIONS.step);

  const reasons: string[] = [];
  if (alreadyHasSolar) {
    reasons.push("Je hebt al zonnepanelen, daarom richten we ons op wat extra je al hebt of uitbreiden oplevert.");
  } else {
    reasons.push(
      `Met ${panelCount} panelen wek je ongeveer ${formatNumber(yearlyYieldKwh)} kWh per jaar op.`,
    );
    if (panelCount >= 10) {
      reasons.push("Dit is een stevige installatie die een groot deel van je stroomverbruik dekt.");
    } else {
      reasons.push("Een bescheiden set dekt een flink stuk van je dagverbruik.");
    }
  }

  if (input.hasHeatBoiler) {
    reasons.push(
      "Doordat je een warmteboiler meeneemt, verbruik je een groter deel van je zonnestroom zelf in plaats van terug te leveren.",
    );
  }

  const badges: string[] = [];
  if (input.hasHeatBoiler) badges.push("hoge zelfconsumptie door warmteboiler");
  if (annualConsumptionKwh >= 4000) badges.push("hoog stroomverbruik");
  if (alreadyHasSolar) badges.push("al zonnepanelen");
  if (panelCount >= 12) badges.push("grote installatie");

  return {
    practicalSavings,
    range,
    confidence: confidenceFromCompleteness(alreadyHasSolar ? 3 : 3, 3),
    explanationReasons: reasons,
    badges,
  };
}

function round(v: number): number {
  return Math.round(v / 25) * 25;
}
