import { describe, expect, it } from "vitest";
import { deliveryCost, fixedMonthlyCost, packageFee, terminationSettlement } from "./package-policy";

describe("pakketten", () => {
  it("pakketbedragen Start €249, Groei €474, Team €849", () => {
    expect([packageFee("start"), packageFee("groei"), packageFee("team")]).toEqual([249, 474, 849]);
  });
  it("werkelijke levering: alleen €99 vast, 6 van 10 leads = €90", () => {
    expect(fixedMonthlyCost("actual_delivered", "start", 0)).toBe(99);
    expect(deliveryCost("actual_delivered", "start", Array(6).fill(1))).toBe(90);
  });
  it("vast pakket: €249 ook bij 6 van 10 leveringen", () => {
    expect(fixedMonthlyCost("fixed_package", "start", 0)).toBe(249);
    expect(deliveryCost("fixed_package", "start", Array(6).fill(1))).toBe(0);
  });
  it("vast pakket: extra product €10 en meerlevering boven quotum €15", () => {
    expect(deliveryCost("fixed_package", "start", [2, ...Array(10).fill(1)])).toBe(25);
  });
  it("Groei heeft 1 plek inbegrepen; tweede plek kost €15", () => {
    expect(fixedMonthlyCost("actual_delivered", "groei", 2)).toBe(114);
  });
});

describe("vervroegd stoppen", () => {
  const base = { code: "groei" as const, paidSeats: 0, contractStart: "2026-11-01", stopMonth: "2027-01-01" };
  it("werkelijke levering: 3 resterende maanden × €99", () => {
    expect(terminationSettlement({ ...base, mode: "actual_delivered" }).total).toBe(297);
  });
  it("vast pakket: 3 resterende maanden × €474", () => {
    expect(terminationSettlement({ ...base, mode: "fixed_package" }).total).toBe(1422);
  });
  it("na de minimumtermijn geen afkoop", () => {
    expect(terminationSettlement({ ...base, mode: "fixed_package", stopMonth: "2027-04-01" }).total).toBe(0);
  });
});

import { BUNDLES, earliestStopMonth } from "./package-policy";
describe("bundels en opzegtermijn", () => {
  it("bundelprijzen 3×€25, 5×€24, 10×€22,50", () => {
    expect([3 * BUNDLES[3], 5 * BUNDLES[5], 10 * BUNDLES[10]]).toEqual([75, 120, 225]);
  });
  it("opzeggen op 31 oktober: laatste maand november", () => {
    expect(earliestStopMonth("2026-10-31")).toBe("2026-11-01");
  });
  it("opzeggen in december: laatste maand januari volgend jaar", () => {
    expect(earliestStopMonth("2026-12-15")).toBe("2027-01-01");
  });
});
