import { MARKET, AdviceResult, clamp, bandwidth, confidenceFromCompleteness, formatEuro, formatNumber } from "./shared";

export interface EVInput {
  evStatus: "nu" | "binnen2jaar" | "nogniet";
  annualKm: number;
}

const ASSUMPTIONS = {
  evConsumptionKwhPerKm: 0.17,
  fuelCostPerKm: MARKET.fuelCostPerKm,
  electricityPricePerKwh: MARKET.electricityPricePerKwh,
  homeChargeShare: 0.75,
  solarChargeShare: 0.35,
  // Gemiddeld publiek laadtarief NL (AC + snelladen gemengd).
  publicPricePerKwh: 0.55,
  step: 25,
};

export function calculateEVAdvice(input: EVInput): AdviceResult {
  const annualKm = clamp(input.annualKm || 12000, 2000, 60000);
  const evStatus = input.evStatus || "nogniet";

  const evChargingKwh = annualKm * ASSUMPTIONS.evConsumptionKwhPerKm;
  const homeChargingKwh = evChargingKwh * ASSUMPTIONS.homeChargeShare;
  const solarChargingKwh = homeChargingKwh * ASSUMPTIONS.solarChargeShare;

  const fuelCost = annualKm * ASSUMPTIONS.fuelCostPerKm;
  const evCost =
    solarChargingKwh * MARKET.feedInValuePerKwh +
    (homeChargingKwh - solarChargingKwh) * ASSUMPTIONS.electricityPricePerKwh;
  const evPublicCost = evChargingKwh * (1 - ASSUMPTIONS.homeChargeShare) * ASSUMPTIONS.publicPricePerKwh;

  let practicalSavings = Math.max(fuelCost - (evCost + evPublicCost), 0);
  practicalSavings = Math.round(practicalSavings / ASSUMPTIONS.step) * ASSUMPTIONS.step;

  const range = bandwidth(practicalSavings, 0.2, ASSUMPTIONS.step);

  const reasons: string[] = [];
  if (evStatus === "nu") {
    reasons.push("Je rijdt al elektrisch — een eigen laadpaal maakt thuis laden makkelijk en goedkoper dan openbare palen.");
  } else if (evStatus === "binnen2jaar") {
    reasons.push("Je overweegt een elektrische auto binnen 2 jaar; een laadpaal zit dan vaak in het plaatje.");
  } else {
    reasons.push("Laat je een laadpaal meenemen, dan rijd je toekomstbestendig moeiteloos elektrisch zodra je overstapt.");
  }
  reasons.push(`Met ${formatNumber(annualKm)} km/jaar bespaar je fors op brandstofkosten.`);

  const badges: string[] = [];
  if (annualKm >= 15000) badges.push("veel kilometers");
  if (evStatus === "nu" || evStatus === "binnen2jaar") badges.push("elektrische auto gepland");

  const filled = [input.annualKm > 0, evStatus !== "nogniet"].filter(Boolean).length;
  const confidence = confidenceFromCompleteness(filled, 2);

  return {
    practicalSavings,
    range,
    beforeAfter: {
      label: "Brandstofkosten per jaar",
      before: formatEuro(Math.round(fuelCost)),
      after: formatEuro(Math.round(evCost + evPublicCost)),
    },
    confidence,
    explanationReasons: reasons,
    badges,
  };
}
