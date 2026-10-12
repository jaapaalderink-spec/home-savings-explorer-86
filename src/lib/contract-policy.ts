/** Standaardprijzen voor nieuwe contracten, excl. btw. Oude contracten houden hun eigen afspraken. */
export const CONTRACT_DEFAULTS = {
  platformFee: 25,
  seatFee: 15,
  baseLeadPrice: 15,
  extraProductPrice: 10,
} as const;

/** Prijs van één toewijzing met `products` gebundelde producten. */
export function bundlePrice(products: number, base: number = CONTRACT_DEFAULTS.baseLeadPrice, extra: number = CONTRACT_DEFAULTS.extraProductPrice) {
  return products <= 0 ? 0 : base + extra * (products - 1);
}

/** Maandbedrag volgens contract: platform + plekken + leadplaatsen × basisprijs. */
export function contractMonthlyEstimate(quota: number, paidSeats: number) {
  return (
    CONTRACT_DEFAULTS.platformFee +
    paidSeats * CONTRACT_DEFAULTS.seatFee +
    quota * CONTRACT_DEFAULTS.baseLeadPrice
  );
}
