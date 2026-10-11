import { describe, expect, it } from "vitest";
import {
  calculateScenario,
  batteryReport,
  compareSolarBattery,
  debugScenario,
  DEFAULT_PROFILE as D,
  type EnergyProfile,
} from "./scenario";

const P = (p: Partial<EnergyProfile>): EnergyProfile => ({ ...D, ...p });
// Test home from the brief: 8 existing panels (~3000 kWh), extra panels, battery.
const HOME = P({
  existingPanels: 8,
  existingYield: 3000,
  newPanels: 8,
  netMetering: true,
  year: 2026,
});
const NEW_SOLAR = (8 * 450 * 850) / 1000; // 3060 kWh

describe("regressie: contracten, zonnepanelen en thuisbatterij", () => {
  it("bestaande panelen + nieuwe batterij (B t.o.v. A)", () => {
    const [y26, y27] = compareSolarBattery(HOME, ["battery"]);
    expect(y26!.batteryOnExisting).toBeLessThan(0); // saldering: only losses remain
    expect(y27!.batteryOnExisting).toBeGreaterThan(100);
  });
  it("bestaande + extra panelen zonder batterij (C t.o.v. A)", () => {
    const r = calculateScenario(HOME, ["solar"]);
    expect(r.before.production).toBeCloseTo(3000);
    expect(r.after.production).toBeCloseTo(3000 + NEW_SOLAR);
  });
  it("batterijbijdrage in D wordt vergeleken met C, pakket = D − A", () => {
    const r = calculateScenario(HOME, ["solar", "battery"]);
    const [y26] = r.comparisons;
    expect(r.battery!.y2026.net).toBeCloseTo(y26!.costs.C - y26!.costs.D);
    expect(r.savings).toBeCloseTo(y26!.package);
  });
  it("saldering 2026: verrekening op kWh, cost = (verbruik − opwek) × prijs", () => {
    const r = calculateScenario(P({ netMetering: true, year: 2026 }), ["solar"]);
    expect(r.after.cost - r.after.gasCost - r.after.fixedCost).toBeCloseTo(
      (3500 - NEW_SOLAR) * 0.29,
      6,
    );
  });
  it("geen wettelijke saldering in 2027", () => {
    const r = calculateScenario(P({ netMetering: true, year: 2027 }), ["solar"]);
    expect(r.after.netted).toBe(0);
    expect(r.after.importCost).toBeCloseTo(r.after.imports * 0.29, 6);
  });
  it("terugleverkosten per kWh over alle teruglevering", () => {
    const r = calculateScenario(P({ consumption: 0, exportCost: 0.1, year: 2027 }), ["solar"]);
    expect(r.after.exportCosts).toBeCloseTo(NEW_SOLAR * 0.1, 6);
    expect(r.after.cost - r.after.gasCost).toBeCloseTo(-NEW_SOLAR * 0.05 + NEW_SOLAR * 0.1, 6);
  });
  it("terugleverkosten via staffels op de jaarhoeveelheid", () => {
    const tiers = [
      { upToKwh: 1000, annualCost: 20 },
      { upToKwh: 2500, annualCost: 120 },
      { upToKwh: null, annualCost: 300 },
    ];
    const r = calculateScenario(
      P({ exportCostModel: "tiers", exportCostTiers: tiers, consumption: 0 }),
      ["solar"],
    );
    expect(r.after.exportCosts).toBe(300);
    // A battery that pushes export into a lower bracket saves the bracket difference, not per kWh.
    const rb = batteryReport(P({ ...HOME, exportCostModel: "tiers", exportCostTiers: tiers }), [
      "solar",
      "battery",
    ]);
    expect([0, 180, 280, 100]).toContain(Math.round(rb.y2027.exportCostSaving));
  });
  it("niet-vermijdbare vaste terugleverkosten zijn geen batterijvoordeel", () => {
    const rb = batteryReport(P({ ...HOME, exportCostModel: "fixed", exportCostFixed: 150 }), [
      "solar",
      "battery",
    ]);
    expect(rb.y2026.exportCostSaving).toBe(0);
    expect(rb.y2027.exportCostSaving).toBe(0);
  });
  it("vast contract met daltarief rekent nachtafname tegen dal", () => {
    const flat = calculateScenario(P({ contractType: "vast", year: 2027 }), []);
    const dual = calculateScenario(
      P({ contractType: "vast", electricityPriceLow: 0.2, year: 2027 }),
      [],
    );
    expect(dual.before.cost).toBeLessThan(flat.before.cost);
  });
  it("variabel contract volgt tariefperiodes met ingangsdatum", () => {
    const base = calculateScenario(P({ contractType: "variabel", year: 2027 }), []);
    const half = calculateScenario(
      P({
        contractType: "variabel",
        year: 2027,
        tariffPeriods: [{ from: "2027-07-01", electricityPrice: 0.39 }],
      }),
      [],
    );
    const h1 = debugScenario(half.profile, []).tariffs[4]!;
    expect(h1.jan.importPrice).toBe(0.29);
    expect(half.before.cost).toBeGreaterThan(base.before.cost);
  });
  it("dynamisch contract: aparte uurprijzen voor inkoop en teruglevering", () => {
    const d = debugScenario(P({ contractType: "dynamisch", year: 2027 }), []);
    const evening = d.tariffs.find((t) => t.hour === 18)!;
    const noon = d.tariffs.find((t) => t.hour === 12)!;
    expect(evening.jun.importPrice).toBeGreaterThan(noon.jun.importPrice);
    expect(noon.jun.exportPrice).not.toBe(noon.jun.importPrice);
  });
  it("netladen alleen met slimme strategie en dynamisch contract", () => {
    const base = {
      ...HOME,
      year: 2027,
      contractType: "dynamisch" as const,
      batteryStrategy: "smart" as const,
    };
    const off = batteryReport(P({ ...base, gridCharging: false }), ["battery"]);
    const on = batteryReport(
      P({ ...base, gridCharging: true, existingPanels: 0, existingYield: null }),
      ["battery"],
    );
    const fixed = batteryReport(
      P({
        ...base,
        contractType: "vast",
        gridCharging: true,
        existingPanels: 0,
        existingYield: null,
      }),
      ["battery"],
    );
    expect(off.y2027.gridChargedKwh).toBe(0);
    expect(on.y2027.gridChargedKwh).toBeGreaterThan(0);
    expect(fixed.y2027.gridChargedKwh).toBe(0);
  });
  it("batterij zonder zonneoverschot laadt niets", () => {
    const rb = batteryReport(P({}), ["battery"]);
    expect(rb.y2027.net).toBeCloseTo(0);
    expect(rb.y2027.extraSelfKwh).toBeCloseTo(0);
  });
  it("negatieve terugleverprijzen maken opslaan juist waardevoller", () => {
    const pos = batteryReport(P({ ...HOME, year: 2031 }), ["battery"]); // after the 2027-2030 legal floor
    const neg = batteryReport(P({ ...HOME, year: 2031, exportPrice: -0.05 }), ["battery"]);
    expect(neg.y2027.missedExport).toBeGreaterThan(0); // avoided paying for export
    expect(neg.y2027.net).toBeGreaterThan(pos.y2027.net);
  });
  it("opgeslagen eigen zonnestroom: vermeden inkoop − gemiste vergoeding, geen fictieve inkoopprijs", () => {
    const q = P({ ...HOME, netMetering: false, year: 2027, batteryEfficiency: 0.9 });
    const without = debugScenario(q, ["solar"]).after;
    const withB = debugScenario(q, ["solar", "battery"]).after;
    const ref = withB.discharged * 0.29 - withB.charged * 0.05;
    expect(without.cost - withB.cost).toBeCloseTo(ref, 6);
  });
  it("bestaande panelen worden niet dubbel gewaardeerd", () => {
    const r = calculateScenario(HOME, []);
    expect(r.savings).toBe(0);
    expect(r.before.existingProduction).toBe(3000);
    expect(r.before.newProduction).toBe(0);
  });
  it("verliezen: lading − ontlading, 10% bij rendement 0,9", () => {
    const s = debugScenario(HOME, ["battery"]).after;
    expect(s.losses).toBeCloseTo(s.charged * 0.1, 6);
    const rb = batteryReport(HOME, ["battery"]);
    expect(rb.y2026.lossKwh).toBeGreaterThan(0);
  });
  it("optimalisatie met laadpaal en warmtepomp blijft in balans", () => {
    const q = P({
      ...HOME,
      year: 2027,
      hasEv: true,
      contractType: "dynamisch",
      batteryStrategy: "smart",
      gridCharging: true,
    });
    const s = debugScenario(q, ["solar", "battery", "ev", "heatpump"]).after;
    expect(s.balanceError).toBeLessThan(1e-9);
    expect(s.production).toBeCloseTo(s.direct + s.charged + s.exports, 6);
    expect(s.demand + s.gridCharged).toBeCloseTo(s.direct + s.discharged + s.imports, 6);
    expect(s.charged + s.gridCharged).toBeGreaterThanOrEqual(s.discharged);
  });
  it("netto-verbruik met bestaande panelen wordt omgerekend naar bruto", () => {
    const r = calculateScenario(P({ ...HOME, consumptionBasis: "net" }), []);
    expect(r.before.grossConsumption).toBeCloseTo(3500 + 3000);
  });
  it("testwoning: 2026 negatief door opslagverlies, 2027 positief, uitleg volgt de cijfers", () => {
    const r = calculateScenario(HOME, ["solar", "battery"]);
    const b = r.battery!;
    expect(b.y2026.net).toBeLessThan(0);
    expect(b.y2027.net).toBeGreaterThan(0);
    expect(b.conclusion).toMatch(/Vanaf 2027 kan de besparing toenemen/);
    const sum =
      b.y2027.avoidedImport + b.y2027.missedExport + b.y2027.exportCostSaving + b.y2027.standbyCost;
    expect(sum).toBeCloseTo(b.y2027.net, 6);
  });
});
