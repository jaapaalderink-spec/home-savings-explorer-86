import { useEffect, useState } from "react";
import { applyOverrides } from "./calculator-settings";
import { configState } from "./config";

type Published = { version: number; values: unknown; tariff_sets: unknown } | null;

let loading: Promise<void> | null = null;

/** Reads the active published configuration (public read). Falls back to code defaults. */
export async function fetchPublishedConfig(): Promise<Published> {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase
      .from("calculator_config_versions")
      .select("version, values, tariff_sets")
      .eq("status", "published")
      .maybeSingle();
    return data ?? null;
  } catch {
    return null;
  }
}

export function loadPublishedConfig() {
  loading ??= fetchPublishedConfig().then((row) => {
    if (row)
      applyOverrides(row.values as Record<string, unknown>, {
        version: row.version,
        tariffSets: row.tariff_sets,
      });
  });
  return loading;
}

/** Activates the published config in the browser; returns a stamp that changes when applied. */
export function useCalculatorConfig() {
  const [stamp, setStamp] = useState(configState.stamp);
  useEffect(() => {
    let alive = true;
    loadPublishedConfig().then(() => alive && setStamp(configState.stamp));
    return () => {
      alive = false;
    };
  }, []);
  return { stamp, version: configState.publishedVersion };
}
