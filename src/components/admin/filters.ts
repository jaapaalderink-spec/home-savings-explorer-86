/** Gedeelde filterstate voor het admin-dashboard (client-safe). */
export type LeadFilters = {
  category?: string | undefined;
  state?: "new" | "assigned" | "underfilled" | "cancelled" | undefined;
  days?: number | undefined;
};

export const STATE_LABEL: Record<string, string> = {
  new: "Nieuw",
  assigned: "Verdeeld",
  underfilled: "Onderbezet",
  cancelled: "Geannuleerd",
};

export const PERIODS = [
  { days: undefined, label: "Alles" },
  { days: 7, label: "7 dagen" },
  { days: 30, label: "30 dagen" },
  { days: 90, label: "90 dagen" },
] as const;
