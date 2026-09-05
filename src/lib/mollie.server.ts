/**
 * Server-only Mollie-integratie. De API-sleutel wordt alleen hier gelezen en
 * verlaat nooit de server.
 */

export type MolliePayment = {
  id: string;
  status: string;
  amount: { value: string; currency: string };
  metadata?: Record<string, unknown> | null;
  paidAt?: string | null;
  expiresAt?: string | null;
  failedAt?: string | null;
  canceledAt?: string | null;
  _links?: { checkout?: { href?: string } };
};

const API = "https://api.mollie.com/v2";

function apiKey(): string {
  const key = process.env["MOLLIE_API_KEY"];
  if (!key) throw new Error("MOLLIE_NOT_CONFIGURED");
  return key;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    console.error("[mollie] netwerkfout", path, (error as Error).message);
    throw new Error("MOLLIE_UNAVAILABLE");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[mollie] api-fout", path, response.status, detail.slice(0, 300));
    if (response.status === 404) throw new Error("MOLLIE_PAYMENT_NOT_FOUND");
    throw new Error("MOLLIE_UNAVAILABLE");
  }
  const body = (await response.json().catch(() => null)) as T | null;
  if (!body) throw new Error("MOLLIE_INVALID_RESPONSE");
  return body;
}

/** Nieuwe betaling aanmaken; bedrag komt altijd uit de database. */
export async function createMolliePayment(input: {
  amountValue: string;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  invoiceId: string;
  invoiceNumber: string;
}): Promise<MolliePayment> {
  return call<MolliePayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: { currency: "EUR", value: input.amountValue },
      description: input.description,
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      metadata: { invoiceId: input.invoiceId, invoiceNumber: input.invoiceNumber },
    }),
  });
}

/** Gezaghebbende betaalgegevens ophalen bij Mollie. */
export async function getMolliePayment(paymentId: string): Promise<MolliePayment> {
  return call<MolliePayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

/** Is Mollie geconfigureerd? (Voor nette foutmeldingen in de interface.) */
export function mollieConfigured(): boolean {
  return Boolean(process.env["MOLLIE_API_KEY"]);
}
