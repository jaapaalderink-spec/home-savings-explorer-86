import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { searchCompanies } from "@/lib/contracts.functions";
import { adminPreviewCompany } from "@/lib/crm.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { STATUS_LABEL, type LeadStatus } from "@/lib/lead-status-policy";
import { CONVERSION_NOTE, PERIODS, StatsTable } from "@/components/dashboard/CrmStats";

/** Alleen-lezen weergave van wat een installateur ziet. Elke opening wordt vastgelegd in de audittrail. */
export function CompanyPreview() {
  const [q, setQ] = useState("");
  const [days, setDays] = useState(90);
  const companies = useQuery({ queryKey: ["preview-search", q], queryFn: () => searchCompanies({ data: { q } }) });
  const preview = useMutation({
    mutationFn: (companyId: string) => adminPreviewCompany({ data: { companyId, days } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const r = preview.data;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
        <h2 className="font-display text-lg font-bold text-ink">Voorbeeldweergave installateur</h2>
        <p className="mt-1 text-sm text-moss/70">
          Bekijk alleen-lezen de aanvragen en resultaten van een bedrijf, zonder in te loggen als dat bedrijf. Elke opening wordt gelogd.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek bedrijf…" className="min-h-10 flex-1 rounded-full border border-moss/20 bg-background px-4 text-sm" />
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-h-10 rounded-full border border-moss/20 bg-background px-3 text-sm">
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                Laatste {d} dagen
              </option>
            ))}
          </select>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {(companies.data ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => preview.mutate(c.id)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-moss/20 px-3 text-xs font-semibold text-moss hover:bg-moss/10"
              >
                <Eye size={13} /> {c.name}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {preview.isPending && <p className="text-sm text-moss/60">Laden…</p>}
      {r && (
        <section className="space-y-4 rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-ink">{r.company.name}</h3>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-moss">Alleen lezen</span>
          </div>
          <StatsTable products={r.stats.products} />
          <p className="text-xs text-moss/60">{CONVERSION_NOTE}</p>
          <h4 className="text-sm font-bold text-ink">Laatste 50 aanvragen</h4>
          <ul className="divide-y divide-moss/10 text-sm">
            {r.leads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="w-24 text-xs text-moss/70">{new Date(l.createdAt).toLocaleDateString("nl-NL")}</span>
                <span className="font-semibold text-ink">{l.name}</span>
                <span className="text-xs text-moss/70">{l.place}</span>
                <span className="ml-auto flex flex-wrap gap-1">
                  {l.products.map((p) => (
                    <span key={p.category} className="rounded-full bg-muted px-2 py-0.5 text-xs text-moss">
                      {CATEGORY_LABEL[p.category] ?? p.category}: {STATUS_LABEL[p.status as LeadStatus]}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
