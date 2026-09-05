import { createFileRoute } from "@tanstack/react-router";

/**
 * Mollie-webhook. Mollie stuurt alleen een betaalkenmerk; status en bedrag
 * halen we altijd zelf op bij Mollie. De body kan dus nooit "betaald" faken.
 */
export const Route = createFileRoute("/api/public/mollie-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let paymentId: string | null = null;
        try {
          const raw = await request.text();
          const params = new URLSearchParams(raw);
          paymentId = params.get("id");
          if (!paymentId && raw.trim().startsWith("{")) {
            paymentId = (JSON.parse(raw) as { id?: string }).id ?? null;
          }
        } catch {
          paymentId = null;
        }

        if (!paymentId) return new Response("bad request", { status: 400 });

        const { processMollieWebhook } = await import("@/lib/payments.server");
        const result = await processMollieWebhook(paymentId);
        if (!result.ok) return new Response("bad request", { status: 400 });
        return new Response("ok", { status: 200 });
      },
    },
  },
});
