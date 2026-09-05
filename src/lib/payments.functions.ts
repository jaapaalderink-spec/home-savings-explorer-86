import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";

/** Mag deze gebruiker bij deze factuur? Eigen bedrijf of platformbeheer. */
async function authorizeInvoice(userId: string, invoiceId: string) {
  const db = await adminDb();
  const [{ data: profile }, { data: isAdmin }, { data: invoice }] = await Promise.all([
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    db.rpc("has_role", { _user_id: userId, _role: "admin" }),
    db.from("invoices").select("id, company_id").eq("id", invoiceId).maybeSingle(),
  ]);
  if (!invoice) throw new Error("Factuur niet gevonden.");
  if (!isAdmin && (!profile?.company_id || profile.company_id !== invoice.company_id)) {
    throw new Error("Geen toegang tot deze factuur.");
  }
  return invoice;
}

const ERROR_TEXT: Record<string, string> = {
  already_paid: "Deze factuur is al betaald.",
  invoice_not_payable: "Deze factuur kan niet betaald worden.",
  zero_amount: "Deze factuur heeft geen openstaand bedrag.",
  MOLLIE_NOT_CONFIGURED: "Betalen is nog niet ingeschakeld. Neem contact op met support.",
  MOLLIE_UNAVAILABLE: "De betaaldienst is tijdelijk niet bereikbaar. Probeer het zo opnieuw.",
  INVOICE_NOT_FOUND: "Factuur niet gevonden.",
};

/** Start (of hervat) de betaling van een eigen factuur en geeft de betaallink terug. */
export const createInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await authorizeInvoice(context.userId, data.invoiceId);
    const { startInvoicePayment } = await import("@/lib/payments.server");
    const origin =
      process.env["APP_URL"] ??
      getRequestHeader("origin") ??
      (getRequestHeader("host") ? `https://${getRequestHeader("host")}` : "http://localhost:8080");
    try {
      const result = await startInvoicePayment({ invoiceId: data.invoiceId, origin });
      return { ok: true as const, ...result };
    } catch (error) {
      const key = (error as Error).message;
      throw new Error(ERROR_TEXT[key] ?? "Betaling kon niet gestart worden.");
    }
  });

/** Gezaghebbende betaalstatus ophalen (bijvoorbeeld na terugkeer van Mollie). */
export const refreshInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await authorizeInvoice(context.userId, data.invoiceId);
    const { invoicePaymentState, syncPayment } = await import("@/lib/payments.server");
    const state = await invoicePaymentState(data.invoiceId);
    const latest = state.attempts[0];
    if (latest && latest.status !== "paid") {
      await syncPayment(latest.provider_payment_id as string);
      return invoicePaymentState(data.invoiceId);
    }
    return state;
  });
