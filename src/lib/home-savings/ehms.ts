import { AdviceResult, EnergyContractType, bandwidth, confidenceFromCompleteness, MARKET } from "./shared";

export interface EHMSInput {
  smartDevices: Array<"solar" | "battery" | "ev" | "heatpump" | "airco" | "boiler">;
  hasDynamicContract: "ja" | "nee" | "weetniet";
  contract?: EnergyContractType;
}

const ASSUMPTIONS = {
  // Realistisch: een EHMS optimaliseert bestaande stromen, het wekt niets op.
  baseSavingPerDevice: 55,
  dynamicBonusPerDevice: 45,
  step: 25,
  maxDevices: 5,
};

export function calculateEHMSAdvice(input: EHMSInput): AdviceResult {
  const devices = input.smartDevices || [];
  const count = Math.min(devices.length, ASSUMPTIONS.maxDevices);

  let practicalSavings = count * ASSUMPTIONS.baseSavingPerDevice;
  const isDynamic =
    input.hasDynamicContract === "ja" || input.contract === "dynamisch";

  if (isDynamic) {
    practicalSavings += count * ASSUMPTIONS.dynamicBonusPerDevice;
  }

  practicalSavings = Math.round(practicalSavings / ASSUMPTIONS.step) * ASSUMPTIONS.step;
  const range = bandwidth(practicalSavings, 0.22, ASSUMPTIONS.step);

  const reasons: string[] = [];
  reasons.push("Een energy home management system (EHMS) coördineert je apparaten zodat ze samen optimaal stroom opwekken, opslaan en verbruiken.");
  if (count >= 3) {
    reasons.push(`Met ${count} slimme systemen haalt het EHMS pas écht zijn waarde — het legt verbindingen die losse apparaten missen.`);
  } else if (count >= 1) {
    reasons.push("Hoe meer slimme apparaten je combineert, hoe meer het EHMS kan optimaliseren.");
  } else {
    reasons.push("Zonder gekoppelde apparaten levert een EHMS weinig op — begin met minstens één systeem.");
  }
  if (isDynamic) {
    reasons.push("Met een dynamisch contract kan het EHMS slim schuiven tussen dure en goedkope uren, wat flink extra oplevert.");
  }

  const badges: string[] = [];
  if (isDynamic) badges.push("dynamisch energiecontract");
  if (devices.includes("battery")) badges.push("inclusief batterij");
  if (devices.includes("ev")) badges.push("inclusief laadpaal");

  const filled = [
    count > 0,
    input.hasDynamicContract !== "weetniet" || (input.contract !== undefined && input.contract !== "onbekend"),
  ].filter(Boolean).length;
  const confidence = confidenceFromCompleteness(filled, 2);

  return {
    practicalSavings,
    range,
    beforeAfter: {
      label: "Slimme coördinatie",
      before: `${count} losse apparaten`,
      after: `${count} apparaten verbonden via EHMS`,
    },
    confidence,
    explanationReasons: reasons,
    badges,
  };
}
