import { describe, expect, it } from "vitest";
import { ENERGY_CONFIG } from "./config";
const EV_KWH = ENERGY_CONFIG.ev.kwhPer100Km * (1 + ENERGY_CONFIG.ev.chargeLoss);
import { calculateScenario, DEFAULT_PROFILE as D, MEASURES, energyProfileSchema } from "./scenario";

const run = (p: Partial<typeof D>, ids: readonly string[]) =>
  calculateScenario({ ...D, ...p }, ids);
const sumStandalone = (r: ReturnType<typeof run>) =>
  Object.values(r.standalone).reduce((a, b) => a + (b ?? 0), 0);

describe("acceptance scenarios (opdracht §11)", () => {
  it("1 woning zonder installaties: geen maatregel, geen besparing", () => {
    const r = run({}, []);
    expect(r.savings).toBe(0);
    expect(r.before.production).toBe(0);
  });
  it("2 bestaande zonnepanelen zitten in de uitgangssituatie", () => {
    const r = run({ existingPanels: 10, newPanels: 0 }, ["solar"]);
    expect(r.before.production).toBeGreaterThan(0);
    expect(r.savings).toBeCloseTo(0);
  });
  it("3 nieuwe zonnepanelen leveren besparing op", () => {
    expect(run({}, ["solar"]).savings).toBeGreaterThan(0);
  });
  it("4 extra panelen leveren minder op dan dezelfde panelen op een leeg dak", () => {
    expect(run({ existingPanels: 12 }, ["solar"]).savings).toBeLessThan(run({}, ["solar"]).savings);
  });
  it("5 batterij zonder zonnepanelen bespaart niets", () => {
    expect(run({}, ["battery"]).savings).toBeCloseTo(0);
  });
  it("6 batterij met bestaande panelen gebruikt alleen overschot", () => {
    const r = run({ existingPanels: 12 }, ["battery"]);
    expect(r.savings).toBeGreaterThan(0);
    expect(r.after.charged).toBeLessThanOrEqual(r.before.exports + 1e-6);
  });
  it("7 laadpaal met bestaande EV vergelijkt dezelfde kilometers", () => {
    const r = run({ hasEv: true }, ["ev"]);
    expect(r.savings).toBeCloseTo(((12000 * EV_KWH) / 100) * 0.7 * (0.5 - 0.29));
  });
  it("8 laadpaal met zonnepanelen en slim laden laadt deels met zonnestroom", () => {
    const evening = run({ hasEv: true, existingPanels: 12 }, ["ev"]);
    const smart = run({ hasEv: true, existingPanels: 12, smartCharging: true }, ["ev"]);
    expect(smart.after.evSolarKwh).toBeGreaterThan(evening.after.evSolarKwh);
    expect(smart.savings).toBeGreaterThan(evening.savings);
  });
  it("9 airco alleen koelen is een kostenpost en vervangt geen gas", () => {
    const r = run({ aircoMode: "cool" }, ["airco"]);
    expect(r.after.gas).toBe(r.before.gas);
    expect(r.savings).toBeLessThan(0);
    expect(r.comfortCost).toBeCloseTo(-r.savings);
  });
  it("10 airco voor verwarming vervangt resterend gas", () => {
    const r = run({ aircoMode: "both", coolingKwh: 0 }, ["airco"]);
    expect(r.after.gas).toBeLessThan(r.before.gas);
    expect(r.savings).toBeGreaterThan(0);
  });
  it("11 hybride warmtepomp houdt gas voor tapwater en koken", () => {
    const r = run({}, ["heatpump"]);
    expect(r.after.gas).toBeGreaterThan(D.hotWaterGas + D.cookingGas - 1e-6);
    expect(r.after.heatpumpKwh).toBeGreaterThan(0);
  });
  it("12 volledig elektrische warmtepomp houdt alleen kookgas", () => {
    expect(run({ target: "electric" }, ["heatpump"]).after.gas).toBeCloseTo(D.cookingGas);
  });
  it("13/24 airco + warmtepomp vervangen nooit meer gas dan er is", () => {
    const p = { coolingKwh: 0, aircoHeatingShare: 100 };
    const both = run(p, ["heatpump", "airco"]);
    const replaced = both.before.gas - both.after.gas;
    expect(replaced).toBeLessThanOrEqual(
      D.gas - D.hotWaterGas - D.cookingGas + D.hotWaterGas + 1e-6,
    );
    expect(both.after.gas).toBeGreaterThanOrEqual(D.cookingGas - 1e-6);
  });
  it("14 zon + batterij + laadpaal: één simulatie, bijdragen tellen op", () => {
    const r = run({ hasEv: true }, ["solar", "battery", "ev"]);
    const total = Object.values(r.contributions).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeCloseTo(r.savings);
    expect(r.synergy).toBeCloseTo(r.savings - sumStandalone(r));
  });
  it("15 alle vijf maatregelen tegelijk zijn consistent", () => {
    const r = run({ hasEv: true }, MEASURES);
    expect(r.after.balanceError).toBeLessThan(1e-9);
    expect(Object.keys(r.standalone)).toHaveLength(5);
  });
  it("16 nul gasverbruik: warmtepomp bespaart geen gas", () => {
    const r = run({ gas: 0, hotWaterGas: 0, cookingGas: 0 }, ["heatpump"]);
    expect(r.savings).toBeCloseTo(0);
  });
  it("17 nul stroomverbruik geeft geen negatieve netafname", () => {
    const r = run({ consumption: 0 }, ["solar", "battery"]);
    expect(r.after.imports).toBeGreaterThanOrEqual(0);
    expect(r.after.direct).toBeCloseTo(0);
  });
  it("18 zonder eigenverbruik wordt alles teruggeleverd", () => {
    const r = run({ consumption: 0 }, ["solar"]);
    expect(r.after.exports).toBeCloseTo(r.after.production);
  });
  it("19 saldering 2026 versus geen saldering 2027", () => {
    const p = { existingPanels: 0, netMetering: true };
    const y26 = run({ ...p, year: 2026 }, ["solar"]).savings;
    const y27 = run({ ...p, year: 2027 }, ["solar"]).savings;
    expect(y26).toBeGreaterThan(y27);
  });
  it("20 ongunstige batterij: nul of negatieve besparing blijft zichtbaar", () => {
    const r = run({ existingPanels: 8, netMetering: true, year: 2026 }, ["battery"]);
    expect(r.savings).toBeLessThanOrEqual(0);
    expect(r.advice.join(" ")).toMatch(/weinig/);
  });
  it("21 volgorde van selecteren maakt niet uit", () => {
    expect(run({ hasEv: true }, ["ev", "airco", "solar"])).toEqual(
      run({ hasEv: true }, ["solar", "ev", "airco"]),
    );
  });
  it("22 thuisladen dat al in het verbruik zit wordt niet dubbel geteld", () => {
    const r = run({ hasEv: true, hasCharger: true, consumption: 5180 }, []);
    expect(r.before.demand).toBeCloseTo(5180);
    expect(run({ hasEv: true, hasCharger: true }, ["ev"]).savings).toBe(0);
  });
  it("23 energiebalans klopt per tijdstap en per jaar voor alle combinaties", () => {
    for (let mask = 0; mask < 32; mask++) {
      const r = run(
        { existingPanels: 6, existingBattery: 5, hasEv: true },
        MEASURES.filter((_, i) => mask & (1 << i)),
      );
      for (const s of [r.before, r.after]) {
        expect(s.balanceError).toBeLessThan(1e-9);
        expect(s.production).toBeCloseTo(s.direct + s.charged + s.exports);
        expect(s.demand).toBeCloseTo(s.direct + s.discharged + s.imports);
        expect(s.discharged).toBeCloseTo(s.charged * D.batteryEfficiency);
      }
    }
  });
  it("geen terugverdientijd of investeringsbedragen in de uitkomst", () => {
    expect("payback" in run({}, ["solar"])).toBe(false);
  });
  it("onvolledige en onrealistische invoer", () => {
    expect(energyProfileSchema.parse({}).consumption).toBe(D.consumption);
    expect(energyProfileSchema.safeParse({ consumption: 1e9 }).success).toBe(false);
    expect(energyProfileSchema.safeParse({ year: 1999 }).success).toBe(false);
    expect(energyProfileSchema.safeParse({ newPanels: -2 }).success).toBe(false);
  });
});
