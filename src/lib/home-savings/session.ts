/**
 * Centrale, persistente calculatorsessie: één bron van waarheid voor het
 * woningprofiel, bestaande installaties en de gekozen nieuwe maatregelen.
 * Alleen invoer wordt bewaard — resultaten worden altijd opnieuw berekend.
 * Bevat geen persoonsgegevens uit de offerteaanvraag.
 */
import { useSyncExternalStore } from "react";
import { z } from "zod";
import {
  DEFAULT_PROFILE,
  MEASURES,
  energyProfileSchema,
  type EnergyProfile,
} from "./scenario";

export const SESSION_STORAGE_KEY = "oo-energy-calculator";
export const SESSION_VERSION = 1;

export type ContractChoice = EnergyProfile["contractType"];

export interface CalculatorSession {
  version: typeof SESSION_VERSION;
  sessionId: string;
  profile: EnergyProfile;
  contract: { type: ContractChoice };
  owned: Record<string, boolean>;
  /** nieuw gekozen maatregelen (los van wat al in de woning aanwezig is) */
  selected: string[];
}

const storedSchema = z.object({
  version: z.literal(SESSION_VERSION),
  sessionId: z.string().min(1).max(64),
  profile: z.unknown(),
  contract: z.object({ type: z.enum(["vast", "variabel", "dynamisch", "onbekend"]) }),
  owned: z.record(z.string(), z.boolean()),
  selected: z.array(z.string()),
});

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

export function ownedFromProfile(p: EnergyProfile): Record<string, boolean> {
  return {
    solar: p.existingPanels > 0,
    battery: p.existingBattery > 0,
    heatpump: ["hybrid", "heatpump"].includes(p.heating),
    ev: p.hasCharger,
    airco: p.hasAirco,
  };
}

export function createSession(id = "initial"): CalculatorSession {
  const profile = { ...DEFAULT_PROFILE };
  return {
    version: SESSION_VERSION,
    sessionId: id,
    profile,
    contract: { type: profile.contractType },
    owned: ownedFromProfile(profile),
    selected: [],
  };
}

/** Valideer opgeslagen gegevens; ongeldig of oude versie → null. */
export function validateSession(raw: unknown): CalculatorSession | null {
  const parsed = storedSchema.safeParse(raw);
  if (!parsed.success) return null;
  const profile = energyProfileSchema.safeParse(parsed.data.profile);
  if (!profile.success) return null;
  const allowed = new Set<string>(MEASURES);
  return {
    version: SESSION_VERSION,
    sessionId: parsed.data.sessionId,
    profile: profile.data,
    contract: parsed.data.contract,
    owned: { ...ownedFromProfile(profile.data), ...parsed.data.owned },
    selected: [...new Set(parsed.data.selected.filter((s) => allowed.has(s)))],
  };
}

/* ---------------- pure bewerkingen ---------------- */

export function toggleMeasure(s: CalculatorSession, id: string): CalculatorSession {
  if (!(MEASURES as readonly string[]).includes(id)) return s;
  return s.selected.includes(id) ? removeMeasure(s, id) : { ...s, selected: [...s.selected, id] };
}

/** Haal alleen deze nieuwe maatregel uit het pakket; profiel en bestaande installaties blijven. */
export function removeMeasure(s: CalculatorSession, id: string): CalculatorSession {
  return { ...s, selected: s.selected.filter((x) => x !== id) };
}

/** Maatregelspecifieke velden: alleen deze worden bij "Opnieuw instellen" teruggezet. */
export const MEASURE_FIELDS: Record<string, (keyof EnergyProfile)[]> = {
  solar: ["newPanels", "newWp", "yieldPerKwp", "adviseSolar"],
  battery: [
    "newBattery",
    "adviseBattery",
    "batteryEfficiency",
    "batteryStrategy",
    "gridCharging",
    "batteryStandbyW",
    "batteryType",
    "batteryDegradationPct",
  ],
  heatpump: [
    "target",
    "adviseHeatpump",
    "replaceHeatpump",
    "scop",
    "hybridCoverage",
    "hotWaterCop",
    "canDisconnectGas",
  ],
  ev: ["smartCharging", "homeChargeShare", "evKwhPer100Km", "publicChargePrice"],
  airco: ["aircoMode", "aircoHeatingShare", "aircoScop", "coolingKwh"],
};

export function resetMeasure(s: CalculatorSession, id: string): CalculatorSession {
  const fields = MEASURE_FIELDS[id];
  if (!fields) return s;
  const profile = { ...s.profile } as Record<string, unknown>;
  for (const f of fields) profile[f] = (DEFAULT_PROFILE as Record<string, unknown>)[f];
  // bestaande zonnepanelen: geen extra panelen als standaard
  if (id === "solar" && s.profile.existingPanels > 0) profile.newPanels = 0;
  const provided = s.profile.provided.filter((k) => !(fields as string[]).includes(k));
  return { ...s, profile: { ...(profile as EnergyProfile), provided } };
}

/* ---------------- opslag + gedeelde store ---------------- */

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadSession(): CalculatorSession | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(SESSION_STORAGE_KEY);
    return raw ? validateSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const SERVER_SNAPSHOT = createSession();
let current: CalculatorSession | null = null;
let hasStored = false;
const listeners = new Set<() => void>();

function ensure(): CalculatorSession {
  if (!current) {
    const loaded = loadSession();
    hasStored = !!loaded;
    current = loaded ?? createSession(newId());
  }
  return current;
}

function emit() {
  listeners.forEach((l) => l());
}

export const sessionStore = {
  get: ensure,
  /** true als er al een opgeslagen sessie was of de gebruiker iets heeft gewijzigd */
  hasStored: () => (ensure(), hasStored),
  set(update: CalculatorSession | ((s: CalculatorSession) => CalculatorSession)) {
    const next = typeof update === "function" ? update(ensure()) : update;
    current = next;
    hasStored = true;
    try {
      storage()?.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* opslag vol of geblokkeerd: sessie blijft in geheugen */
    }
    emit();
  },
  /** volledige reset: alleen de lokale calculatorsessie, nooit verstuurde aanvragen */
  reset() {
    try {
      storage()?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* negeren */
    }
    current = createSession(newId());
    hasStored = false;
    emit();
  },
  subscribe(l: () => void) {
    listeners.add(l);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SESSION_STORAGE_KEY) {
        current = null;
        l();
      }
    };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
    };
  },
  /** alleen voor tests */
  _clearMemory() {
    current = null;
    hasStored = false;
  },
};

export function useCalculatorSession(): CalculatorSession {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.get, () => SERVER_SNAPSHOT);
}
