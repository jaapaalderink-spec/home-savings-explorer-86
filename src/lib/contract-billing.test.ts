import { describe, expect, it } from "vitest";
import { contractInvoiceLines } from "./contract-billing";

const terms = { platform_fee_ex_vat: 25, paid_seats: 2, seat_fee_ex_vat: 15, base_lead_price_ex_vat: 15, extra_product_price_ex_vat: 10 };

describe("contractInvoiceLines", () => {
  it("rekent platform, plekken, leads en extra producten", () => {
    const lines = contractInvoiceLines(terms, [{ products: ["zon"] }, { products: ["zon", "batterij", "laadpaal"] }]);
    expect(lines.map((l) => l.amount_ex_vat)).toEqual([25, 30, 30, 20]);
  });
  it("alleen platformbijdrage zonder leads of plekken", () => {
    expect(contractInvoiceLines({ ...terms, paid_seats: 0 }, [])).toHaveLength(1);
  });
  it("factureert 15 leveringen en zes extra producten voor €340, niet de 20 gewenste", () => {
    const purchases = Array.from({ length: 15 }, (_, i) => ({ products: i < 6 ? ["solar", "battery"] : ["solar"] }));
    expect(contractInvoiceLines(terms, purchases).reduce((sum, line) => sum + line.amount_ex_vat, 0)).toBe(340);
  });
  it("rekent €280 voor 15 ontvangen enkelproductleads met twee seats", () => {
    const purchases = Array.from({ length: 15 }, () => ({ products: ["solar"] }));
    expect(contractInvoiceLines(terms, purchases).reduce((sum, line) => sum + line.amount_ex_vat, 0)).toBe(280);
  });
  it("houdt €55 vaste kosten verschuldigd bij nul leveringen en twee seats", () => {
    expect(contractInvoiceLines(terms, []).reduce((sum, line) => sum + line.amount_ex_vat, 0)).toBe(55);
  });
  it("factureert een tweedelige custom bundel éénmaal €12 zonder toeslag", () => {
    const lines = contractInvoiceLines(terms, [{ products: ["solar", "battery"], price_ex_vat: 12 }]);
    expect(lines.map((line) => line.amount_ex_vat)).toEqual([25, 30, 12]);
  });
  it("verwerpt negatieve leveringsprijzen", () => {
    expect(() => contractInvoiceLines(terms, [{ products: ["solar"], price_ex_vat: -1 }])).toThrow();
  });
});
