/** Server-only CRM-gegevens per bedrijf (gedeeld door partner en beheer-voorbeeldweergave). */
import { adminDb } from "@/lib/partner-util";
import { productStats, type CrmRow } from "@/lib/crm-policy";
import type { LeadStatus } from "@/lib/lead-status-policy";

type Db = Awaited<ReturnType<typeof adminDb>>;

/** Producten van een toewijzing: gebundelde producten, anders de categorieën van de aanvraag. */
export function purchaseProducts(p: { products?: string[] | null; lead?: unknown }): string[] {
  if (p.products && p.products.length > 0) return p.products;
  const cats = (p.lead as { categories?: string[] } | null)?.categories;
  return cats && cats.length > 0 ? cats : ["algemeen"];
}

/** CRM-regels per product voor een set toewijzingen; ontbrekende producten krijgen de toewijzingsstatus. */
export async function loadProductCrm(
  db: Db,
  purchases: Array<{ id: string; status: string; products?: string[] | null; lead?: unknown }>,
) {
  const ids = purchases.map((p) => p.id);
  if (ids.length === 0) return new Map<string, ProductCrm[]>();
  const [{ data: crm }, { data: quotes }] = await Promise.all([
    db.from("purchase_product_crm").select("purchase_id, category, status, follow_up_date, lost_reason").in("purchase_id", ids),
    db
      .from("purchase_quotes")
      .select("purchase_id, category, version, amount_ex_vat, note, created_at")
      .in("purchase_id", ids)
      .order("version", { ascending: false }),
  ]);
  const result = new Map<string, ProductCrm[]>();
  for (const p of purchases) {
    result.set(
      p.id,
      purchaseProducts(p).map((category) => {
        const row = crm?.find((c) => c.purchase_id === p.id && c.category === category);
        const q = (quotes ?? []).filter((x) => x.purchase_id === p.id && x.category === category);
        return {
          category,
          status: (row?.status ?? p.status) as LeadStatus,
          followUpDate: row?.follow_up_date ?? null,
          lostReason: row?.lost_reason ?? null,
          quotes: q.map((x) => ({
            version: x.version,
            amount: Number(x.amount_ex_vat),
            note: x.note,
            createdAt: x.created_at,
          })),
        };
      }),
    );
  }
  return result;
}

export type ProductCrm = {
  category: string;
  status: LeadStatus;
  followUpDate: string | null;
  lostReason: string | null;
  quotes: Array<{ version: number; amount: number; note: string | null; createdAt: string }>;
};

/** Statistiek per product voor een bedrijf over de laatste `days` dagen. */
export async function companyCrmStats(db: Db, companyId: string, days: number, category?: string) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: purchases } = await db
    .from("lead_purchases")
    .select("id, status, products, lead:leads(categories)")
    .eq("company_id", companyId)
    .gte("created_at", since);
  const crm = await loadProductCrm(db, purchases ?? []);
  const rows: CrmRow[] = [];
  crm.forEach((list) =>
    list.forEach((r) => {
      if (category && r.category !== category) return;
      rows.push({ category: r.category, status: r.status, quoteAmount: r.quotes[0]?.amount ?? null });
    }),
  );
  return { days, products: productStats(rows) };
}
