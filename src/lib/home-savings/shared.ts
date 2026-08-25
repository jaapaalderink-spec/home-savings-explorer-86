/**
 * Gedeelde helpers en types voor de lichte bespaarmodules op de homepage.
 * Zelfde patroon als de bestaande thuisbatterij-adviesmodule:
 * aannames -> correcties -> bandbreedte -> voor/na -> confidence -> uitleg -> badges.
 */

export type Confidence = "low" | "medium" | "high";

export type EnergyContractType = "vast" | "dynamisch" | "variabel" | "onbekend";

export type HouseType = "rijtjeshuis" | "hoekwoning" | "vrijstaand" | "appartement";

export type CategoryId =
  | "solar"
  | "heatpump"
  | "battery"
  | "ev"
  | "ehms"
  | "airco"
  | "boiler";

export interface BeforeAfter {
  label: string;
  before: string;
  after: string;
}

export interface AdviceResult {
  /** Praktische geschatte jaarlijkse besparing in euro's. */
  practicalSavings: number;
  /** Bandbreedte praktisch -> toekomstbestendig. */
  range: { min: number; max: number };
  beforeAfter?: BeforeAfter;
  confidence: Confidence;
  explanationReasons: string[];
  badges: string[];
}

export const MARKET = {
  /** All-in consumentenprijs stroom incl. energiebelasting en btw (NL, 2026). */
  electricityPricePerKwh: 0.29,
  /**
   * Waarde van teruglevering na afschaffing van de salderingsregeling per
   * 1 januari 2027: alleen de terugleververgoeding, minus terugleverkosten.
   */
  feedInValuePerKwh: 0.05,
  /** All-in consumentenprijs gas incl. energiebelasting en btw (NL, 2026). */
  gasPricePerM3: 1.3,
  /** Brandstofkosten benzine per km bij ±1 op 15 en €2,05/liter. */
  fuelCostPerKm: 0.137,
  /** Rendement van een moderne HR-gasketel op onderwaarde. */
  boilerEfficiency: 0.95,
  /** Energie-inhoud aardgas in kWh per m³. */
  gasKwhPerM3: 8.8,
} as const;

/**
 * Corrigeert het opgetelde totaal voor overlap tussen maatregelen: een EHMS
 * optimaliseert dezelfde stroom die batterij/zon/EV al besparen, en airco en
 * warmtepomp vervangen deels hetzelfde gasverbruik. Zonder correctie telt de
 * som dezelfde besparing twee keer.
 */
export function combineSavings(perCategory: Record<string, number>): number {
  const value = (id: string) => perCategory[id] ?? 0;
  let total = Object.values(perCategory).reduce((sum, v) => sum + v, 0);

  const ehmsOverlapBase = value("battery") + value("solar") + value("ev");
  if (value("ehms") > 0 && ehmsOverlapBase > 0) {
    total -= Math.min(value("ehms") * 0.5, ehmsOverlapBase * 0.1);
  }
  if (value("airco") > 0 && value("heatpump") > 0) {
    total -= Math.min(value("airco"), value("heatpump")) * 0.5;
  }
  // Een warmteboiler en een warmtepomp verzorgen deels hetzelfde warme water,
  // en boiler en batterij vechten om hetzelfde zonneoverschot.
  if (value("boiler") > 0 && value("heatpump") > 0) {
    total -= Math.min(value("boiler"), value("heatpump")) * 0.35;
  }
  if (value("boiler") > 0 && value("battery") > 0) {
    total -= Math.min(value("boiler"), value("battery")) * 0.2;
  }
  return Math.max(Math.round(total / 25) * 25, 0);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Correctie op basis van energiecontract: dynamisch levert meer op bij slim schuiven. */
export function contractFactor(contract: EnergyContractType): number {
  switch (contract) {
    case "dynamisch":
      return 1.22;
    case "variabel":
      return 1.05;
    case "vast":
      return 0.94;
    default:
      return 0.96;
  }
}

export function confidenceFromCompleteness(filled: number, total: number): Confidence {
  const ratio = total === 0 ? 0 : filled / total;
  if (ratio >= 0.99) return "high";
  if (ratio >= 0.6) return "medium";
  return "low";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "indicatie op basis van beperkte gegevens",
  medium: "goede inschatting",
  high: "sterke inschatting",
};

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 0 }).format(value);
}

/** Bouwt een lopende adviestekst uit losse redenen. */
export function buildAdviceText(reasons: string[]): string {
  return reasons.join(" ");
}

/** Standaard bandbreedte rond een praktische waarde. */
export function bandwidth(practical: number, spread = 0.22, step = 25) {
  return {
    min: roundToStep(practical * (1 - spread), step),
    max: roundToStep(practical * (1 + spread), step),
  };
}
