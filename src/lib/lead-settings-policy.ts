/**
 * Regels voor leadinstellingen per ontvanger en dienst. Puur, zodat de UI en de
 * server dezelfde totalen, gebiedscontroles en kostenraming gebruiken.
 */
import { SERVICE_CATEGORIES } from "@/lib/service-area-policy";

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** Kolomvolgorde van de tabel, zoals gevraagd. */
export const SETTINGS_COLUMNS: Array<{ category: ServiceCategory; label: string }> = [
  { category: "solar", label: "Zonnepanelen" },
  { category: "battery", label: "Thuisbatterijen" },
  { category: "heatpump", label: "Warmtepompen" },
  { category: "airco", label: "Airco’s" },
  { category: "ev", label: "Laadpalen" },
];

export type Area =
  | { mode: null }
  | { mode: "national" }
  | { mode: "provinces"; provinces: string[] }
  | { mode: "radius"; centerLat: number; centerLng: number; radiusKm: number; centerLabel?: string };

export type RecipientService = {
  category: ServiceCategory;
  enabled: boolean;
  monthlyMax: number;
  area: Area;
};

export type RecipientRow = { userId: string; paused: boolean; services: RecipientService[] };

export function isValidCount(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 10000;
}

/** Een uitgeschakelde dienst of gepauzeerde ontvanger levert geen plaatsen op. */
export function effectiveMax(row: RecipientRow, s: RecipientService): number {
  return s.enabled ? s.monthlyMax : 0;
}

export function rowTotal(row: RecipientRow): number {
  return row.services.reduce((t, s) => t + effectiveMax(row, s), 0);
}

export function columnTotals(rows: RecipientRow[]): Record<ServiceCategory, number> {
  const out = Object.fromEntries(SERVICE_CATEGORIES.map((c) => [c, 0])) as Record<
    ServiceCategory,
    number
  >;
  rows.forEach((r) => r.services.forEach((s) => (out[s.category] += effectiveMax(r, s))));
  return out;
}

/** Bedrijfstotaal = som van de interne aantallen; nooit een extra los quotum. */
export function companyTotal(rows: RecipientRow[]): number {
  return rows.reduce((t, r) => t + rowTotal(r), 0);
}

/** Resterend wordt nooit negatief; eerdere leveringen blijven gewoon staan. */
export function remaining(max: number, delivered: number): number {
  return Math.max(max - delivered, 0);
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

export type CompanyArea =
  | null
  | { mode: "national" }
  | { mode: "provinces"; provinces: string[] }
  | { mode: "radius"; centerLat: number; centerLng: number; radiusKm: number };

/**
 * Controleert of een ontvangergebied binnen het bedrijfsgebied valt.
 * Geeft null bij akkoord, anders een uitleg voor het hoofdaccount.
 */
export function areaProblem(company: CompanyArea, member: Area): string | null {
  if (member.mode === null) return null;
  if (!company)
    return "Stel eerst een bedrijfswerkgebied in voor deze dienst (tabblad Werkgebied).";
  if (company.mode === "national") return null;
  if (company.mode === "provinces") {
    if (member.mode !== "provinces")
      return "Het bedrijfsgebied bestaat uit provincies; kies voor deze ontvanger provincies of pas eerst het bedrijfsgebied aan.";
    const extra = member.provinces.filter((p) => !company.provinces.includes(p));
    return extra.length
      ? `Buiten het bedrijfsgebied: ${extra.join(", ")}. Voeg deze eerst toe aan het bedrijfsgebied.`
      : null;
  }
  if (member.mode !== "radius")
    return "Het bedrijfsgebied is een straal; kies een kleinere straal of pas eerst het bedrijfsgebied aan.";
  const d = haversineKm(company.centerLat, company.centerLng, member.centerLat, member.centerLng);
  return d + member.radiusKm <= company.radiusKm + 0.5
    ? null
    : "Deze straal valt (deels) buiten het bedrijfsgebied. Verklein de straal of vergroot eerst het bedrijfsgebied.";
}

export type CostTerms = {
  platformFee: number;
  seatFee: number;
  paidSeats: number;
  baseLeadPrice: number;
  extraProductPrice: number;
};

/** Standaardtarieven nieuwe contracten (excl. btw) als er geen contractversie is. */
export const DEFAULT_TERMS: Omit<CostTerms, "paidSeats"> = {
  platformFee: 25,
  seatFee: 15,
  baseLeadPrice: 15,
  extraProductPrice: 10,
};

const cents = (n: number) => Math.round(n * 100);

/** Raming bij volledige levering van de gewenste plaatsen; extra producten apart per stuk. */
export function estimateMonth(terms: CostTerms, slots: number) {
  const fixed = cents(terms.platformFee) + cents(terms.seatFee) * terms.paidSeats;
  const leads = cents(terms.baseLeadPrice) * slots;
  return {
    platform: terms.platformFee,
    seats: (cents(terms.seatFee) * terms.paidSeats) / 100,
    leads: leads / 100,
    total: (fixed + leads) / 100,
  };
}

export const ACHTERAF_TEXT =
  "Je ontvangt maandelijks achteraf een factuur. Niet-geleverde leads brengen we niet in rekening. De vaste platformkosten en eventuele accountmanagerkosten blijven gelden.";
