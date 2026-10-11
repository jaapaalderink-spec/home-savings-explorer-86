import { afterEach, describe, expect, it } from "vitest";
import {
  SETTINGS,
  applyOverrides,
  defaultValue,
  readPath,
  validateOverrides,
  withOverrides,
} from "./calculator-settings";
import { DEFAULT_ENERGY_CONFIG, ENERGY_CONFIG, configState } from "./config";
import { DEFAULT_PROFILE, calculateScenario } from "./scenario";

const P = { ...DEFAULT_PROFILE, hasEv: true };
const calc = (ids: string[]) => calculateScenario(P, ids);

afterEach(() => applyOverrides({}));

describe("centrale calculatorinstellingen", () => {
  it("elke instelling bestaat in de configuratie en heeft een geldige standaardwaarde", () => {
    for (const s of SETTINGS) {
      expect(readPath(DEFAULT_ENERGY_CONFIG, s.key), s.key).not.toBeUndefined();
      expect(validateOverrides({ [s.key]: defaultValue(s.key) }), s.key).toEqual({});
    }
  });

  it("wettelijke regels zijn niet als instelling aanpasbaar", () => {
    const keys = SETTINGS.map((s) => s.key);
    expect(keys.some((k) => k.startsWith("netMetering") || k.startsWith("legalMinExport"))).toBe(false);
    expect(validateOverrides({ netMeteringLastYear: 2030 })).toHaveProperty("netMeteringLastYear");
  });

  it("ongeldige waarden worden geweigerd", () => {
    expect(validateOverrides({ "tariffs.electricityPrice": 5 })).toHaveProperty("tariffs.electricityPrice");
    expect(validateOverrides({ "battery.efficiency": 1.4 })).toHaveProperty("battery.efficiency");
    expect(validateOverrides({ "solar.monthlyShare": [0.5, 0.5] })).toHaveProperty("solar.monthlyShare");
    expect(validateOverrides({ "battery.minSoc": 0.5, "battery.maxSoc": 0.5 })).toHaveProperty("battery.minSoc");
    expect(validateOverrides({ "tariffs.gasPrice": Number.NaN })).toHaveProperty("tariffs.gasPrice");
  });

  it("een gepubliceerde ongeldige waarde valt veilig terug op de standaard", () => {
    applyOverrides({ "tariffs.electricityPrice": 99, "solar.newWp": 500 });
    expect(ENERGY_CONFIG.tariffs.electricityPrice).toBe(0.29);
    expect(ENERGY_CONFIG.solar.newWp).toBe(500);
  });

  it("een gewijzigde paneelinstelling verandert zonnepanelen, niet de warmtepomp", () => {
    const solar = calc(["solar"]).savings;
    const heat = calc(["heatpump"]).savings;
    applyOverrides({ "solar.newWp": 500 });
    expect(calc(["solar"]).savings).toBeGreaterThan(solar);
    expect(calc(["heatpump"]).savings).toBeCloseTo(heat, 6);
  });

  it("gasprijs werkt door in warmtepomp maar niet in laadpaal", () => {
    const heat = calc(["heatpump"]).savings;
    const ev = calc(["ev"]).savings;
    applyOverrides({ "tariffs.gasPrice": 2 });
    expect(calc(["heatpump"]).savings).toBeGreaterThan(heat);
    expect(calc(["ev"]).savings).toBeCloseTo(ev, 6);
  });

  it("alle rekenmodules lezen de centrale aannames", () => {
    const base = Object.fromEntries(
      (["solar", "battery", "heatpump", "ev", "airco"] as const).map((m) => [
        m,
        calc(m === "battery" ? ["solar", "battery"] : [m]).savings,
      ]),
    );
    applyOverrides({
      "solar.yieldPerKwp": 1000,
      "battery.efficiency": 0.8,
      "heat.scopByFlow.unknown": 4.5,
      "ev.chargeLoss": 0.2,
      "airco.seer": 6,
    });
    expect(calc(["solar"]).savings).not.toBeCloseTo(base.solar!, 2);
    expect(calc(["heatpump"]).savings).not.toBeCloseTo(base.heatpump!, 2);
    expect(calc(["ev"]).savings).not.toBeCloseTo(base.ev!, 2);
    expect(calc(["airco"]).savings).not.toBeCloseTo(base.airco!, 2);
  });

  it("een expliciet ingevulde consumentwaarde wint van de beheerinstelling", () => {
    applyOverrides({ "tariffs.electricityPrice": 0.4 });
    const own = { ...P, electricityPrice: 0.25, provided: ["electricityPrice"] };
    const withAdmin = calculateScenario(P, ["solar"]).savings;
    expect(calculateScenario(own, ["solar"]).savings).toBeLessThan(withAdmin);
  });

  it("voorbeeldberekening met een concept lekt niet naar live berekeningen", () => {
    const live = calc(["solar"]).savings;
    const stamp = configState.stamp;
    const draft = withOverrides({ "solar.newWp": 600 }, () => calc(["solar"]).savings);
    expect(draft).toBeGreaterThan(live);
    expect(calc(["solar"]).savings).toBeCloseTo(live, 6);
    expect(ENERGY_CONFIG.solar.newWp).toBe(450);
    expect(configState.stamp).toBeGreaterThan(stamp);
  });

  it("standaardinstellingen geven exact de oude uitkomsten", () => {
    // Unchanged engine: default overrides equal no overrides.
    const a = calc(["solar", "battery", "heatpump", "ev", "airco"]).savings;
    applyOverrides(Object.fromEntries(SETTINGS.map((s) => [s.key, defaultValue(s.key)])));
    expect(calc(["solar", "battery", "heatpump", "ev", "airco"]).savings).toBeCloseTo(a, 6);
  });

  it("aantal airco-ruimtes bepaalt het koelverbruik", () => {
    const two = calculateScenario({ ...P, aircoMode: "cool" }, ["airco"]).savings;
    const four = calculateScenario({ ...P, aircoMode: "cool", aircoRooms: 4, provided: ["aircoRooms"] }, ["airco"]).savings;
    expect(four).toBeLessThan(two);
  });

  it("publicatieversie wordt bijgehouden voor koppeling aan aanvragen", () => {
    applyOverrides({}, { version: 7 });
    expect(configState.publishedVersion).toBe(7);
  });
});
