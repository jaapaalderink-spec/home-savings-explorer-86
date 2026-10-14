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
});
