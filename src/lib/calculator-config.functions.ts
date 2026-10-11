import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  tariffSetSchema,
  validateOverrides,
  defaultValue,
} from "@/lib/home-savings/calculator-settings";

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Alleen platformbeheerders kunnen calculatorinstellingen beheren.");
}

const COLS = "id, version, status, values, tariff_sets, note, updated_at, published_at";

/** Draft, published version and recent change history for the admin screen. */
export const getCalculatorConfigAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const [draft, published, history] = await Promise.all([
      db.from("calculator_config_versions").select(COLS).eq("status", "draft").maybeSingle(),
      db.from("calculator_config_versions").select(COLS).eq("status", "published").maybeSingle(),
      db
        .from("calculator_config_changes")
        .select("id, setting_key, action, old_value, new_value, changed_by, changed_at, version:calculator_config_versions(version)")
        .order("changed_at", { ascending: false })
        .limit(100),
    ]);
    const ids = [...new Set((history.data ?? []).map((h) => h.changed_by).filter(Boolean))] as string[];
    const { data: people } = ids.length
      ? await db.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
    const name = Object.fromEntries(
      (people ?? []).map((p: { id: string; full_name?: string | null; email?: string | null }) => [
        p.id,
        p.full_name || p.email || "Beheerder",
      ]),
    );
    return {
      draft: draft.data,
      published: published.data,
      history: (history.data ?? []).map((h) => ({ ...h, who: name[h.changed_by ?? ""] ?? "Beheerder" })),
    };
  });

const saveSchema = z.object({
  values: z.record(z.string().max(120), z.union([z.number(), z.boolean(), z.string().max(40), z.array(z.number()).max(24)])),
  tariffSets: z.array(tariffSetSchema).max(200),
  resetKeys: z.array(z.string().max(120)).max(200).optional().default([]),
});

/** Saves the draft (never live). Invalid values are rejected server-side. */
export const saveCalculatorDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const errors = validateOverrides(data.values);
    if (Object.keys(errors).length)
      throw new Error(`Ongeldige waarden: ${Object.entries(errors).map(([k, v]) => `${k}: ${v}`).join("; ")}`);
    // Only store values that differ from the code default.
    const values = Object.fromEntries(
      Object.entries(data.values).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(defaultValue(k))),
    );
    const db = context.supabase;
    const { data: existing } = await db
      .from("calculator_config_versions")
      .select("id, values, tariff_sets")
      .eq("status", "draft")
      .maybeSingle();
    let base = existing;
    if (!base) {
      const { data: pub } = await db
        .from("calculator_config_versions")
        .select("values, tariff_sets")
        .eq("status", "published")
        .maybeSingle();
      const { data: created, error } = await db
        .from("calculator_config_versions")
        .insert({
          status: "draft",
          values: pub?.values ?? {},
          tariff_sets: pub?.tariff_sets ?? [],
          created_by: context.userId,
        })
        .select("id, values, tariff_sets")
        .single();
      if (error) throw new Error(error.message);
      base = created;
    }
    const before = (base!.values ?? {}) as Record<string, unknown>;
    const keys = new Set([...Object.keys(before), ...Object.keys(values)]);
    const changes = [...keys]
      .filter((k) => JSON.stringify(before[k] ?? defaultValue(k)) !== JSON.stringify(values[k] ?? defaultValue(k)))
      .map((k) => ({
        version_id: base!.id,
        setting_key: k,
        action: data.resetKeys.includes(k) ? "reset" : "change",
        old_value: (before[k] ?? defaultValue(k)) as never,
        new_value: (values[k] ?? defaultValue(k)) as never,
        changed_by: context.userId,
      }));
    if (JSON.stringify(base!.tariff_sets) !== JSON.stringify(data.tariffSets))
      changes.push({
        version_id: base!.id,
        setting_key: "tariffSets",
        action: "change",
        old_value: base!.tariff_sets as never,
        new_value: data.tariffSets as never,
        changed_by: context.userId,
      });
    const { error } = await db
      .from("calculator_config_versions")
      .update({
        values,
        tariff_sets: data.tariffSets,
        updated_at: new Date().toISOString(),
        updated_by: context.userId,
      })
      .eq("id", base!.id);
    if (error) throw new Error(error.message);
    if (changes.length) {
      const { error: e2 } = await db.from("calculator_config_changes").insert(changes);
      if (e2) throw new Error(e2.message);
    }
    return { ok: true, changed: changes.length };
  });

/** Publishes the current draft; only then do consumers see the new values. */
export const publishCalculatorDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = context.supabase;
    const { data: draft } = await db
      .from("calculator_config_versions")
      .select("id, values, tariff_sets")
      .eq("status", "draft")
      .maybeSingle();
    if (!draft) throw new Error("Er is geen concept om te publiceren. Sla eerst wijzigingen op.");
    const errors = validateOverrides((draft.values ?? {}) as Record<string, unknown>);
    if (Object.keys(errors).length) throw new Error("Het concept bevat ongeldige waarden.");
    const { data: version, error } = await db.rpc("publish_calculator_config", { _id: draft.id });
    if (error) throw new Error(error.message);
    return { version: version as number };
  });
