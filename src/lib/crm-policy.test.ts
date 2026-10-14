import { describe, expect, it } from "vitest";
import { overallStatus, productStats } from "./crm-policy";

describe("overallStatus", () => {
  it("gewonnen wint", () => expect(overallStatus(["lost", "won", "quoted"])).toBe("won"));
  it("alles verloren", () => expect(overallStatus(["lost", "lost"])).toBe("lost"));
  it("verst gevorderde open status", () => expect(overallStatus(["lost", "contacted", "quoted"])).toBe("quoted"));
  it("leeg is nieuw", () => expect(overallStatus([])).toBe("new"));
});

describe("productStats", () => {
  it("conversie = gewonnen ÷ ontvangen", () => {
    const [s] = productStats([
      { category: "solar", status: "won", quoteAmount: 6000 },
      { category: "solar", status: "lost", quoteAmount: 5000 },
      { category: "solar", status: "new", quoteAmount: null },
      { category: "solar", status: "contacted", quoteAmount: null },
    ]);
    expect(s).toMatchObject({ received: 4, contacted: 3, quoted: 2, won: 1, lost: 1, open: 2, conversion: 25, winRate: 50, wonValue: 6000 });
  });
});
