import { describe, expect, it } from "vitest";
import {
  batteryLifetime,
  batteryReport,
  calculateScenario,
  debugScenario,
  energyProfileSchema,
  simulate,
  DEFAULT_PROFILE as D,
  type EnergyProfile,
} from "./scenario";
import { ENERGY_CONFIG as C } from "./config";

const P = (p: Partial<EnergyProfile>): EnergyProfile => ({ ...D, ...p });
// Test home from the brief: 4,300 kWh use, 3,060 kWh existing solar.
const HOME = P({ consumption: 4300, existingPanels: 8, existingYield: 3060, newPanels: 8 });

describe("thuisbatterijadvies: 2027, contract, levensduur", () => {
  it("2027 is het standaard rekenjaar zonder saldering", () => {
    const p = energyProfileSchema.parse({});
    expect(p.year).toBe(2027);
    const r = calculateScenario(P({ ...HOME, netMetering: true }), ["battery"]);
    expect(r.profile.year).toBe(2027);
    expect(r.after.netted).toBe(0); // saldering cannot apply in 2027
  });

  it("2027 zonder saldering: kosten = inkoop − vergoeding (onafhankelijke referentie)", () => {
    const q = P({ ...HOME, contractType: "vast", year: 2031 }); // no legal floor
    const s = debugScenario(q, []).after;
    expect(s.cost).toBeCloseTo(s.imports * 0.29 - s.exports * 0.05 + q.gas * q.gasPrice, 6);
  });

  it("terugleverkosten maken opslag waardevoller; dynamisch wijkt af van vast", () => {
    const base = batteryReport(P({ ...HOME, contractType: "vast" }), ["battery"]).y2027;
    const cost = batteryReport(P({ ...HOME, contractType: "vast", exportCost: 0.1 }), [
      "battery",
    ]).y2027;
    expect(cost.exportCostSaving).toBeCloseTo(base.exportReductionKwh * 0.1, 0);
    expect(cost.net).toBeGreaterThan(base.net);
    const dyn = batteryReport(P({ ...HOME, contractType: "dynamisch" }), ["battery"]).y2027;
    expect(Math.abs(dyn.net - base.net)).toBeGreaterThan(1);
  });

  it("opslag vanuit bestaande panelen: alleen echt overschot, energiebalans klopt", () => {
    const r = batteryReport(HOME, ["battery"]).y2027;
    const without = simulate({ ...HOME, year: 2027 }, new Set());
    expect(r.extraSelfKwh).toBeGreaterThan(0);
    expect(r.extraSelfKwh).toBeLessThanOrEqual(without.exports);
    expect(r.exportReductionKwh).toBeCloseTo(r.extraSelfKwh / C.battery.efficiency, 0);
    expect(r.importReductionKwh).toBeCloseTo(r.extraSelfKwh, 0);
  });

  it("extra panelen geven de batterij meer overschot en meer besparing", () => {
    const existing = batteryReport(HOME, ["battery"]).y2027;
    const plus = batteryReport(HOME, ["solar", "battery"]).y2027;
    expect(plus.extraSelfKwh).toBeGreaterThan(existing.extraSelfKwh);
    expect(plus.net).toBeGreaterThan(existing.net);
  });

  it("marginale besparing = zelfde woning met minus zonder batterij", () => {
    const sel = ["solar", "ev", "battery"];
    const q = P({ ...HOME, hasEv: true, year: 2027 });
    const ref =
      simulate(q, new Set(["solar", "ev"])).cost -
      simulate(q, new Set(["solar", "ev", "battery"])).cost;
    expect(batteryReport(q, sel).y2027.net).toBeCloseTo(ref, 6);
  });

  it("5 en 10 kWh verschillen, 10 kWh nooit minder opslag", () => {
    const five = batteryReport(P({ ...HOME, newBattery: 5 }), ["solar", "battery"]).y2027;
    const ten = batteryReport(P({ ...HOME, newBattery: 10 }), ["solar", "battery"]).y2027;
    expect(ten.extraSelfKwh).toBeGreaterThan(five.extraSelfKwh);
    expect(ten.net).toBeGreaterThan(five.net);
  });

  it("degradatie over 15 jaar: dalende capaciteit en dalende besparing", () => {
    const l = batteryLifetime(HOME, ["battery"]);
    expect(l.horizonYears).toBe(15);
    expect(l.years).toHaveLength(15);
    expect(l.degradationPerYear).toBe(C.battery.degradationByType.unknown);
    expect(l.finalHealth).toBeCloseTo((1 - l.degradationPerYear) ** 14, 9);
    expect(l.years[14]!.saving).toBeLessThan(l.years[0]!.saving);
    const maker = batteryLifetime(P({ ...HOME, batteryDegradationPct: 1 }), ["battery"]);
    expect(maker.degradationSource).toBe("fabrikant");
    expect(maker.cumulative).toBeGreaterThan(l.cumulative);
  });

  it("cumulatieve besparing = som van jaarlijkse energiebesparing, zonder investering", () => {
    const l = batteryLifetime(HOME, ["battery"]);
    const sum = l.years.reduce((s, y) => s + y.saving, 0);
    expect(l.cumulative).toBeCloseTo(sum, 9);
    expect(l.average).toBeCloseTo(sum / 15, 9);
    expect(l.cumulative).toBeLessThan(l.firstYear * 15);
    expect("payback" in calculateScenario(HOME, ["battery"])).toBe(false);
  });

  it("testwoning: 2026 met saldering licht negatief, 2027 positief, eerlijke uitleg", () => {
    const r = batteryReport(P({ ...HOME, contractType: "vast" }), ["solar", "battery"]);
    expect(r.y2026.net).toBeLessThan(0); // only storage losses remain under saldering
    expect(r.y2026.net).toBeGreaterThan(-30);
    expect(r.y2027.net).toBeGreaterThan(100);
    expect(r.conclusion).toContain("wekt zelf geen stroom op");
    const none = batteryReport(P({ consumption: 4300 }), ["battery"]);
    expect(none.conclusion).toContain("weinig of niets");
    expect(none.conclusion).toContain("verbeteren");
  });
});
