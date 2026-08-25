import {
  MARKET,
  AdviceResult,
  EnergyContractType,
  clamp,
  bandwidth,
  confidenceFromCompleteness,
  formatNumber,
} from "./shared";

export interface BoilerInput {
  /** Aantal personen in het huishouden — bepaalt de warmwatervraag. */
  persons: number;
  /** Hoe wordt warm water nu gemaakt? */
  currentWaterHeating: "gas" | "elektrisch" | "warmtepomp";
  /** Overtollige zonnestroom per jaar (kWh) die je in warmte kunt opslaan. */
  annualFeedInKwh: number;
  contract?: EnergyContractType;
}

/**
 * Aannames voor een warmteboiler (warmtepompboiler / warmwaterbuffer) als
 * energieopslag: overtollige stroom wordt als warm water bewaard in plaats van
 * teruggeleverd tegen een lage vergoeding.
 */
const ASSUMPTIONS = {
  /** Gasverbruik warm water: basis plus per persoon (NL-gemiddelde ± 200 m³ bij 3 personen). */
  baseGasM3: 45,
  gasM3PerPerson: 52,
  /** Rendement van gastoestel op tapwater (inclusief leiding- en opwarmverliezen). */
  dhwBoilerEfficiency: 0.62,
  /** Seizoensrendement van een warmtepompboiler op tapwater. */
  heatPumpBoilerCop: 3.0,
  /** Rendement van een klassieke elektrische boiler (weerstandselement). */
  electricBoilerEfficiency: 0.95,
  /** Deel van de warmwatervraag dat je met dagoverschot kunt opladen. */
  surplusUsableShare: 0.6,
  step: 25,
};

export function calculateBoilerAdvice(input: BoilerInput): AdviceResult {
  const persons = clamp(input.persons || 3, 1, 8);
  const currentWaterHeating = input.currentWaterHeating || "gas";
  const annualFeedInKwh = clamp(input.annualFeedInKwh || 0, 0, 8000);
  const contract = input.contract || "onbekend";

  // Aannames -> warmwatervraag
  const gasM3 = ASSUMPTIONS.baseGasM3 + persons * ASSUMPTIONS.gasM3PerPerson;
  const heatDemandKwh = gasM3 * MARKET.gasKwhPerM3 * ASSUMPTIONS.dhwBoilerEfficiency;
  const electricityNeededKwh = heatDemandKwh / ASSUMPTIONS.heatPumpBoilerCop;

  // Correcties -> hoeveel van die stroom komt uit eigen overschot
  const chargeableFromSurplusKwh = Math.min(
    electricityNeededKwh * ASSUMPTIONS.surplusUsableShare,
    annualFeedInKwh,
  );
  const gridKwh = Math.max(electricityNeededKwh - chargeableFromSurplusKwh, 0);

  const newCost =
    chargeableFromSurplusKwh * MARKET.feedInValuePerKwh + gridKwh * MARKET.electricityPricePerKwh;

  const reasons: string[] = [];
  const badges: string[] = [];
  let practicalSavings = 0;
  let beforeLabel = "Warm water";
  let beforeValue = `${formatNumber(gasM3)} m³ gas/jaar`;

  if (currentWaterHeating === "gas") {
    const currentCost = gasM3 * MARKET.gasPricePerM3;
    practicalSavings = currentCost - newCost;
    reasons.push(
      `Je maakt warm water nu met gas: ongeveer ${formatNumber(gasM3)} m³ per jaar voor ${persons} ${persons === 1 ? "persoon" : "personen"}.`,
    );
    reasons.push(
      "Een warmteboiler maakt datzelfde warme water met stroom en een warmtepomp, en bewaart het als warmte tot je het nodig hebt.",
    );
  } else if (currentWaterHeating === "elektrisch") {
    const currentKwh = heatDemandKwh / ASSUMPTIONS.electricBoilerEfficiency;
    const currentCost = currentKwh * MARKET.electricityPricePerKwh;
    practicalSavings = currentCost - newCost;
    beforeLabel = "Stroom voor warm water";
    beforeValue = `${formatNumber(currentKwh)} kWh/jaar`;
    reasons.push(
      "Je huidige elektrische boiler zet stroom één-op-één om in warmte; een warmtepompboiler doet dat met ongeveer een derde van de stroom.",
    );
  } else {
    // Warm water komt al van een warmtepomp: winst zit in slim opslaan van overschot.
    practicalSavings =
      chargeableFromSurplusKwh * (MARKET.electricityPricePerKwh - MARKET.feedInValuePerKwh) * 0.6;
    beforeLabel = "Teruggeleverd overschot";
    beforeValue = `${formatNumber(annualFeedInKwh)} kWh/jaar`;
    reasons.push(
      "Je warm water komt al van een warmtepomp; een extra warmtebuffer levert vooral op doordat je overschot als warmte bewaart in plaats van terug te leveren.",
    );
  }

  // Flexibiliteitsbonus: warmte is de goedkoopste vorm van opslag om te schuiven.
  if (contract === "dynamisch") {
    practicalSavings *= 1.12;
    reasons.push(
      "Met een dynamisch contract laad je de boiler op de goedkoopste uren van de dag op, wat de besparing verder verhoogt.",
    );
    badges.push("dynamisch energiecontract");
  } else if (contract === "variabel") {
    practicalSavings *= 1.03;
  }

  if (annualFeedInKwh >= 1500) {
    reasons.push(
      `Je levert ongeveer ${formatNumber(annualFeedInKwh)} kWh per jaar terug — daarvan kan de boiler zo'n ${formatNumber(chargeableFromSurplusKwh)} kWh als warmte vasthouden.`,
    );
    badges.push("veel eigen overschot");
  } else {
    reasons.push(
      "Zonder veel eigen overschot laadt de boiler vooral op netstroom; in combinatie met zonnepanelen wordt de besparing groter.",
    );
  }

  practicalSavings = Math.max(
    Math.round(practicalSavings / ASSUMPTIONS.step) * ASSUMPTIONS.step,
    0,
  );
  const range = bandwidth(practicalSavings, 0.24, ASSUMPTIONS.step);

  if (currentWaterHeating === "gas") badges.push("stap van het gas af");
  if (persons >= 4) badges.push("grote warmwatervraag");

  const filled = [
    input.persons,
    input.currentWaterHeating,
    input.annualFeedInKwh > 0,
    contract !== "onbekend",
  ].filter(Boolean).length;

  return {
    practicalSavings,
    range,
    beforeAfter: {
      label: beforeLabel,
      before: beforeValue,
      after: `${formatNumber(gridKwh)} kWh netstroom/jaar`,
    },
    confidence: confidenceFromCompleteness(filled, 4),
    explanationReasons: reasons,
    badges,
  };
}

/**
 * Hoeveel eigen overschot (kWh/jaar) een warmteboiler wegneemt van de
 * beschikbare zonnestroom. Andere modules (batterij, zon, EHMS) gebruiken dit
 * zodat dezelfde kWh niet twee keer wordt bespaard.
 */
export function boilerSurplusUseKwh(input: BoilerInput): number {
  const persons = clamp(input.persons || 3, 1, 8);
  const gasM3 = ASSUMPTIONS.baseGasM3 + persons * ASSUMPTIONS.gasM3PerPerson;
  const electricityNeededKwh =
    (gasM3 * MARKET.gasKwhPerM3 * ASSUMPTIONS.dhwBoilerEfficiency) / ASSUMPTIONS.heatPumpBoilerCop;
  return Math.round(
    Math.min(
      electricityNeededKwh * ASSUMPTIONS.surplusUsableShare,
      clamp(input.annualFeedInKwh || 0, 0, 8000),
    ),
  );
}
