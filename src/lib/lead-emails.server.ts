/**
 * Server-only e-mails rond leadtoewijzing. Mails mogen de verdeling nooit
 * blokkeren: elke fout wordt gelogd en geslikt. Idempotentsleutels voorkomen
 * dubbele verzending bij nieuwe pogingen.
 */
import { adminDb } from "@/lib/partner-util";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";

const categoryLabels = (cats: string[]) =>
  cats.map((c) => CATEGORY_LABEL[c] ?? c).join(", ");

const dashboardUrl = () =>
  `${process.env["VITE_APP_URL"] ?? "https://onafhankelijke-offerte.nl"}/dashboard`;

/** Bevestiging aan de particulier zodra de aanvraag (na telefoonverificatie) binnen is. */
export async function sendLeadReceivedEmail(leadId: string): Promise<void> {
  try {
    const db = await adminDb();
    const { data: lead } = await db
      .from("leads")
      .select("id, first_name, email, categories, city")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead?.email) return;
    await sendTemplateEmail("lead-ontvangen", lead.email, {
      templateData: {
        firstName: lead.first_name,
        categories: categoryLabels(lead.categories ?? []),
        city: lead.city ?? "",
      },
      idempotencyKey: `lead-ontvangen-${leadId}`,
    });
  } catch (error) {
    console.error("sendLeadReceivedEmail failed", error);
  }
}

interface CompanyContact {
  id: string;
  name: string;
  address: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  billing_email: string | null;
}

/**
 * Koppelingsmail aan de particulier (bedrijfsnaam + contactgegevens + website)
 * en een nieuwe-lead-melding aan elke nieuw gekoppelde installateur.
 */
export async function sendLeadMatchedEmails(
  leadId: string,
  companyIds: string[],
): Promise<void> {
  if (companyIds.length === 0) return;
  try {
    const db = await adminDb();
    const [{ data: lead }, { data: companies }] = await Promise.all([
      db
        .from("leads")
        .select("id, first_name, email, categories, city, postcode")
        .eq("id", leadId)
        .maybeSingle(),
      db
        .from("companies")
        .select("id, name, address, contact_email, contact_phone, website, billing_email")
        .in("id", companyIds),
    ]);
    const list = (companies ?? []) as unknown as CompanyContact[];
    if (!lead?.email || list.length === 0) return;

    const categories = categoryLabels(lead.categories ?? []);

    await sendTemplateEmail("lead-gekoppeld", lead.email, {
      templateData: {
        firstName: lead.first_name,
        categories,
        companies: list.map((c) => ({
          name: c.name,
          address: c.address,
          contactEmail: c.contact_email ?? c.billing_email,
          contactPhone: c.contact_phone,
          website: c.website,
        })),
      },
      idempotencyKey: `lead-gekoppeld-${leadId}-${[...companyIds].sort().join("-")}`,
    });

    for (const c of list) {
      const to = c.contact_email ?? c.billing_email;
      if (!to) continue;
      await sendTemplateEmail("nieuwe-lead", to, {
        templateData: {
          companyName: c.name,
          categories,
          city: lead.city ?? "",
          postcode: lead.postcode ?? "",
          dashboardUrl: dashboardUrl(),
        },
        idempotencyKey: `nieuwe-lead-${leadId}-${c.id}`,
      });
    }
  } catch (error) {
    console.error("sendLeadMatchedEmails failed", error);
  }
}
