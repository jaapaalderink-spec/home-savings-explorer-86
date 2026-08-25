/** Prijzen, abonnementen en regio-helpers — client-safe (geen secrets). */

export const VAT_RATE = 0.21;

/** Prijs per lead per installateur, exclusief btw, afhankelijk van het aantal partners. */
export const LEAD_TYPE_PRICE: Record<"shared_2" | "shared_4", number> = {
  shared_2: 50,
  shared_4: 40,
};

export const LEAD_TYPE_LABEL: Record<"shared_2" | "shared_4", string> = {
  shared_2: "Exclusief (max 2 partners)",
  shared_4: "Gedeeld (max 4 partners)",
};

export const CATEGORY_LABEL: Record<string, string> = {
  solar: "Zonnepanelen",
  heatpump: "Warmtepomp",
  battery: "Thuisbatterij",
  ev: "Laadpaal / EV",
  ehms: "EHMS",
  airco: "Airco",
  boiler: "Warmteboiler",
};

export const CATEGORIES = ["solar", "heatpump", "battery", "ev", "ehms", "airco", "boiler"] as const;

/**
 * Abonnementen: een vast maandbedrag met een aantal leads inbegrepen.
 * Leads boven het bundeltegoed worden per stuk gefactureerd tegen de leadtypeprijs.
 */
export const PLANS = [
  { id: "starter", name: "Starter", leads: 10, price: 449 },
  { id: "groei", name: "Groei", leads: 25, price: 1049 },
  { id: "premium", name: "Premium", leads: 60, price: 2349 },
] as const;

export type PlanId = (typeof PLANS)[number]["id"];

export function planByName(name: string) {
  return PLANS.find((p) => p.id === name) ?? PLANS[0];
}

/** Prijs per lead voor dit leadtype (ex btw). */
export function leadTypePrice(type: string | null | undefined): number {
  return LEAD_TYPE_PRICE[(type as "shared_2" | "shared_4") ?? "shared_4"] ?? LEAD_TYPE_PRICE.shared_4;
}

/** Aantal partners dat een lead maximaal mag ontvangen. */
export function maxPartnersFor(type: string | null | undefined): number {
  return type === "shared_2" ? 2 : 4;
}

/** Eén categorie = exclusievere lead met 2 partners, meerdere categorieën = gedeeld met 4. */
export function leadTypeFor(categories: string[]): "shared_2" | "shared_4" {
  return categories.length <= 1 ? "shared_2" : "shared_4";
}

/** Postcodegebied (eerste 2 cijfers) als regiocode. */
export function regionFromPostcode(postcode: string): string | null {
  const digits = postcode.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(0, 2);
}

export const COMPLAINT_REASONS = [
  { id: "unreachable", label: "Onbereikbaar telefoonnummer" },
  { id: "invalid_phone", label: "Ongeldig telefoonnummer" },
  { id: "duplicate", label: "Dubbele lead" },
  { id: "out_of_area", label: "Buiten werkgebied" },
  { id: "no_interest", label: "Geen interesse" },
  { id: "spam", label: "Test / spam" },
] as const;

export const COMPLAINT_REASON_LABEL: Record<string, string> = Object.fromEntries(
  COMPLAINT_REASONS.map((r) => [r.id, r.label]),
);

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: "Concept",
  issued: "Verstuurd",
  paid: "Betaald",
  overdue: "Te laat",
  cancelled: "Geannuleerd",
  credited: "Gecrediteerd",
};

export function withVat(exVat: number): { vat: number; total: number } {
  const vat = Math.round(exVat * VAT_RATE * 100) / 100;
  return { vat, total: Math.round((exVat + vat) * 100) / 100 };
}
