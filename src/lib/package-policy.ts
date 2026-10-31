/** Pakketten, facturatiemodus per bedrijf en afrekening bij vervroegd stoppen. Bedragen excl. btw. */
export type PackageCode = "start" | "groei" | "team";
export type BillingMode = "actual_delivered" | "fixed_package";

export const PACKAGE_PLATFORM_FEE = 99;
export const PACKAGE_LEAD_PRICE = 15;
export const PACKAGE_EXTRA_PRODUCT_PRICE = 10;
export const SEAT_FEE = 15;
export const MIN_TERM_MONTHS = 6;
export const NOTICE_MONTHS = 1;

export const PACKAGES: Record<PackageCode, { label: string; leads: number; includedSeats: number }> = {
  start: { label: "Start", leads: 10, includedSeats: 0 },
  groei: { label: "Groei", leads: 25, includedSeats: 1 },
  team: { label: "Team", leads: 50, includedSeats: 3 },
};

/** Volledig maandelijks pakketbedrag: platform + alle leadplaatsen tegen basisprijs. */
export function packageFee(code: PackageCode) {
  return PACKAGE_PLATFORM_FEE + PACKAGES[code].leads * PACKAGE_LEAD_PRICE;
}

/** Vaste maandkosten die altijd gelden, los van leveringen. */
export function fixedMonthlyCost(mode: BillingMode, code: PackageCode, paidSeats: number) {
  const seats = Math.max(0, paidSeats - PACKAGES[code].includedSeats) * SEAT_FEE;
  return (mode === "fixed_package" ? packageFee(code) : PACKAGE_PLATFORM_FEE) + seats;
}

/** Leveringskosten in een maand: bij vast pakket vallen de eerste `leads` basisprijzen weg. */
export function deliveryCost(mode: BillingMode, code: PackageCode, deliveredProducts: number[]) {
  let covered = mode === "fixed_package" ? PACKAGES[code].leads : 0;
  return deliveredProducts.reduce((sum, n) => {
    const extras = Math.max(0, n - 1) * PACKAGE_EXTRA_PRODUCT_PRICE;
    if (covered > 0) {
      covered--;
      return sum + extras;
    }
    return sum + PACKAGE_LEAD_PRICE + extras;
  }, 0);
}

const monthIndex = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return y * 12 + (m - 1);
};

/**
 * Afkoop bij vervroegd stoppen: resterende maanden van de minimumtermijn na de lopende maand,
 * × vaste kosten volgens de facturatiemodus van het bedrijf (€99 of volledig pakketbedrag).
 * De lopende maand wordt via de gewone maandfactuur afgerekend.
 */
export function terminationSettlement(input: {
  mode: BillingMode;
  code: PackageCode;
  paidSeats: number;
  contractStart: string; // YYYY-MM-DD, eerste van de maand
  stopMonth: string; // laatste maand waarin het contract loopt (YYYY-MM-DD)
  minTermMonths?: number;
}) {
  const term = input.minTermMonths ?? MIN_TERM_MONTHS;
  const lastTermMonth = monthIndex(input.contractStart) + term - 1;
  const remainingMonths = Math.max(0, lastTermMonth - monthIndex(input.stopMonth));
  const monthly = fixedMonthlyCost(input.mode, input.code, input.paidSeats);
  return { remainingMonths, monthly, total: remainingMonths * monthly };
}
