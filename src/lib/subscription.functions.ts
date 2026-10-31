import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";
import {
  BUNDLES,
  earliestStopMonth,
  terminationSettlement,
  type BillingMode,
  type BundleSize,
  type PackageCode,
} from "@/lib/package-policy";

const amsterdamToday = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

async function ownerContext(userId: string) {
  const db = await adminDb();
  const [{ data: isOwner }, { data: profile }] = await Promise.all([
    db.rpc("has_role", { _user_id: userId, _role: "owner" }),
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
  ]);
  if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
  if (!isOwner) throw new Error("Alleen de eigenaar kan het abonnement beheren.");
  return { db, companyId: profile.company_id };
}

type Db = Awaited<ReturnType<typeof adminDb>>;

async function loadState(db: Db, companyId: string) {
  const today = amsterdamToday();
  const month = today.slice(0, 8) + "01";
  const [{ data: versions }, { data: bundles }, { data: term }] = await Promise.all([
    db.from("subscription_versions").select("*").eq("company_id", companyId).order("valid_from", { ascending: true }),
    db.from("lead_bundles").select("id, size, unit_price_ex_vat, period_start, created_at").eq("company_id", companyId).eq("period_start", month).order("created_at"),
    db.from("contract_terminations").select("*").eq("company_id", companyId).eq("status", "confirmed").maybeSingle(),
  ]);
  const all = versions ?? [];
  const active = [...all].reverse().find((v) => v.valid_from <= today) ?? null;
  // Start van de huidige pakketlooptijd: eerste aaneengesloten versie met hetzelfde pakket.
  let contractStart: string | null = null;
  if (active?.package_code) {
    contractStart = active.valid_from;
    for (const v of [...all].reverse()) {
      if (v.valid_from > active.valid_from) continue;
      if (v.package_code) contractStart = v.valid_from;
      else break;
    }
  }
  const ids = (bundles ?? []).map((b) => b.id);
  const { data: used } = ids.length
    ? await db.from("lead_purchases").select("bundle_id").in("bundle_id", ids)
    : { data: [] as Array<{ bundle_id: string | null }> };
  return {
    today,
    active,
    contractStart,
    bundles: (bundles ?? []).map((b) => ({
      ...b,
      delivered: (used ?? []).filter((u) => u.bundle_id === b.id).length,
    })),
    termination: term ?? null,
  };
}

function settlementFor(state: Awaited<ReturnType<typeof loadState>>, stopMonth: string) {
  const a = state.active;
  if (!a?.package_code || !state.contractStart) return null;
  return terminationSettlement({
    mode: a.billing_mode as BillingMode,
    code: a.package_code as PackageCode,
    paidSeats: a.paid_seats,
    contractStart: state.contractStart,
    stopMonth,
    minTermMonths: a.min_term_months,
  });
}

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, companyId } = await ownerContext(context.userId);
    const state = await loadState(db, companyId);
    const earliest = earliestStopMonth(state.today, state.active?.notice_months ?? 1);
    return { ...state, earliestStop: earliest, preview: settlementFor(state, earliest) };
  });

export const previewTermination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ stopMonth: z.string().regex(/^\d{4}-\d{2}-01$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, companyId } = await ownerContext(context.userId);
    const state = await loadState(db, companyId);
    if (data.stopMonth < earliestStopMonth(state.today, state.active?.notice_months ?? 1))
      throw new Error("Deze maand valt binnen de opzegtermijn.");
    return settlementFor(state, data.stopMonth);
  });

export const confirmTermination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ stopMonth: z.string().regex(/^\d{4}-\d{2}-01$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, companyId } = await ownerContext(context.userId);
    const state = await loadState(db, companyId);
    if (state.termination) throw new Error("Er loopt al een opzegging.");
    if (data.stopMonth < earliestStopMonth(state.today, state.active?.notice_months ?? 1))
      throw new Error("Deze maand valt binnen de opzegtermijn.");
    const s = settlementFor(state, data.stopMonth) ?? { remainingMonths: 0, monthly: 0, total: 0 };
    const { error } = await db.from("contract_terminations").insert({
      company_id: companyId,
      subscription_version_id: state.active?.id ?? null,
      effective_month: data.stopMonth,
      billing_mode: state.active?.billing_mode ?? "actual_delivered",
      remaining_months: s.remainingMonths,
      monthly_ex_vat: s.monthly,
      settlement_ex_vat: s.total,
      requested_by: context.userId,
    });
    if (error) throw new Error(error.code === "23505" ? "Er loopt al een opzegging." : "Opzeggen is mislukt.");
    await db.rpc("log_audit_event_api", {
      p_event: "COMPANY_COMMERCIAL_SETTINGS_UPDATED", p_entity: "company", p_entity_id: companyId,
      p_company: companyId, p_actor: context.userId, p_source: "partner",
      p_metadata: { termination: { stopMonth: data.stopMonth, settlement: s } },
    } as never);
    return s;
  });

export const withdrawTermination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { db, companyId } = await ownerContext(context.userId);
    const today = amsterdamToday();
    const { data: term } = await db.from("contract_terminations").select("id, effective_month, invoice_id")
      .eq("company_id", companyId).eq("status", "confirmed").maybeSingle();
    if (!term) throw new Error("Er is geen lopende opzegging.");
    if (term.invoice_id || term.effective_month <= today)
      throw new Error("Intrekken kan alleen vóór de laatste contractmaand begint.");
    await db.from("contract_terminations")
      .update({ status: "withdrawn", withdrawn_by: context.userId, withdrawn_at: new Date().toISOString() })
      .eq("id", term.id).eq("status", "confirmed");
    return { ok: true };
  });

export const buyLeadBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ size: z.union([z.literal(3), z.literal(5), z.literal(10)]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { db, companyId } = await ownerContext(context.userId);
    const state = await loadState(db, companyId);
    if (!state.active) throw new Error("Bundels zijn alleen beschikbaar met een actief contract.");
    const size = data.size as BundleSize;
    const { error } = await db.from("lead_bundles").insert({
      company_id: companyId,
      size,
      unit_price_ex_vat: BUNDLES[size],
      period_start: state.today.slice(0, 8) + "01",
      created_by: context.userId,
    });
    if (error) throw new Error("Bundel toevoegen is mislukt.");
    return { ok: true };
  });
