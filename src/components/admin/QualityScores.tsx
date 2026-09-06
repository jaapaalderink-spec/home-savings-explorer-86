/** Kwaliteitsoverzicht van alle partners — alleen zichtbaar voor beheer. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listQualityScores, recalculateQuality } from "@/lib/partner.functions";

type Row = {
  company_id: string;
  overall_score: number;
  response_score: number;
  complaint_score: number;
  engagement_score: number;
  conversion_score: number;
  sample_size: number;
  quality_warning: boolean;
  calculated_at: string;
  company?: { name?: string | null; active?: boolean | null } | null;
};

function scoreColor(v: number) {
  if (v >= 65) return "#2f7a4d";
  if (v >= 45) return "#8a6d1f";
  return "#a33a3a";
}

export function QualityScores() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["quality-scores"],
    queryFn: () => listQualityScores(),
  });

  const recalc = useMutation({
    mutationFn: () => recalculateQuality({ data: {} }),
    onSuccess: (res) => {
      toast.success(`Kwaliteitsscores bijgewerkt (${res.updated} bedrijven).`);
      queryClient.invalidateQueries({ queryKey: ["quality-scores"] });
    },
    onError: () => toast.error("Herberekenen is niet gelukt."),
  });

  const items = (data?.items ?? []) as unknown as Row[];

  return (
    <section className="rounded-3xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-ink">Kwaliteit van partners</h2>
          <p className="text-sm text-moss/70">
            Reactiesnelheid, reclamaties, opvolging en conversie — gewogen naar het aantal leads.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recalc.mutate()}
          disabled={recalc.isPending}
        >
          <RefreshCw size={14} className="mr-1.5" /> Herbereken
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-moss/70">Nog geen scores berekend.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-moss/60">
                <th className="py-2">Partner</th>
                <th className="py-2">Totaal</th>
                <th className="py-2">Reactie</th>
                <th className="py-2">Reclamaties</th>
                <th className="py-2">Opvolging</th>
                <th className="py-2">Conversie</th>
                <th className="py-2">Leads</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.company_id} className="border-t border-moss/10">
                  <td className="py-2 pr-3 font-medium text-ink">
                    <span className="inline-flex items-center gap-1.5">
                      {r.company?.name ?? "Onbekend"}
                      {r.quality_warning && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive"
                          title="Structureel zwakke prestaties — bekijk deze partner"
                        >
                          <AlertTriangle size={12} /> aandacht
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 font-bold" style={{ color: scoreColor(r.overall_score) }}>
                    {Math.round(r.overall_score)}
                  </td>
                  <td className="py-2 text-moss">{Math.round(r.response_score)}</td>
                  <td className="py-2 text-moss">{Math.round(r.complaint_score)}</td>
                  <td className="py-2 text-moss">{Math.round(r.engagement_score)}</td>
                  <td className="py-2 text-moss">{Math.round(r.conversion_score)}</td>
                  <td className="py-2 text-moss/70">{r.sample_size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
