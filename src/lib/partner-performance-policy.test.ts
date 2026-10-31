import { describe, expect, it } from "vitest";
import { aggregatePerformance } from "./partner-performance-policy";

const purchases = [
  { id: "p1", company_id: "A", products: ["solar"], contacted_within_48h: true },
  { id: "p2", company_id: "A", products: ["solar", "battery"], contacted_within_48h: false },
  { id: "p3", company_id: "B", products: ["heatpump"], contacted_within_48h: true },
];
const crm = [{ purchase_id: "p1", category: "solar", status: "won", won_amount_ex_vat: 8000 }];
const quotes = [
  { purchase_id: "p1", category: "solar", amount_ex_vat: 9000, version: 1 },
  { purchase_id: "p1", category: "solar", amount_ex_vat: 8000, version: 2 },
];

describe("aggregatePerformance", () => {
  it("conversie = gewonnen leads / ontvangen leads", () => {
    const a = aggregatePerformance(purchases, crm, quotes, [], "all").find((r) => r.company_id === "A")!;
    expect(a.conversion).toBe(50);
    expect(a.revenue).toBe(8000);
    expect(a.response48h).toBe(50);
  });
  it("telt alleen de laatste offerteversie", () => {
    const a = aggregatePerformance(purchases, crm, quotes, [], "all").find((r) => r.company_id === "A")!;
    expect(a.quotes).toBe(1);
    expect(a.quoteValue).toBe(8000);
  });
  it("dienstfilter sluit andere diensten uit", () => {
    const rows = aggregatePerformance(purchases, crm, quotes, [], "battery");
    expect(rows.map((r) => r.company_id)).toEqual(["A"]);
    expect(rows[0]!.revenue).toBe(0);
  });
});
