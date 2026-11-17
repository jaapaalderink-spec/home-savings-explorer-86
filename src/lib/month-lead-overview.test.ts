import { describe, expect, it } from "vitest";
import { leadOverviewPeriod, monthLeadLimit } from "./month-lead-overview";

describe("maandoverzicht inclusief bijgekochte leads", () => {
  it("telt een bundel van 5 bij het Startpakket van 10", () => {
    expect(monthLeadLimit(10, [{ size: 5, period_start: "2026-11-01" }], "2026-11-01")).toBe(15);
  });

  it("telt meerdere bijgekochte bundels ook bij een limiet van nul", () => {
    expect(monthLeadLimit(0, [
      { size: 3, period_start: "2026-11-01" },
      { size: 10, period_start: "2026-11-01" },
    ], "2026-11-01")).toBe(13);
  });

  it("neemt geen bundels uit andere maanden mee", () => {
    expect(monthLeadLimit(10, [
      { size: 5, period_start: "2026-10-01" },
      { size: 3, period_start: "2026-12-01" },
    ], "2026-11-01")).toBe(10);
  });

  it("gebruikt de kalendermaand in Amsterdam bij de maandgrens", () => {
    expect(leadOverviewPeriod(new Date("2026-10-31T23:30:00Z"))).toEqual({
      today: "2026-11-01", start: "2026-11-01", end: "2026-12-01",
    });
  });
});