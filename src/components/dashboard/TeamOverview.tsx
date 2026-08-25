import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { listTeam } from "@/lib/partner.functions";
import { formatEuro } from "@/lib/home-savings";

const ROLE_LABEL: Record<string, string> = {
  admin: "Platformbeheerder",
  owner: "Eigenaar",
  account_manager: "Account manager",
};

export function TeamOverview({ joinCode }: { joinCode?: string | null }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["team"],
    queryFn: () => listTeam(),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (error) {
    return (
      <p className="rounded-2xl bg-background p-6 text-sm text-moss/70" style={{ boxShadow: "var(--shadow-panel)" }}>
        Alleen de bedrijfseigenaar heeft toegang tot het teamoverzicht.
      </p>
    );
  }

  const members = data?.members ?? [];
  const sla = data?.sla ?? { score: 0, opened24h: 0, contacted24h: 0, contacted48h: 0 };
  const totalSpend = members.reduce((s, m) => s + m.spend, 0);
  const totalWon = members.reduce((s, m) => s + m.won, 0);

  return (
    <div className="space-y-4">
      {joinCode && (
        <div className="rounded-2xl bg-background p-4 text-sm" style={{ boxShadow: "var(--shadow-panel)" }}>
          <p className="font-semibold text-ink">Account manager toevoegen</p>
          <p className="mt-1 text-moss/70">
            Laat je collega een account aanmaken en deze bedrijfscode invullen:{" "}
            <span className="rounded-md bg-muted px-2 py-1 font-mono font-bold text-ink">{joinCode}</span>
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Teamleden", value: String(members.length) },
          { label: "Gewonnen leads", value: String(totalWon) },
          { label: "Leadbesteding", value: formatEuro(totalSpend) },
          { label: "SLA-score", value: `${sla.score}/100` },
          { label: "Contact < 24u", value: `${sla.contacted24h}%` },
          { label: "Geopend", value: `${sla.opened24h}%` },
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
              <th className="p-4">Naam</th>
              <th className="p-4">Rol</th>
              <th className="p-4">Ingekocht</th>
              <th className="p-4">Gewonnen</th>
              <th className="p-4">Conversie</th>
              <th className="p-4">Besteding</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-moss/10">
                <td className="p-4">
                  <span className="font-semibold text-ink">{m.name}</span>
                  <span className="block text-xs text-moss/60">{m.email}</span>
                </td>
                <td className="p-4 text-moss/80">
                  {m.roles.map((r) => ROLE_LABEL[r] ?? r).join(", ") || "Account manager"}
                </td>
                <td className="p-4 text-moss/80">{m.purchased}</td>
                <td className="p-4 text-moss/80">{m.won}</td>
                <td className="p-4 font-semibold text-leaf">{m.conversion}%</td>
                <td className="p-4 text-moss/80">{formatEuro(m.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
