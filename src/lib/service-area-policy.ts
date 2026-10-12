export const PROVINCES = [
  "Groningen",
  "Friesland",
  "Drenthe",
  "Overijssel",
  "Flevoland",
  "Gelderland",
  "Utrecht",
  "Noord-Holland",
  "Zuid-Holland",
  "Zeeland",
  "Noord-Brabant",
  "Limburg",
] as const;

export type AreaMode = "radius" | "provinces" | "national";

export const GAP_REASON_LABEL: Record<string, string> = {
  geen_aanbieder: "Geen aanbieder in dit gebied",
  product_inactief: "Aanbieders hebben dit product uitgezet",
  geen_capaciteit: "Aanbieders hebben geen capaciteit ingesteld",
  capaciteit_te_laag: "Vraag hoger dan de capaciteit",
};

/** Diensten die partners kunnen aanbieden (komen overeen met de calculator). */
export const SERVICE_CATEGORIES = ["solar", "heatpump", "battery", "ev", "airco"] as const;
