/**
 * Nederlandse telefoonnummers normaliseren naar E.164. Client-safe (geen secrets),
 * maar de server is altijd de bron van waarheid: normaliseer nooit alleen in de browser.
 */

/**
 * Zet een Nederlands mobiel nummer om naar E.164 (+316XXXXXXXX).
 * Geeft null terug bij een ongeldig of niet-mobiel nummer.
 */
export function normalizeDutchMobile(input: string): string | null {
  const digitsOnly = (input ?? "").replace(/[\s\-().\u00a0]/g, "");
  if (!/^\+?\d+$/.test(digitsOnly)) return null;

  let rest: string;
  if (digitsOnly.startsWith("+31")) rest = digitsOnly.slice(3);
  else if (digitsOnly.startsWith("0031")) rest = digitsOnly.slice(4);
  else if (digitsOnly.startsWith("31") && digitsOnly.length === 11) rest = digitsOnly.slice(2);
  else if (digitsOnly.startsWith("0")) rest = digitsOnly.slice(1);
  else rest = digitsOnly;

  // Mobiel in Nederland: netnummer 6 + 8 cijfers.
  if (!/^6\d{8}$/.test(rest)) return null;
  return `+31${rest}`;
}

/** Toont alleen de laatste vier cijfers, voor gebruik in de interface. */
export function maskPhone(e164: string): string {
  if (e164.length < 4) return "•••";
  return `${"•".repeat(Math.max(0, e164.length - 4))}${e164.slice(-4)}`;
}
