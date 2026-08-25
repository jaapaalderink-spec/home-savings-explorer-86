import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { listPlatformOverview } from "@/lib/partner.functions";
import { formatEuro } from "@/lib/home-savings";

export function AdminOverview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform"],
    queryFn: () => listPlatformOverview(),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (error || !data) {
    return (
      <p className="rounded-2xl bg-background p-6 text-sm text-moss/70" style={{ boxShadow: "var(--shadow-panel)" }}>
        Alleen platformbeheerders zien dit overzicht.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Leads totaal", value: String(data.totalLeads) },
          { label: "Partners", value: String(data.companies.length) },
          {
            label: "Leadomzet",
            value: formatEuro(data.companies.reduce((s, c) => s + c.revenue, 0)),
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
            <p className="text-xs font-medium uppercase tracking-wide text-moss/60">{kpi.label}</p>
            <p className="mt-1 text-2xl font-bold text-ink">{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl bg-background" style={{ boxShadow: "var(--shadow-panel)" }}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-moss/60">
            <tr>
              <th className="p-4">Bedrijf</th>
              <th className="p-4">Abonnement</th>
              <th className="p-4">Limiet p/m</th>
              <th className="p-4">Ingekocht</th>
              <th className="p-4">Omzet</th>
            </tr>
          </thead>
          <tbody>
            {data.companies.map((c) => (
              <tr key={c.id} className="border-t border-moss/10">
                <td className="p-4 font-semibold text-ink">{c.name}</td>
                <td className="p-4 text-moss/80">{c.plan_name}</td>
                <td className="p-4 text-moss/80">{c.monthly_lead_limit}</td>
                <td className="p-4 text-moss/80">{c.purchased}</td>
                <td className="p-4 font-semibold text-leaf">{formatEuro(c.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
