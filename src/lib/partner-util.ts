/** Server-side helpers voor partnerfuncties. Geen module-scope secrets. */

/** Service-role client; alleen binnen server handlers gebruiken. */
export async function adminDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Begin van de huidige maand (ISO). */
export function monthStart(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

/** Periode van een maand als YYYY-MM-DD datums. */
export function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    startIso: start.toISOString(),
    endIso: new Date(Date.UTC(year, month, 1)).toISOString(),
  };
}

/** Fisher-Yates shuffle voor eerlijke leadverdeling. */
export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Gemiddelde van een reeks getallen, afgerond. */
export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Percentage waar-waarden binnen een reeks. */
export function percentage(flags: Array<boolean | null | undefined>): number {
  const known = flags.filter((f) => f !== null && f !== undefined);
  if (known.length === 0) return 0;
  return Math.round((known.filter(Boolean).length / known.length) * 100);
}
