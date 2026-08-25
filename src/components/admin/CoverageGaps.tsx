import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { listCoverageGaps } from "@/lib/admin.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";

export function CoverageGaps() {
  const { data, isLoading } = useQuery({ queryKey: ["coverage-gaps"], queryFn: () => listCoverageGaps() });

  if (isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;

  return (
    <div className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <AlertTriangle size={16} style={{ color: "#f0b84f" }} /> Dekkingsgaten
      </p>
      <p className="mt-1 text-xs text-moss/70">
        Combinaties van gebied en categorie met aanvragen, maar zonder actieve partner.
      </p>
      {!data || data.length === 0 ? (
        <p className="mt-3 text-sm text-moss/70">Alle aanvragen hebben minstens één passende partner.</p>
      ) : (
        <ul className="mt-3 divide-y divide-moss/10">
          {data.slice(0, 25).map((g) => (
            <li key={`${g.region}-${g.category}`} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="font-semibold text-ink">
                {g.region} · {g.regionName}
              </span>
              <span className="text-moss/80">{CATEGORY_LABEL[g.category] ?? g.category}</span>
              <span className="text-xs text-moss/70">
                {g.leads} aanvragen · {g.undistributed} onverdeeld
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
