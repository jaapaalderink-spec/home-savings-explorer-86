import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminRole } from "@/lib/admin-guard";
import { adminDb } from "@/lib/partner-util";
import { invoiceAge } from "@/lib/dunning-policy";

async function assertAdmin(userId: string, claims: { aal?: unknown }) {
  const db = await adminDb();
  const { data: isAdmin } = await adminRole(db, userId, claims);
  if (!isAdmin) throw new Error("Alleen platformbeheerders.");
  return db;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());

/** Herinnering versturen; alleen als de factuur 14 dagen of langer onbetaald openstaat. */
export const sendInvoiceReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { data: inv } = await db
      .from("invoices")
      .select("id, company_id, invoice_number, created_at, due_date, total_inc_vat, amount_due_inc_vat, payment_status, status, reminder_count, company:companies(name, billing_email, contact_email)")
      .eq("id", data.invoiceId)
      .maybeSingle();
    if (!inv) throw new Error("Factuur niet gevonden.");
    const age = invoiceAge(inv.created_at, inv.due_date, today(), inv.payment_status === "paid");
    if (!age.reminderAllowed) throw new Error("Een herinnering kan pas na 14 dagen voor een onbetaalde factuur.");
    const company = inv.company as { name?: string; billing_email?: string | null; contact_email?: string | null } | null;
    const to = company?.billing_email || company?.contact_email;
    if (!to) throw new Error("Dit bedrijf heeft geen factuur- of contactadres.");
    const count = (inv.reminder_count ?? 0) + 1;
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
    await sendTemplateEmail("factuur-herinnering", to, {
      templateData: {
        companyName: company?.name,
        invoiceNumber: inv.invoice_number,
        amount: eur.format(Number(inv.amount_due_inc_vat ?? inv.total_inc_vat ?? 0)),
        dueDate: new Date(inv.due_date).toLocaleDateString("nl-NL"),
        daysOpen: age.daysOpen,
        invoicesUrl: `${process.env["VITE_APP_URL"] ?? "https://onafhankelijke-offerte.nl"}/facturen`,
      },
      idempotencyKey: `factuur-herinnering-${inv.id}-${count}`,
    });
    await db.from("invoices").update({ reminder_sent_at: new Date().toISOString(), reminder_count: count }).eq("id", inv.id);
    await db.rpc("sync_company_payment_suspension", { p_company_id: inv.company_id });
    return { ok: true, to };
  });

/** Bankoverschrijving afboeken; heractiveert het account automatisch als er minder dan 2 vervallen facturen over zijn. */
export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    const { data: result, error } = await db.rpc("mark_invoice_paid_manually", { p_invoice_id: data.invoiceId, p_admin: context.userId });
    if (error) throw new Error("Afboeken mislukt. Probeer het opnieuw.");
    const text: Record<string, string> = { already_paid: "Deze factuur is al betaald.", not_payable: "Deze factuur kan niet afgeboekt worden.", not_found: "Factuur niet gevonden." };
    if (result !== "ok") throw new Error(text[result as string] ?? "Afboeken mislukt.");
    return { ok: true };
  });

/** Werkt pauzes bij op basis van vandaag (vervaldatums verlopen ook zonder wijziging). */
export const syncPaymentSuspensions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId, context.claims);
    await db.rpc("sync_all_payment_suspensions");
    return { ok: true };
  });
