import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { getPlatformStats } from "@/lib/admin.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";

export function PlatformStats() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: () => getPlatformStats(),
  });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error || !data) {
    return (
      <p className="rounded-2xl bg-background p-6 text-sm text-moss/70" style={{ boxShadow: "var(--shadow-panel)" }}>
        Alleen platformbeheerders zien deze cijfers.
      </p>
    );
  }

  const kpis = [
    { label: "Vandaag", value: String(data.leadsToday) },
    { label: "Deze week", value: String(data.leadsWeek) },
    { label: "Deze maand", value: String(data.leadsMonth) },
    { label: "Totaal aanvragen", value: String(data.leadsTotal) },
    { label: "Verdeelgraad", value: `${data.distributionRate}%` },
    { label: "Partners p/lead", value: String(data.avgPartnersPerLead) },
    { label: "Onderbezet", value: String(data.underfilled) },
    { label: "Actieve partners", value: String(data.activeCompanies) },
    { label: "Abonnementsomzet p/m", value: formatEuro(data.subscriptionRevenue) },
    { label: "Leadomzet", value: formatEuro(data.leadRevenue) },
    { label: "SLA-score", value: `${data.slaScore}/100` },
    { label: "Open reclamaties", value: String(data.openComplaints) },
  ];

  const categories = Object.entries(data.perCategory).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
            <p className="text-xs font-medium uppercase tracking-wide text-moss/60">{kpi.label}</p>
            <p className="mt-1 text-2xl font-bold text-ink">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
        <p className="text-sm font-semibold text-ink">Aanvragen per categorie</p>
        <div className="mt-3 space-y-2">
          {categories.length === 0 && <p className="text-sm text-moss/70">Nog geen aanvragen.</p>}
          {categories.map(([cat, count]) => {
            const max = categories[0]?.[1] ?? 1;
            return (
              <div key={cat} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs font-semibold text-moss">{CATEGORY_LABEL[cat] ?? cat}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, backgroundColor: "#4f8f62" }} />
                </div>
                <span className="w-8 text-right text-xs font-bold text-ink">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
