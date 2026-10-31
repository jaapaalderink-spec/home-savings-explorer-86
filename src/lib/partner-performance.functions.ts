import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminRole } from "@/lib/admin-guard";
import { adminDb } from "@/lib/partner-util";
import { aggregatePerformance } from "@/lib/partner-performance-policy";

const input = z.object({
  period: z.enum(["month", "30d", "90d", "ytd", "all"]),
  product: z.enum(["all", "solar", "heatpump", "battery", "ev", "airco"]),
});

function since(period: string): string | null {
  const now = new Date();
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  if (period === "30d") return new Date(now.getTime() - 30 * 864e5).toISOString();
  if (period === "90d") return new Date(now.getTime() - 90 * 864e5).toISOString();
  if (period === "ytd") return new Date(now.getFullYear(), 0, 1).toISOString();
  return null;
}

async function inChunks<T>(ids: string[], fn: (chunk: string[]) => Promise<T[]>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 200) out.push(...(await fn(ids.slice(i, i + 200))));
  return out;
}

export const getPartnerPerformanceLeaderboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: isAdmin } = await adminRole(db, context.userId, context.claims);
    if (!isAdmin) throw new Error("Geen toegang");
    const from = since(data.period);
    let q = db.from("lead_purchases").select("id, company_id, products, contacted_within_48h").limit(10000);
    if (from) q = q.gte("created_at", from);
    const { data: purchases, error } = await q;
    if (error) throw new Error("Prestaties konden niet worden geladen");
    const ids = (purchases ?? []).map((p) => p.id);
    const [crm, quotes, appts, companies, scores] = await Promise.all([
      inChunks(ids, async (c) => (await db.from("purchase_product_crm").select("purchase_id, category, status, won_amount_ex_vat").in("purchase_id", c)).data ?? []),
      inChunks(ids, async (c) => (await db.from("purchase_quotes").select("purchase_id, category, amount_ex_vat, version").in("purchase_id", c)).data ?? []),
      inChunks(ids, async (c) => (await db.from("lead_appointments").select("purchase_id, category, status").in("purchase_id", c)).data ?? []),
      db.from("companies").select("id, name"),
      db.from("company_quality_scores").select("company_id, overall_score"),
    ]);
    const names = new Map((companies.data ?? []).map((c) => [c.id, c.name]));
    const score = new Map(((scores.data ?? [])).map((s) => [s.company_id, s.overall_score]));
    return aggregatePerformance(purchases ?? [], crm, quotes, appts, data.product).map((r) => ({
      ...r,
      name: names.get(r.company_id) ?? "Onbekend",
      quality: score.has(r.company_id) ? Math.round(Number(score.get(r.company_id))) : null,
    }));
  });
