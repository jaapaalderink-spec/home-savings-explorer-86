/** Zuivere factuurregels voor nieuwe contracten (subscription_versions). Bedragen excl. btw. */
export type ContractTerms = {
  platform_fee_ex_vat: number | string;
  paid_seats: number;
  seat_fee_ex_vat: number | string;
  base_lead_price_ex_vat: number | string;
  extra_product_price_ex_vat: number | string;
};

export type BillablePurchase = { products: string[] | null; price_ex_vat?: number | string };

export type Line = { description: string; quantity: number; unit_price_ex_vat: number; amount_ex_vat: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export function contractInvoiceLines(terms: ContractTerms, purchases: BillablePurchase[]): Line[] {
  const platform = Number(terms.platform_fee_ex_vat);
  const seatFee = Number(terms.seat_fee_ex_vat);
  const base = Number(terms.base_lead_price_ex_vat);
  const extra = Number(terms.extra_product_price_ex_vat);
  const standard = purchases.filter((p) => p.price_ex_vat === undefined);
  const leads = standard.length;
  const extras = standard.reduce((s, p) => s + Math.max(0, (p.products?.length ?? 1) - 1), 0);
  const lines: Line[] = [
    { description: "Platformbijdrage", quantity: 1, unit_price_ex_vat: platform, amount_ex_vat: r2(platform) },
  ];
  if (terms.paid_seats > 0)
    lines.push({
      description: "Accountmanagerplekken",
      quantity: terms.paid_seats,
      unit_price_ex_vat: seatFee,
      amount_ex_vat: r2(terms.paid_seats * seatFee),
    });
  if (leads > 0)
    lines.push({ description: "Geleverde aanvragen", quantity: leads, unit_price_ex_vat: base, amount_ex_vat: r2(leads * base) });
  if (extras > 0)
    lines.push({ description: "Extra producten per aanvraag", quantity: extras, unit_price_ex_vat: extra, amount_ex_vat: r2(extras * extra) });
  for (const purchase of purchases) {
    if (purchase.price_ex_vat === undefined) continue;
    const price = Number(purchase.price_ex_vat);
    if (!Number.isFinite(price) || price < 0) throw new Error("Ongeldige vastgelegde leveringsprijs.");
    lines.push({ description: "Geleverde aanvraag — vastgelegde bundelprijs", quantity: 1, unit_price_ex_vat: price, amount_ex_vat: r2(price) });
  }
  return lines;
}
