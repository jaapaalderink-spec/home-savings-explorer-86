import { beforeEach, describe, expect, it } from "vitest";
import { calculateScenario } from "./scenario";
import {
  SESSION_STORAGE_KEY,
  createSession,
  removeMeasure,
  resetMeasure,
  sessionStore,
  toggleMeasure,
  validateSession,
  type CalculatorSession,
} from "./session";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let mem: MemoryStorage;
beforeEach(() => {
  mem = new MemoryStorage();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: mem,
    addEventListener() {},
    removeEventListener() {},
  };
  sessionStore._clearMemory();
});

/** voorbeeld uit de opdracht: 4.300 kWh, 8 bestaande panelen, batterij 10 kWh, laadpaal */
function example(): CalculatorSession {
  const s = createSession("t");
  s.profile = { ...s.profile, consumption: 4300, existingPanels: 8, newPanels: 0, newBattery: 10 };
  s.owned = { ...s.owned, solar: true };
  s.selected = ["battery", "ev", "solar", "heatpump", "airco"];
  return s;
}
/** simuleert een paginawissel/vernieuwing: geheugen weg, alleen opslag blijft */
const reload = () => (sessionStore._clearMemory(), sessionStore.get());

describe("calculatorsessie", () => {
  it("1-4, 12, 13: invoer blijft bewaard bij navigatie en vernieuwen", () => {
    sessionStore.set(example());
    for (let i = 0; i < 5; i++) {
      const s = reload();
      expect(s.profile.consumption).toBe(4300);
      expect(s.profile.newBattery).toBe(10);
      expect(s.selected).toHaveLength(5);
    }
  });

  it("5-7, 18: aanpassen van één veld herberekent het totaal, geen oude resultaten", () => {
    sessionStore.set(example());
    const before = calculateScenario(reload().profile, reload().selected).savings;
    sessionStore.set((s) => ({ ...s, profile: { ...s.profile, newBattery: 5, consumption: 6000 } }));
    const s = reload();
    expect(s.profile.newBattery).toBe(5);
    expect(s.profile.existingPanels).toBe(8);
    expect(calculateScenario(s.profile, s.selected).savings).not.toBe(before);
    expect(JSON.parse(mem.getItem(SESSION_STORAGE_KEY)!)).not.toHaveProperty("results");
  });

  it("8-9: verwijderen raakt alleen die maatregel", () => {
    const s = removeMeasure(example(), "battery");
    expect(s.selected.sort()).toEqual(["airco", "ev", "heatpump", "solar"]);
    expect(s.profile.consumption).toBe(4300);
  });

  it("10: opnieuw instellen zet alleen batterij-instellingen terug", () => {
    const s = resetMeasure(example(), "battery");
    expect(s.profile.newBattery).toBe(5);
    expect(s.profile.consumption).toBe(4300);
    expect(s.profile.existingPanels).toBe(8);
    expect(s.selected).toContain("ev");
  });

  it("11: bestaande zonnepanelen blijven bij verwijderen of resetten van nieuwe panelen", () => {
    const removed = removeMeasure(example(), "solar");
    expect(removed.profile.existingPanels).toBe(8);
    expect(removed.owned["solar"]).toBe(true);
    const reset = resetMeasure(example(), "solar");
    expect(reset.profile.existingPanels).toBe(8);
    expect(reset.profile.newPanels).toBe(0);
  });

  it("14: nieuwe maatregel toevoegen aan bestaand pakket", () => {
    const s = toggleMeasure(removeMeasure(example(), "airco"), "airco");
    expect(s.selected).toHaveLength(5);
  });

  it("15-17: volledige reset wist alleen de lokale sessie", () => {
    mem.setItem("other-key", "offerte-historie");
    sessionStore.set(example());
    sessionStore.reset();
    expect(mem.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(mem.getItem("other-key")).toBe("offerte-historie");
    expect(reload().selected).toEqual([]);
  });

  it("16: zonder reset (annuleren) blijft alles staan", () => {
    sessionStore.set(example());
    expect(reload().selected).toHaveLength(5);
  });

  it("valideert opgeslagen gegevens en versie", () => {
    expect(validateSession({ version: 99 })).toBeNull();
    expect(validateSession("onzin")).toBeNull();
    const bad = { ...example(), selected: ["battery", "hack"] };
    expect(validateSession(JSON.parse(JSON.stringify(bad)))!.selected).toEqual(["battery"]);
    mem.setItem(SESSION_STORAGE_KEY, "{kapot");
    expect(reload().selected).toEqual([]);
  });
});
