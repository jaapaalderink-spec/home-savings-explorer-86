import { describe, expect, it } from "vitest";
import {
  areaProblem,
  columnTotals,
  companyTotal,
  estimateMonth,
  remaining,
  rowTotal,
  type RecipientRow,
  type ServiceCategory,
} from "@/lib/lead-settings-policy";

const row = (userId: string, counts: Partial<Record<ServiceCategory, number>>): RecipientRow => ({
  userId,
  paused: false,
  services: (["solar", "battery", "heatpump", "airco", "ev"] as const).map((category) => ({
    category,
    enabled: (counts[category] ?? 0) > 0,
    monthlyMax: counts[category] ?? 0,
    area: { mode: null },
  })),
});

describe("leadinstellingen", () => {
  const rows = [
    row("a", { solar: 5, battery: 5 }),
    row("b", { battery: 5, heatpump: 3, airco: 2 }),
    row("owner", { ev: 5 }),
  ];

  it("telt rijtotalen, diensttotalen en bedrijfstotaal zoals het voorbeeld (25)", () => {
    expect(rows.map(rowTotal)).toEqual([10, 10, 5]);
    expect(columnTotals(rows)).toEqual({ solar: 5, battery: 10, heatpump: 3, airco: 2, ev: 5 });
    expect(companyTotal(rows)).toBe(25);
  });

  it("uitgeschakelde dienst telt niet mee", () => {
    const r = row("x", { solar: 4 });
    r.services[0]!.enabled = false;
    expect(rowTotal(r)).toBe(0);
  });

  it("verlagen onder geleverd geeft resterend nul, nooit negatief", () => {
    expect(remaining(3, 5)).toBe(0);
    expect(remaining(10, 6)).toBe(4);
  });

  it("raming: €25 + 2 seats × €15 + 25 × €15 = €430", () => {
    const e = estimateMonth(
      { platformFee: 25, seatFee: 15, paidSeats: 2, baseLeadPrice: 15, extraProductPrice: 10 },
      25,
    );
    expect(e.total).toBe(430);
    expect(e.seats).toBe(30);
  });

  it("ontvangergebied moet binnen het bedrijfsgebied vallen", () => {
    expect(areaProblem({ mode: "national" }, { mode: "provinces", provinces: ["Utrecht"] })).toBeNull();
    expect(
      areaProblem({ mode: "provinces", provinces: ["Utrecht"] }, { mode: "provinces", provinces: ["Zeeland"] }),
    ).toContain("Zeeland");
    expect(
      areaProblem(
        { mode: "radius", centerLat: 52.09, centerLng: 5.12, radiusKm: 50 },
        { mode: "radius", centerLat: 52.09, centerLng: 5.12, radiusKm: 20 },
      ),
    ).toBeNull();
    expect(
      areaProblem(
        { mode: "radius", centerLat: 52.09, centerLng: 5.12, radiusKm: 20 },
        { mode: "national" },
      ),
    ).not.toBeNull();
    expect(areaProblem(null, { mode: "national" })).not.toBeNull();
    expect(areaProblem(null, { mode: null })).toBeNull();
  });
});
