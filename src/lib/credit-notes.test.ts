import { describe, expect, it } from "vitest";
import {
  amountDueCents,
  creditAmounts,
  openCreditCents,
  COMPLAINT_OUTCOME_LABEL,
  CREDIT_STATUS_LABEL,
} from "@/lib/credit-policy";

describe("creditbedragen", () => {
  it("keert het oorspronkelijke bedrag exact om, inclusief btw", () => {
    expect(creditAmounts(50, 0.21)).toMatchObject({ net: "50.00", vat: "10.50", gross: "60.50" });
    expect(creditAmounts("40.00", 0.21)).toMatchObject({
      net: "40.00",
      vat: "8.40",
      gross: "48.40",
    });
  });

  it("gebruikt het btw-percentage van de oorspronkelijke factuur", () => {
    expect(creditAmounts(100, 0.09).vat).toBe("9.00");
    expect(creditAmounts(100, 0).vat).toBe("0.00");
  });

  it("rekent in hele centen, niet met komma-afrondingen", () => {
    expect(creditAmounts("33.33", 0.21).grossCents).toBe(4033);
  });
});

describe("openstaand bedrag", () => {
  it("factuur minus verrekend credit", () => {
    expect(amountDueCents("121.00", "60.50")).toBe(6050);
    expect(amountDueCents("200.00", "50.00")).toBe(15000);
  });

  it("wordt nooit negatief", () => {
    expect(amountDueCents("50.00", "80.00")).toBe(0);
  });

  it("zonder credit is het gewoon het factuurbedrag", () => {
    expect(amountDueCents("121.00")).toBe(12100);
  });
});

describe("openstaand tegoed", () => {
  it("telt alleen nog niet verrekende creditnota's", () => {
    expect(
      openCreditCents([
        { status: "open", total_inc_vat: "60.50" },
        { status: "applied", total_inc_vat: "48.40" },
        { status: "open", total_inc_vat: "10.00" },
      ]),
    ).toBe(7050);
  });
});

describe("labels", () => {
  it("elke uitkomst heeft een uitleg in gewone taal", () => {
    expect(COMPLAINT_OUTCOME_LABEL.no_credit_required).toContain("proeflead");
    expect(COMPLAINT_OUTCOME_LABEL.credit_note_created).toContain("Creditnota");
    expect(CREDIT_STATUS_LABEL.open).toContain("tegoed");
  });
});
