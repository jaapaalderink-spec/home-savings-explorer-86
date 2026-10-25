import { describe, expect, it } from "vitest";
import { dossierSummary, overallStatus, productStats } from "./crm-policy";

describe("dossiersamenvatting", () => {
  it("gedeeltelijke winst met open product blijft open", () => expect(dossierSummary(["won", "new"])).toEqual({ status: "partial_won", closed: false }));
  it("gemengde gesloten uitkomsten blijven gedeeltelijk gewonnen", () => expect(dossierSummary(["won", "lost"])).toEqual({ status: "partial_won", closed: true }));
  it("alle producten gewonnen sluiten het dossier", () => expect(dossierSummary(["won", "won"])).toEqual({ status: "won", closed: true }));
});

describe("overallStatus", () => {
  it("gewonnen wint", () => expect(overallStatus(["lost", "won", "quoted"])).toBe("won"));
  it("alles verloren", () => expect(overallStatus(["lost", "lost"])).toBe("lost"));
  it("verst gevorderde open status", () => expect(overallStatus(["lost", "contacted", "quoted"])).toBe("quoted"));
  it("leeg is nieuw", () => expect(overallStatus([])).toBe("new"));
});

describe("productStats", () => {
  it("conversie = gewonnen ÷ ontvangen", () => {
    const [s] = productStats([
      { category: "solar", status: "won", quoteAmount: 7000, wonAmount: 6000 },
      { category: "solar", status: "lost", quoteAmount: 5000 },
      { category: "solar", status: "new", quoteAmount: null },
      { category: "solar", status: "contacted", quoteAmount: null },
    ]);
    expect(s).toMatchObject({ received: 4, contacted: 3, quoted: 2, won: 1, lost: 1, open: 2, conversion: 25, winRate: 50, wonValue: 6000 });
  });
  it("leidt winst niet uit een historische offerte af", () => {
    expect(productStats([{ category: "solar", status: "won", quoteAmount: 7000 }])[0]?.wonValue).toBe(0);
  });
  it("heropening verwijdert de oude winst uit actuele totalen", () => {
    expect(productStats([{ category: "solar", status: "contacted", quoteAmount: 7000, wonAmount: 6000 }])[0]?.wonValue).toBe(0);
  });
});
