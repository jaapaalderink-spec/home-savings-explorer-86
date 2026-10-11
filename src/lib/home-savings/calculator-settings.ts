import { z } from "zod";
import {
  DEFAULT_ENERGY_CONFIG,
  ENERGY_CONFIG,
  TARIFF_SETS,
  configState,
  type EnergyConfig,
  type TariffSet,
} from "./config";

/**
 * Registry of every admin-editable calculator setting. Values are stored as a flat
 * map { "tariffs.electricityPrice": 0.31 } of overrides on top of the code defaults.
 * Legal rules (saldering, legal minimum feed-in) are deliberately absent.
 */
export type SettingTab = "general" | "solar" | "battery" | "heatpump" | "airco" | "ev" | "rules";
export const SETTING_TABS: { id: SettingTab; label: string }[] = [
  { id: "general", label: "Algemene energiegegevens" },
  { id: "solar", label: "Zonnepanelen" },
  { id: "battery", label: "Thuisbatterijen" },
  { id: "heatpump", label: "Warmtepompen" },
  { id: "airco", label: "Airco's" },
  { id: "ev", label: "Laadpalen" },
  { id: "rules", label: "Rekenregels en aannames" },
];

type Base = { key: string; tab: SettingTab; label: string; help: string; unit: string };
export type SettingDef =
  | (Base & { kind: "number"; min: number; max: number; step: number; scale?: number })
  | (Base & { kind: "list"; min: number; max: number; length?: number; sum?: [number, number] })
  | (Base & { kind: "boolean" })
  | (Base & { kind: "select"; options: Record<string, string> });

const num = (
  tab: SettingTab,
  key: string,
  label: string,
  unit: string,
  min: number,
  max: number,
  help: string,
  step = 0.01,
  scale?: number,
): SettingDef => ({ kind: "number", tab, key, label, unit, min, max, step, help, scale });
// Percentages are stored as shares (0.9) and shown as 90 %.
const pct = (tab: SettingTab, key: string, label: string, min: number, max: number, help: string) =>
  num(tab, key, label, "%", min, max, help, 0.1, 100);

export const SETTINGS: SettingDef[] = [
  // Algemeen
  num("general", "tariffs.electricityPrice", "Standaard stroomprijs", "€/kWh", 0, 2, "Prijs incl. energiebelasting en btw, als de consument niets invult."),
  num("general", "tariffs.gasPrice", "Standaard gasprijs", "€/m³", 0, 10, "Prijs incl. belastingen en btw."),
  num("general", "tariffs.exportPrice", "Terugleververgoeding", "€/kWh", -1, 2, "Vergoeding per teruggeleverde kWh zonder saldering."),
  num("general", "tariffs.exportCost", "Terugleverkosten", "€/kWh", 0, 1, "Kosten per teruggeleverde kWh die veel leveranciers rekenen."),
  num("general", "tariffs.publicChargePrice", "Tarief openbaar laden", "€/kWh", 0, 2, "Gemiddelde prijs bij een publieke laadpaal."),
  num("general", "tariffs.gasConnectionFixed", "Vaste kosten gasaansluiting", "€/jaar", 0, 1000, "Alleen bespaard als de gasaansluiting echt wordt opgezegd.", 1),
  { kind: "select", tab: "general", key: "defaults.contractType", label: "Standaard contracttype", unit: "", help: "Contract waarmee gerekend wordt als de consument het niet weet.", options: { onbekend: "Onbekend (standaardaannames)", vast: "Vast", variabel: "Variabel", dynamisch: "Dynamisch" } },
  { kind: "list", tab: "general", key: "tariffs.lowTariffHours", label: "Daltarief-uren", unit: "uur", min: 0, max: 23, help: "Uren waarin een opgegeven daltarief geldt (komma-gescheiden)." },
  num("general", "dynamic.spotAvg", "Dynamisch: gemiddelde beursprijs", "€/kWh", 0, 1, "Gemiddelde kale beursprijs excl. btw in het voorbeeldverloop."),
  pct("general", "dynamic.eveningPeak", "Dynamisch: avondpiek", 0, 200, "Hoeveel duurder de avonduren (17–21 uur) zijn dan gemiddeld."),
  pct("general", "dynamic.nightDip", "Dynamisch: nachtdal", 0, 100, "Hoeveel goedkoper de nachturen zijn dan gemiddeld."),
  pct("general", "dynamic.solarDip", "Dynamisch: middagdal bij zon", 0, 300, "Hoe diep de prijs op zonnige middagen zakt (zomer kan negatief zijn)."),
  pct("general", "horizon.tariffChangePerYear", "Jaarlijkse prijsontwikkeling", -10, 10, "Reële prijsverandering per jaar voor de langetermijnberekening. 0 = prijzen gelijk houden."),
  // Zonnepanelen
  num("solar", "solar.newWp", "Vermogen nieuw paneel", "Wp", 100, 1000, "Gemiddeld wattpiek per nieuw zonnepaneel.", 5),
  num("solar", "solar.existingWp", "Vermogen bestaand paneel", "Wp", 100, 1000, "Gemiddeld wattpiek per bestaand paneel als de opbrengst onbekend is.", 5),
  num("solar", "solar.yieldPerKwp", "Jaaropbrengst per kWp", "kWh/kWp", 200, 1300, "Inclusief normale systeemverliezen (omvormer, kabels, vervuiling).", 5),
  pct("solar", "solar.extraLossShare", "Extra verliesfactor", 0, 50, "Laat op 0 staan: de opbrengst per kWp bevat de verliezen al. Alleen gebruiken als dat niet zo is."),
  num("solar", "solar.defaultNewPanels", "Standaard aantal nieuwe panelen", "panelen", 0, 60, "Aantal waarmee gerekend wordt als de consument geen aantal kiest.", 1),
  pct("solar", "solar.adviseKwhShare", "'Laat adviseren': dekking van verbruik", 10, 150, "Bij 'Laat adviseren' dekken alle panelen samen dit deel van het jaarverbruik."),
  { kind: "list", tab: "solar", key: "solar.monthlyShare", label: "Productie per maand (jan–dec)", unit: "aandeel", min: 0, max: 1, length: 12, sum: [0.98, 1.02], help: "Aandeel van de jaaropbrengst per maand; samen 1. Het verloop over de dag en het directe eigenverbruik volgen uit het uurmodel." },
  // Thuisbatterij
  pct("battery", "battery.efficiency", "Rendement laden en ontladen", 50, 100, "Round-trip rendement: deel van de opgeslagen stroom dat terugkomt."),
  num("battery", "battery.standbyW", "Stand-byverbruik", "W", 0, 200, "Continu eigen verbruik van omvormer en batterijbeheer.", 1),
  num("battery", "battery.chargePowerPerKwh", "Laadvermogen per kWh capaciteit", "kW/kWh", 0.1, 2, "Bijvoorbeeld 0,5: een 10 kWh-batterij laadt met 5 kW."),
  num("battery", "battery.dischargePowerPerKwh", "Ontlaadvermogen per kWh capaciteit", "kW/kWh", 0.1, 2, "Bijvoorbeeld 0,5: een 10 kWh-batterij levert 5 kW."),
  pct("battery", "battery.minSoc", "Minimale laadstatus", 0, 50, "Reserve die niet gebruikt wordt."),
  pct("battery", "battery.maxSoc", "Maximale laadstatus", 50, 100, "Tot hoe vol de batterij geladen wordt."),
  pct("battery", "battery.degradationByType.unknown", "Capaciteitsverlies per jaar (onbekend type)", 0, 10, "Voorzichtige aanname als het type batterij onbekend is."),
  pct("battery", "battery.degradationByType.lfp", "Capaciteitsverlies per jaar (LFP)", 0, 10, "Lithium-ijzerfosfaat."),
  pct("battery", "battery.degradationByType.nmc", "Capaciteitsverlies per jaar (NMC)", 0, 10, "Nikkel-mangaan-kobalt."),
  pct("battery", "battery.intensiveUseExtra", "Extra verlies bij intensief gebruik", 0, 5, "Extra capaciteitsverlies per jaar bij dagelijks laden uit het net."),
  num("battery", "battery.lifetimeYears", "Rekenhorizon batterij", "jaar", 1, 25, "Aantal jaren voor de langetermijnindicatie.", 1),
  { kind: "list", tab: "battery", key: "battery.adviseOptions", label: "Beschikbare capaciteiten", unit: "kWh", min: 1, max: 50, help: "Keuzes die de consument ziet (komma-gescheiden)." },
  num("battery", "battery.defaultCapacity", "Standaard capaciteit", "kWh", 1, 50, "Capaciteit als de consument niets kiest.", 0.5),
  num("battery", "battery.adviseLargeAboveKwh", "'Laat adviseren': grens hoog verbruik", "kWh/jaar", 0, 50000, "Boven dit jaarverbruik adviseren we de grotere batterij.", 100),
  num("battery", "battery.adviseLargeCapacity", "'Laat adviseren': grotere capaciteit", "kWh", 1, 50, "Capaciteit bij hoog verbruik.", 0.5),
  { kind: "boolean", tab: "battery", key: "battery.allowGridCharging", label: "Laden uit het net toestaan", unit: "", help: "Alleen bij slimme optimalisatie én een dynamisch contract. Laden vanuit zonnepanelen is altijd toegestaan." },
  // Warmtepomp
  num("heatpump", "heat.scopByFlow.unknown", "SCOP (aanvoertemperatuur onbekend)", "", 1, 7, "Seizoensrendement als de afgiftetemperatuur onbekend is.", 0.1),
  num("heatpump", "heat.scopByFlow.35", "SCOP bij 35 °C (vloerverwarming)", "", 1, 7, "Seizoensrendement bij lage temperatuur.", 0.1),
  num("heatpump", "heat.scopByFlow.45", "SCOP bij 45 °C", "", 1, 7, "", 0.1),
  num("heatpump", "heat.scopByFlow.55", "SCOP bij 55 °C", "", 1, 7, "", 0.1),
  num("heatpump", "heat.scopByFlow.65", "SCOP bij 65 °C", "", 1, 7, "", 0.1),
  pct("heatpump", "heat.boilerEfficiency", "Rendement bestaande cv-ketel", 50, 110, "Deel van de gasenergie dat als warmte in huis komt."),
  num("heatpump", "heat.kwhPerM3", "Energie-inhoud aardgas", "kWh/m³", 8, 10.5, "Calorische waarde per m³ gas.", 0.1),
  num("heatpump", "heat.hybridCoverage", "Hybride: aandeel ruimteverwarming", "%", 0, 100, "Deel van de ruimtewarmte dat een hybride warmtepomp levert; de rest blijft gas.", 1),
  num("heatpump", "heat.insulationScopFactor.good", "Correctie isolatie goed", "×", 0.5, 1.5, "Vermenigvuldiging van de SCOP.", 0.01),
  num("heatpump", "heat.insulationScopFactor.average", "Correctie isolatie gemiddeld", "×", 0.5, 1.5, "", 0.01),
  num("heatpump", "heat.insulationScopFactor.poor", "Correctie isolatie matig", "×", 0.5, 1.5, "", 0.01),
  num("heatpump", "heat.insulationScopFactor.unknown", "Correctie isolatie onbekend", "×", 0.5, 1.5, "", 0.01),
  num("heatpump", "heat.hotWaterCop", "Rendement warm tapwater", "", 1, 5, "Rendement van de warmtepomp voor warm water (volledig elektrisch).", 0.1),
  num("heatpump", "heat.hotWaterGas", "Gas voor warm water", "m³/jaar", 0, 2000, "Standaard deel van het gasverbruik voor tapwater.", 5),
  num("heatpump", "heat.cookingGas", "Gas voor koken", "m³/jaar", 0, 500, "Standaard deel van het gasverbruik voor koken.", 5),
  { kind: "list", tab: "heatpump", key: "heat.monthlyShare", label: "Warmtevraag per maand (jan–dec)", unit: "aandeel", min: 0, max: 1, length: 12, sum: [0.98, 1.02], help: "Aandeel van de jaarlijkse warmtevraag per maand; samen 1." },
  // Airco
  num("airco", "airco.coolingDemandPerRoom", "Koelvraag per ruimte", "kWh warmte/jaar", 0, 3000, "Gemiddelde hoeveelheid warmte die per ruimte per jaar wordt weggekoeld.", 10),
  num("airco", "airco.seer", "Standaard SEER (koelen)", "", 1, 10, "Seizoensrendement bij koelen. Stroom = koelvraag ÷ SEER.", 0.1),
  num("airco", "airco.scop", "Standaard SCOP (verwarmen)", "", 1, 7, "Seizoensrendement bij verwarmen.", 0.1),
  num("airco", "airco.heatShareGas", "Vervangen gasverwarming", "%", 0, 100, "Deel van de resterende gasverwarming dat de airco overneemt. Na een warmtepomp telt alleen het restgas.", 1),
  num("airco", "airco.defaultRooms", "Standaard aantal ruimtes", "ruimtes", 0, 20, "Als de consument niets invult.", 1),
  // Laadpaal
  num("ev", "ev.kwhPer100Km", "Verbruik elektrische auto", "kWh/100 km", 5, 40, "Gemiddeld verbruik van de auto zelf, zonder laadverlies.", 0.1),
  pct("ev", "ev.chargeLoss", "Laadverlies", 0, 40, "Extra stroom die verloren gaat bij het laden."),
  num("ev", "ev.km", "Gemiddeld aantal kilometers", "km/jaar", 0, 100000, "Als de consument niets invult.", 100),
  num("ev", "ev.homeShare", "Aandeel thuisladen", "%", 0, 100, "De rest is openbaar laden. Laadmomenten: 's avonds, of overdag bij slim laden op zonnestroom.", 1),
  // Rekenregels
  num("rules", "mainYear", "Standaard rekenjaar", "jaar", 2027, 2040, "Jaar waarvoor de hoofduitkomst wordt berekend.", 1),
  num("rules", "horizon.years", "Simulatiehorizon", "jaar", 1, 30, "Aantal jaren voor langetermijnindicaties.", 1),
  num("rules", "horizon.startYear", "Startjaar horizon", "jaar", 2027, 2040, "Eerste jaar van de langetermijnberekening.", 1),
  pct("rules", "sensitivity", "Onzekerheidsmarge", 5, 50, "Verschil tussen het verwachte en het voorzichtige/gunstige scenario."),
];

export const SETTING_BY_KEY = Object.fromEntries(SETTINGS.map((s) => [s.key, s])) as Record<
  string,
  SettingDef
>;

export type SettingValue = number | number[] | boolean | string;
export type Overrides = Record<string, SettingValue>;

export function readPath(cfg: unknown, key: string): SettingValue {
  return key.split(".").reduce<any>((o, k) => (o == null ? o : o[k]), cfg) as SettingValue; // eslint-disable-line @typescript-eslint/no-explicit-any
}
function writePath(cfg: unknown, key: string, value: SettingValue) {
  const parts = key.split(".");
  const last = parts.pop()!;
  const target = parts.reduce<any>((o, k) => o[k], cfg); // eslint-disable-line @typescript-eslint/no-explicit-any
  target[last] = Array.isArray(value) ? [...value] : value;
}

export const defaultValue = (key: string) => readPath(DEFAULT_ENERGY_CONFIG, key);

/** Validate one value against its definition; returns an error text or null. */
export function validateSetting(key: string, value: unknown): string | null {
  const d = SETTING_BY_KEY[key];
  if (!d) return "Onbekende instelling";
  if (d.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return "Geen geldig getal";
    if (value < d.min || value > d.max) {
      const s = d.scale ?? 1;
      return `Moet tussen ${d.min} en ${d.max} ${d.unit} liggen`.replace(
        /(-?[\d.]+) en (-?[\d.]+)/,
        `${d.min * (s === 100 ? 1 : 1)} en ${d.max}`,
      );
    }
    return null;
  }
  if (d.kind === "boolean") return typeof value === "boolean" ? null : "Kies aan of uit";
  if (d.kind === "select") return typeof value === "string" && value in d.options ? null : "Ongeldige keuze";
  if (!Array.isArray(value) || value.length === 0) return "Vul minstens één waarde in";
  if (value.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < d.min || v > d.max))
    return `Elke waarde moet tussen ${d.min} en ${d.max} liggen`;
  if (d.length && value.length !== d.length) return `Precies ${d.length} waarden nodig`;
  if (d.sum) {
    const s = value.reduce((a, b) => a + b, 0);
    if (s < d.sum[0] || s > d.sum[1]) return "De waarden moeten samen 1 zijn";
  }
  return null;
}

/** Number settings with percent scale are stored as shares; ranges in SETTINGS are display units. */
export function storedRange(d: SettingDef & { kind: "number" }) {
  const s = d.scale ?? 1;
  return { min: d.min / s, max: d.max / s };
}

export const tariffSetSchema = z.object({
  id: z.string().min(1).max(60),
  supplier: z.string().trim().min(1).max(80),
  product: z.string().trim().min(1).max(120),
  contractType: z.enum(["vast", "variabel", "dynamisch"]),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  version: z.number().int().min(1).max(10000),
  source: z.string().trim().min(1).max(300),
  checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  electricityPrice: z.number().finite().min(0).max(2),
  electricityPriceLow: z.number().finite().min(0).max(2).optional(),
  exportPrice: z.number().finite().min(-1).max(2),
  exportCostModel: z.enum(["none", "perKwh", "tiers", "fixed", "timeOfUse"]),
  exportCost: z.number().finite().min(0).max(1).optional(),
});

/** Validates a whole override set. Values are in stored units. */
export function validateOverrides(values: Record<string, unknown>) {
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const d = SETTING_BY_KEY[key];
    if (!d) {
      errors[key] = "Onbekende instelling";
      continue;
    }
    const err =
      d.kind === "number"
        ? validateSetting(key, typeof value === "number" ? value * (d.scale ?? 1) : value)
        : validateSetting(key, value);
    if (err) errors[key] = err;
  }
  const minSoc = (values["battery.minSoc"] as number) ?? ENERGY_CONFIG.battery.minSoc;
  const maxSoc = (values["battery.maxSoc"] as number) ?? ENERGY_CONFIG.battery.maxSoc;
  if (!errors["battery.minSoc"] && minSoc >= maxSoc)
    errors["battery.minSoc"] = "Moet lager zijn dan de maximale laadstatus";
  return errors;
}

function reset(target: EnergyConfig) {
  const fresh = structuredClone(DEFAULT_ENERGY_CONFIG);
  for (const k of Object.keys(fresh) as (keyof EnergyConfig)[])
    (target as Record<string, unknown>)[k] = fresh[k];
}

/**
 * Activates a published override set (invalid or unknown entries are ignored, so a
 * corrupt row can never break the calculator: the code default is the fallback).
 */
export function applyOverrides(
  values: Record<string, unknown> | null | undefined,
  meta?: { version?: number | null; tariffSets?: unknown },
) {
  reset(ENERGY_CONFIG);
  for (const [key, value] of Object.entries(values ?? {})) {
    if (Object.keys(validateOverrides({ [key]: value })).length === 0)
      writePath(ENERGY_CONFIG, key, value as SettingValue);
  }
  if (ENERGY_CONFIG.battery.minSoc >= ENERGY_CONFIG.battery.maxSoc) {
    ENERGY_CONFIG.battery.minSoc = DEFAULT_ENERGY_CONFIG.battery.minSoc;
    ENERGY_CONFIG.battery.maxSoc = DEFAULT_ENERGY_CONFIG.battery.maxSoc;
  }
  TARIFF_SETS.splice(0);
  if (Array.isArray(meta?.tariffSets))
    for (const t of meta.tariffSets) {
      const r = tariffSetSchema.safeParse(t);
      if (r.success) TARIFF_SETS.push(r.data as TariffSet);
    }
  configState.publishedVersion = meta?.version ?? null;
  configState.stamp++;
}

/** Runs a synchronous calculation with a temporary override set, then restores. */
export function withOverrides<T>(values: Record<string, unknown>, fn: () => T): T {
  const saved = structuredClone(ENERGY_CONFIG);
  const savedVersion = configState.publishedVersion;
  const savedTariffs = [...TARIFF_SETS];
  applyOverrides(values, { version: savedVersion, tariffSets: savedTariffs });
  try {
    return fn();
  } finally {
    reset(ENERGY_CONFIG);
    Object.assign(ENERGY_CONFIG, saved);
    configState.publishedVersion = savedVersion;
    configState.stamp++;
  }
}

/** Current live value of every registered setting (stored units). */
export function currentValues(): Overrides {
  return Object.fromEntries(SETTINGS.map((s) => [s.key, readPath(ENERGY_CONFIG, s.key)]));
}
