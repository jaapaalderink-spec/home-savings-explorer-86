import { describe, expect, it } from "vitest";
import { recommendedBatteryKwh } from "./scenario";

const r = (consumption: number, existingPanels = 0, newPanels = 0) =>
  recommendedBatteryKwh({ consumption, existingPanels, newPanels });

describe("aanbevolen batterijcapaciteit", () => {
  it("staffel op verbruik tot 30 kWh", () => {
    expect(r(3000)).toBe(5);
    expect(r(4000)).toBe(10);
    expect(r(6000)).toBe(15);
    expect(r(9000)).toBe(20);
    expect(r(12000)).toBe(25);
    expect(r(15000)).toBe(30);
  });
  it("veel panelen verhoogt het advies", () => {
    expect(r(3000, 12)).toBe(15);
    expect(r(3000, 10, 8)).toBe(20);
  });
});
