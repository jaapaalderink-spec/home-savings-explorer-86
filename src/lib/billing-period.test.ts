import { describe, expect, it } from "vitest";
import { isBillingMonthClosed, lastClosedBillingMonth } from "./billing-period";

describe("achteraf-maandafsluiting Europe/Amsterdam", () => {
  it("weigert oktober tot de Amsterdamse maandgrens", () => {
    expect(isBillingMonthClosed(2026, 10, new Date("2026-10-31T22:59:59Z"))).toBe(false);
    expect(isBillingMonthClosed(2026, 10, new Date("2026-10-31T23:00:00Z"))).toBe(true);
  });
  it("gebruikt zomertijd bij de septemberafsluiting", () => {
    expect(isBillingMonthClosed(2026, 9, new Date("2026-09-30T21:59:59Z"))).toBe(false);
    expect(isBillingMonthClosed(2026, 9, new Date("2026-09-30T22:00:00Z"))).toBe(true);
  });
  it("weigert lopende en toekomstige maanden", () => {
    const now = new Date("2026-10-20T13:51:00Z");
    expect(isBillingMonthClosed(2026, 10, now)).toBe(false);
    expect(isBillingMonthClosed(2026, 11, now)).toBe(false);
    expect(isBillingMonthClosed(2026, 9, now)).toBe(true);
  });
  it("selecteert december bij een januari-start", () => {
    expect(lastClosedBillingMonth(new Date("2026-12-31T23:00:00Z"))).toEqual({ year: 2026, month: 12 });
  });
});