import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { listLeadPostcodes, listLeadsByRegion } from "@/lib/admin.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import type { LeadFilters } from "@/components/admin/filters";

const RegionMap = lazy(() => import("@/components/admin/RegionMap"));

export function RegionMapPanel({ filters }: { filters: LeadFilters }) {
  const payload = {
    data: {
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.days ? { days: filters.days } : {}),
    },
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-regions", filters],
    queryFn: () => listLeadsByRegion(payload),
  });

  const { data: postcodes } = useQuery({
    queryKey: ["admin-postcodes", filters],
    queryFn: () => listLeadPostcodes(payload),
  });

  if (isLoading) return <Skeleton className="h-[26rem] w-full rounded-2xl" />;
  if (error || !data) {
    return (
      <p
        className="rounded-2xl bg-background p-6 text-sm text-moss/70"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        Regio-data kon niet worden geladen.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ClientOnly fallback={<Skeleton className="h-[26rem] w-full rounded-2xl" />}>
        <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-2xl" />}>
          <RegionMap regions={data} postcodes={postcodes ?? []} />
        </Suspense>
      </ClientOnly>

      <div
        className="overflow-x-auto rounded-2xl bg-background"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-moss/60">
            <tr>
              <th className="p-4">Gebied</th>
              <th className="p-4">Aanvragen</th>
              <th className="p-4">Verdeeld</th>
              <th className="p-4">Partners</th>
              <th className="p-4">Zonder dekking</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-moss/70">
                  Nog geen aanvragen in deze selectie.
                </td>
              </tr>
            )}
            {data.map((r) => (
              <tr key={r.code} className="border-t border-moss/10">
                <td className="p-4 font-semibold text-ink">
                  {r.code} <span className="font-normal text-moss/70">{r.name}</span>
                </td>
                <td className="p-4 text-moss/80">{r.leads}</td>
                <td className="p-4 text-moss/80">{r.distributed}</td>
                <td className="p-4 text-moss/80">{r.partners}</td>
                <td className="p-4 text-xs text-moss/80">
                  {r.missingCategories.length === 0
                    ? "—"
                    : r.missingCategories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
