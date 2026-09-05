/** Gedeelde filterstate voor het admin-dashboard (client-safe). */
export type LeadFilters = {
  category?: string | undefined;
  state?: "new" | "assigned" | "underfilled" | "cancelled" | undefined;
  days?: number | undefined;
  risk?: "review" | "duplicate" | "blocked" | undefined;
};

/** Kwaliteitsfilters voor de leadlijst. */
export const RISK_LABEL: Record<string, string> = {
  review: "Te beoordelen",
  duplicate: "Dubbel",
  blocked: "Geblokkeerd",
};

export const RISK_SIGNAL_LABEL: Record<string, string> = {
  identical_request: "identieke aanvraag",
  recent_phone_duplicate: "zelfde telefoonnummer",
  recent_email_duplicate: "zelfde e-mailadres",
  recent_address_duplicate: "zelfde adres",
  submission_velocity: "veel aanvragen kort na elkaar",
  verification_failures: "mislukte verificaties",
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
