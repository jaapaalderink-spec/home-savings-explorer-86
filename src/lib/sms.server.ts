/** Server-only sms-verzending via Twilio. Nooit importeren in componenten. */

/**
 * Verstuurt een sms. Geeft true bij succes.
 * Credentials worden pas binnen de functie gelezen (server-side env injectie).
 */
export async function sendSms(to: string, body: string): Promise<void> {
  const sid = process.env["TWILIO_ACCOUNT_SID"];
  const token = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_FROM_NUMBER"];

  if (!sid || !token || !from) {
    console.error("sms: Twilio configuratie ontbreekt");
    throw new Error("De sms-dienst is nog niet geconfigureerd. Neem contact met ons op.");
  }

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    // Nooit de code of credentials loggen; alleen provider-status.
    const detail = await response.text().catch(() => "");
    console.error("sms: verzenden mislukt", response.status, detail.slice(0, 200));
    throw new Error("We konden geen sms versturen naar dit nummer. Controleer het nummer.");
  }
}

/** Tekst van de verificatie-sms. */
export function verificationSmsBody(code: string): string {
  return `Je verificatiecode voor Onafhankelijke-Offerte.nl is ${code}. De code is 10 minuten geldig.`;
}
