import { describe, expect, it } from "vitest";
import {
  calculateScenario,
  DEFAULT_PROFILE,
  energyProfileSchema,
  parseProfile,
  profileFromSearch,
  MEASURES,
} from "./scenario";
import { buildOfferteHref } from "../../components/home-savings/offerte-params";

describe("household energy scenarios", () => {
  it("preserves existing equipment, additions and signed totals through the quotation URL", () => {
    const p = {
      ...DEFAULT_PROFILE,
      existingPanels: 12,
      existingWp: 400,
      newPanels: 4,
      electricityPrice: 2,
    };
    const scenario = calculateScenario(p, ["solar", "heatpump"]);
    const href = buildOfferteHref(
      { profile: p, contract: { type: "vast" }, owned: { solar: true } },
      scenario.results,
    );
    const search = new URL(href, "http://localhost").searchParams;
    expect(profileFromSearch(search)).toEqual(p);
    expect(search.get("cats")?.split(",")).toContain("solar");
    expect(Number(search.get("total"))).toBe(Math.round(scenario.savings));
  });
  it("imports legacy links without turning existing panels into new panels", () => {
    const p = profileFromSearch(new URLSearchParams("owned=solar&panels=12&consumption=0"));
    expect(p.existingPanels).toBe(12);
    expect(p.newPanels).toBe(0);
    expect(p.consumption).toBe(0);
  });
  it("counts existing installations in the baseline, never as new savings", () => {
    const p = {
      ...DEFAULT_PROFILE,
      existingPanels: 12,
      existingBattery: 5,
      newPanels: 0,
      newBattery: 0,
      heating: "heatpump" as const,
      gas: 0,
      hotWaterGas: 0,
      cookingGas: 0,
      hasCharger: true,
      hasEv: true,
      hasAirco: true,
    };
    expect(calculateScenario(p, MEASURES).savings).toBeCloseTo(0);
  });
  it("uses actual panel wattage and measured production including measured zero", () => {
    const p = { ...DEFAULT_PROFILE, existingPanels: 10 };
    expect(calculateScenario({ ...p, existingWp: 400 }, []).before.production).toBe(3400);
    expect(calculateScenario({ ...p, existingYield: 0 }, []).before.production).toBe(0);
    expect(calculateScenario({ ...p, existingYield: 2100 }, []).before.production).toBe(2100);
  });
  it("limits a battery to available surplus and demand", () => {
    expect(calculateScenario(DEFAULT_PROFILE, ["battery"]).savings).toBeCloseTo(0);
    const r = calculateScenario({ ...DEFAULT_PROFILE, existingPanels: 12 }, ["battery"]);
    expect(r.savings).toBeGreaterThan(0);
    expect(r.after.charged).toBeLessThanOrEqual(r.before.exports);
    expect(r.after.discharged).toBeLessThanOrEqual(r.before.imports);
    expect(r.after.discharged).toBeCloseTo(r.after.charged * DEFAULT_PROFILE.batteryEfficiency);
  });
  it("preserves energy balance for all measure combinations", () => {
    for (let mask = 0; mask < 32; mask++) {
      const r = calculateScenario(
        { ...DEFAULT_PROFILE, existingPanels: 8, hasEv: true },
        MEASURES.filter((_, i) => mask & (1 << i)),
      );
      for (const s of [r.before, r.after]) {
        expect(s.production).toBeCloseTo(s.direct + s.charged + s.exports);
        expect(s.demand).toBeCloseTo(s.direct + s.discharged + s.imports);
        expect(s.imports).toBeGreaterThanOrEqual(0);
        expect(s.exports).toBeGreaterThanOrEqual(0);
      }
      expect(Object.values(r.results).reduce((sum, v) => sum + v.practicalSavings, 0)).toBeCloseTo(
        r.savings,
      );
    }
  });
  it("makes attribution independent of selection order", () => {
    expect(calculateScenario(DEFAULT_PROFILE, ["solar", "heatpump", "battery"])).toEqual(
      calculateScenario(DEFAULT_PROFILE, ["battery", "heatpump", "solar"]),
    );
  });
  it("uses lower SCOP at higher flow temperature", () => {
    expect(
      calculateScenario({ ...DEFAULT_PROFILE, flowTemperature: "35" }, ["heatpump"]).savings,
    ).toBeGreaterThan(
      calculateScenario({ ...DEFAULT_PROFILE, flowTemperature: "65" }, ["heatpump"]).savings,
    );
  });
  it("preserves cooking gas and hybrid hot water gas", () => {
    const hybrid = calculateScenario(DEFAULT_PROFILE, ["heatpump"]);
    expect(hybrid.after.gas).toBeCloseTo(250 + 30 + (1500 - 250 - 30) * 0.4);
    const electric = calculateScenario({ ...DEFAULT_PROFILE, target: "electric" }, ["heatpump"]);
    expect(electric.after.gas).toBeCloseTo(30);
  });
  it("does not let airco replace heating already supplied by an all-electric heat pump", () => {
    const p = { ...DEFAULT_PROFILE, target: "electric" as const, coolingKwh: 0 };
    expect(calculateScenario(p, ["heatpump", "airco"]).savings).toBeCloseTo(
      calculateScenario(p, ["heatpump"]).savings,
    );
  });
  it("retains negative savings and explicit zero demand", () => {
    expect(
      calculateScenario({ ...DEFAULT_PROFILE, electricityPrice: 2 }, ["heatpump"]).savings,
    ).toBeLessThan(0);
    expect(
      calculateScenario({ ...DEFAULT_PROFILE, gas: 0, consumption: 0 }, ["heatpump"]).savings,
    ).toBe(0);
  });
  it("does not turn a district heating system into imaginary gas savings", () => {
    expect(
      calculateScenario({ ...DEFAULT_PROFILE, heating: "district" }, ["heatpump"]).savings,
    ).toBe(0);
  });
  it("compares charging the same EV rather than a petrol car", () => {
    expect(calculateScenario(DEFAULT_PROFILE, ["ev"]).savings).toBe(0);
    const p = { ...DEFAULT_PROFILE, hasEv: true };
    expect(calculateScenario(p, ["ev"]).savings).toBeCloseTo(12000 * 0.2 * 0.7 * (0.5 - 0.29));
    expect(calculateScenario({ ...p, hasCharger: true }, ["ev"]).savings).toBe(0);
  });
  it("does not add existing electric heating twice", () => {
    const r = calculateScenario(
      { ...DEFAULT_PROFILE, consumption: 6000, heating: "heatpump", heatingElectricity: 3000 },
      [],
    );
    expect(r.before.demand).toBeCloseTo(6000);
  });
  it("makes saldering affect solar and battery economics", () => {
    const p = { ...DEFAULT_PROFILE, existingPanels: 8, netMetering: true };
    expect(calculateScenario(p, ["battery"]).savings).toBeLessThanOrEqual(0);
  });
  it("rejects invalid numeric profiles and safely handles broken URLs", () => {
    expect(energyProfileSchema.safeParse({ gas: -1 }).success).toBe(false);
    expect(energyProfileSchema.safeParse({ scop: 0 }).success).toBe(false);
    expect(parseProfile("broken")).toEqual(DEFAULT_PROFILE);
    expect(parseProfile(JSON.stringify({ ...DEFAULT_PROFILE, existingPanels: 12 }))).toEqual({
      ...DEFAULT_PROFILE,
      existingPanels: 12,
    });
  });
});
