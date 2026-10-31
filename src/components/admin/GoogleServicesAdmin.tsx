import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getSiteTags, saveSiteTags } from "@/lib/site-tags.functions";
import type { SiteTags } from "@/lib/site-tags";

const FIELDS: Array<{ key: keyof SiteTags; label: string; hint: string; placeholder: string }> = [
  { key: "ga_measurement_id", label: "Google Analytics (GA4)", hint: "Meet-ID uit Analytics → Beheer → Gegevensstromen.", placeholder: "G-XXXXXXXXXX" },
  { key: "gtm_container_id", label: "Google Tag Manager", hint: "Container-ID rechtsboven in Tag Manager.", placeholder: "GTM-XXXXXXX" },
  { key: "ads_conversion_id", label: "Google Ads", hint: "Conversie-ID uit Ads → Doelen → Conversies → Tag instellen.", placeholder: "AW-123456789" },
  { key: "search_console_token", label: "Google Search Console", hint: "Kies 'HTML-tag' als verificatiemethode en plak de hele tag of alleen de code.", placeholder: '<meta name="google-site-verification" content="…" />' },
];

export function GoogleServicesAdmin() {
  const qc = useQueryClient();
  const load = useServerFn(getSiteTags);
  const save = useServerFn(saveSiteTags);
  const { data } = useQuery({ queryKey: ["site-tags"], queryFn: () => load() });
  const [form, setForm] = useState<Record<keyof SiteTags, string>>({
    ga_measurement_id: "", gtm_container_id: "", ads_conversion_id: "", search_console_token: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setForm({
      ga_measurement_id: data.ga_measurement_id ?? "",
      gtm_container_id: data.gtm_container_id ?? "",
      ads_conversion_id: data.ads_conversion_id ?? "",
      search_console_token: data.search_console_token ?? "",
    });
  }, [data]);

  async function onSave() {
    setBusy(true);
    try {
      await save({ data: form });
      await qc.invalidateQueries({ queryKey: ["site-tags"] });
      toast.success("Opgeslagen. Na publiceren staan de koppelingen op de live website.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Opslaan mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl bg-background p-5">
      <div>
        <h2 className="font-display text-xl font-bold text-ink">Google-koppelingen</h2>
        <p className="text-sm text-moss/70">
          Vul de ID's in; de website laadt ze automatisch. Laat leeg om een koppeling uit te zetten.
          Gebruik je Tag Manager voor Analytics/Ads, vul dan alleen Tag Manager in om dubbel meten te voorkomen.
        </p>
      </div>
      {FIELDS.map((f) => (
        <label key={f.key} className="block space-y-1">
          <span className="text-sm font-semibold text-ink">{f.label}</span>
          <input
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={form[f.key]}
            placeholder={f.placeholder}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
          />
          <span className="block text-xs text-moss/70">{f.hint}</span>
        </label>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={onSave}
        className="inline-flex min-h-11 items-center rounded-full bg-moss px-5 text-sm font-semibold text-cloud disabled:opacity-50"
      >
        {busy ? "Opslaan…" : "Opslaan"}
      </button>
    </section>
  );
}
