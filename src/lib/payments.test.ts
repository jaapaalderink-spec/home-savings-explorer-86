import { describe, expect, it } from "vitest";
import {
  centsToAmount,
  invoiceStatusFor,
  mapMollieStatus,
  paymentAction,
  toCents,
  verifyMolliePayment,
} from "@/lib/payments-policy";

describe("bedragen", () => {
  it("rekent met hele centen, niet met floats", () => {
    expect(toCents("301.35")).toBe(30135);
    expect(toCents("0.10")).toBe(10);
    expect(toCents(249)).toBe(24900);
    expect(centsToAmount(30135)).toBe("301.35");
    expect(centsToAmount(24900)).toBe("249.00");
    expect(centsToAmount(5)).toBe("0.05");
  });

  it("weigert onleesbare bedragen", () => {
    expect(() => toCents("gratis")).toThrow();
    expect(() => toCents("10.999")).toThrow();
  });
});

describe("statusafbeelding", () => {
  it("alleen 'paid' van Mollie betekent betaald", () => {
    expect(mapMollieStatus("paid")).toBe("paid");
    expect(mapMollieStatus("open")).toBe("open");
    expect(mapMollieStatus("authorized")).toBe("pending");
    expect(mapMollieStatus("failed")).toBe("failed");
    expect(mapMollieStatus("expired")).toBe("expired");
    expect(mapMollieStatus("canceled")).toBe("canceled");
  });

  it("een onbekende status wordt nooit als betaald gelezen", () => {
    expect(mapMollieStatus("iets_nieuws")).toBe("pending");
  });

  it("factuurstatus volgt de betaling zonder tegenstrijdigheden", () => {
    expect(invoiceStatusFor("paid", "issued")).toBe("paid");
    expect(invoiceStatusFor("failed", "issued")).toBe("open");
    expect(invoiceStatusFor("expired", "issued")).toBe("open");
    expect(invoiceStatusFor("failed", "paid")).toBe("paid");
    expect(invoiceStatusFor("paid", "credited")).toBe("credited");
  });
});

describe("controle van de betaling", () => {
  const base = { expectedCents: 30135, invoiceId: "inv-1" };

  it("bedrag en valuta moeten kloppen", () => {
    expect(verifyMolliePayment({ ...base, currency: "EUR", amountValue: "301.35" })).toEqual({
      ok: true,
    });
  });

  it("een afwijkend bedrag wordt niet geaccepteerd", () => {
    expect(verifyMolliePayment({ ...base, currency: "EUR", amountValue: "1.00" })).toEqual({
      ok: false,
      reason: "amount_mismatch",
    });
  });

  it("een andere valuta wordt niet geaccepteerd", () => {
    expect(verifyMolliePayment({ ...base, currency: "USD", amountValue: "301.35" })).toEqual({
      ok: false,
      reason: "currency_mismatch",
    });
  });

  it("een betaling van een andere factuur wordt niet geaccepteerd", () => {
    expect(
      verifyMolliePayment({
        ...base,
        currency: "EUR",
        amountValue: "301.35",
        metadataInvoiceId: "inv-2",
      }),
    ).toEqual({ ok: false, reason: "invoice_mismatch" });
  });
});

describe("nieuwe of hergebruikte betaalpoging", () => {
  const open = { invoiceStatus: "issued" as const, totalCents: 30135 };

  it("een betaalde factuur krijgt geen nieuwe betaling", () => {
    expect(paymentAction({ ...open, invoiceStatus: "paid" })).toEqual({
      action: "blocked",
      reason: "already_paid",
    });
  });

  it("een factuur zonder bedrag krijgt geen betaling", () => {
    expect(paymentAction({ ...open, totalCents: 0 })).toEqual({
      action: "blocked",
      reason: "zero_amount",
    });
  });

  it("herhaald klikken hergebruikt de lopende betaallink", () => {
    expect(
      paymentAction({ ...open, existing: { status: "open", checkoutUrl: "https://pay" } }),
    ).toEqual({ action: "reuse" });
    expect(
      paymentAction({ ...open, existing: { status: "pending", checkoutUrl: "https://pay" } }),
    ).toEqual({ action: "reuse" });
  });

  it("na mislukt, verlopen of geannuleerd mag een nieuwe poging", () => {
    for (const status of ["failed", "expired", "canceled"] as const) {
      expect(paymentAction({ ...open, existing: { status, checkoutUrl: "https://pay" } })).toEqual({
        action: "create",
      });
    }
  });

  it("zonder eerdere poging wordt er één aangemaakt", () => {
    expect(paymentAction(open)).toEqual({ action: "create" });
  });
});
