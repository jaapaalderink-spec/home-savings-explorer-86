import { describe, expect, it } from "vitest";
import { invoiceAge, shouldSuspend } from "./dunning-policy";

describe("dunning-policy", () => {
  it("herinnering pas na 14 dagen", () => {
    expect(invoiceAge("2026-10-01", "2026-10-15", "2026-10-14", false).reminderAllowed).toBe(false);
    expect(invoiceAge("2026-10-01", "2026-10-15", "2026-10-15", false).reminderAllowed).toBe(true);
  });
  it("geen herinnering bij betaalde factuur", () => {
    expect(invoiceAge("2026-09-01", "2026-09-15", "2026-10-31", true).reminderAllowed).toBe(false);
  });
  it("telt dagen open en vervallen", () => {
    expect(invoiceAge("2026-10-01", "2026-10-15", "2026-10-31", false)).toMatchObject({ daysOpen: 30, daysOverdue: 16 });
  });
  it("pauze bij 2 vervallen facturen, niet bij 1", () => {
    expect(shouldSuspend(1)).toBe(false);
    expect(shouldSuspend(2)).toBe(true);
  });
});
