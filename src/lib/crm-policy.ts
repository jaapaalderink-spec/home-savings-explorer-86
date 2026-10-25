/** Zuivere CRM-regels per product: verliesredenen, totaalstatus en statistiek. */
import type { LeadStatus } from "@/lib/lead-status-policy";

export const LOST_REASONS = {
  price: "Te duur",
  competitor: "Gekozen voor concurrent",
  no_response: "Geen reactie meer",
  postponed: "Uitgesteld",
  not_suitable: "Woning niet geschikt",
  other: "Anders",
} as const;
export type LostReason = keyof typeof LOST_REASONS;

const RANK: Record<LeadStatus, number> = { new: 0, contacted: 1, quoted: 2, lost: 3, won: 4 };

/** Totaalstatus van een aanvraag: gewonnen als één product gewonnen is, verloren als alles verloren is. */
export function overallStatus(statuses: LeadStatus[]): LeadStatus {
  if (statuses.length === 0) return "new";
  if (statuses.includes("won")) return "won";
  if (statuses.every((s) => s === "lost")) return "lost";
  const open = statuses.filter((s) => s !== "lost");
  return open.reduce((best, s) => (RANK[s] > RANK[best] ? s : best), "new" as LeadStatus);
}

export type CrmRow = { category: string; status: LeadStatus; quoteAmount: number | null; wonAmount?: number | null };

export type ProductStats = {
  category: string;
  received: number;
  contacted: number;
  quoted: number;
  won: number;
  lost: number;
  open: number;
  /** Gewonnen ÷ ontvangen, in procenten. */
  conversion: number;
  /** Gewonnen ÷ (gewonnen + verloren), in procenten. */
  winRate: number;
  wonValue: number;
};

/**
 * Conversie = gewonnen ÷ ontvangen producten in de periode. Elke status vanaf
 * "Gebeld" telt mee als gecontacteerd; "Offerte" telt ook als het later gewonnen of verloren is
 * mits er een offerte is vastgelegd.
 */
export function productStats(rows: CrmRow[]): ProductStats[] {
  const by = new Map<string, CrmRow[]>();
  rows.forEach((r) => by.set(r.category, [...(by.get(r.category) ?? []), r]));
  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));
  return [...by.entries()]
    .map(([category, list]) => {
      const won = list.filter((r) => r.status === "won").length;
      const lost = list.filter((r) => r.status === "lost").length;
      return {
        category,
        received: list.length,
        contacted: list.filter((r) => r.status !== "new").length,
        quoted: list.filter((r) => r.status === "quoted" || r.quoteAmount !== null).length,
        won,
        lost,
        open: list.length - won - lost,
        conversion: pct(won, list.length),
        winRate: pct(won, won + lost),
        wonValue: list
          .filter((r) => r.status === "won")
          .reduce((s, r) => s + (r.wonAmount ?? 0), 0),
      };
    })
    .sort((a, b) => b.received - a.received);
}
