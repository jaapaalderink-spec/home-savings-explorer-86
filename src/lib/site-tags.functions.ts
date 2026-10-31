import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminRole } from "@/lib/admin-guard";
import { adminDb } from "@/lib/partner-util";
import { normalizeTag, type SiteTags } from "@/lib/site-tags";

const EMPTY: SiteTags = {
  ga_measurement_id: null,
  gtm_container_id: null,
  ads_conversion_id: null,
  search_console_token: null,
};

export const getSiteTags = createServerFn({ method: "GET" }).handler(async (): Promise<SiteTags> => {
  try {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const db = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data } = await db
      .from("site_integrations")
      .select("ga_measurement_id, gtm_container_id, ads_conversion_id, search_console_token")
      .maybeSingle();
    return data ?? EMPTY;
  } catch {
    return EMPTY;
  }
});

export const saveSiteTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<keyof SiteTags, string>) => ({
    ga_measurement_id: normalizeTag("ga_measurement_id", String(d.ga_measurement_id ?? "")),
    gtm_container_id: normalizeTag("gtm_container_id", String(d.gtm_container_id ?? "")),
    ads_conversion_id: normalizeTag("ads_conversion_id", String(d.ads_conversion_id ?? "")),
    search_console_token: normalizeTag("search_console_token", String(d.search_console_token ?? "")),
  }))
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const { data: ok } = await adminRole(db, context.userId, context.claims);
    if (!ok) throw new Error("Alleen platformbeheerders.");
    const { error } = await db
      .from("site_integrations")
      .upsert({ id: true, ...data, updated_at: new Date().toISOString(), updated_by: context.userId });
    if (error) throw new Error("Opslaan mislukt.");
    return data;
  });
