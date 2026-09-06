/** Eigen prestatieweergave voor een partner — geen vergelijking met concurrenten. */
import { useQuery } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyQualityScore } from "@/lib/partner.functions";

type Score = {
  response_score: number;
  complaint_score: number;
  engagement_score: number;
  conversion_score: number;
  sample_size: number;
  calculated_at: string;
};

const PARTS: Array<{ key: keyof Score; label: string; help: string }> = [
  {
    key: "response_score",
    label: "Reactiesnelheid",
    help: "Hoe snel je een nieuwe aanvraag voor het eerst belt of mailt.",
  },
  {
    key: "complaint_score",
    label: "Reclamaties",
    help: "Hoe vaak een aanvraag terecht is afgekeurd.",
  },
  {
    key: "engagement_score",
    label: "Opvolging",
    help: "Of je aanvragen opent, opvolgt en afrondt.",
  },
  {
    key: "conversion_score",
    label: "Conversie",
    help: "Hoeveel afgeronde aanvragen je wint.",
  },
];

export function MyPerformance() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-quality"],
    queryFn: () => getMyQualityScore(),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-3xl" />;

  const score = (data?.score ?? null) as Score | null;

  return (
    <section className="rounded-3xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
      <h2 className="font-display text-lg font-bold text-ink">Jouw prestaties</h2>
      <p className="mt-1 text-sm text-moss/70">
        Deze cijfers gaan alleen over je eigen aanvragen. Snel reageren en aanvragen netjes
        afronden helpt je het meest.
      </p>

      {!score ? (
        <p className="mt-4 text-sm text-moss/70">
          Zodra je je eerste aanvragen hebt opgevolgd, zie je hier je cijfers.
        </p>
      ) : (
        <>
          <div className="mt-4 space-y-4">
            {PARTS.map((p) => {
              const value = Math.round(Number(score[p.key] ?? 0));
              return (
                <div key={p.key}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-semibold text-ink">{p.label}</span>
                    <span className="text-sm font-bold text-moss">{value}</span>
                  </div>
                  <Progress value={value} className="mt-1.5 h-2" />
                  <p className="mt-1 text-xs text-moss/60">{p.help}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 border-t border-moss/10 pt-3 text-xs text-moss/60">
            Gebaseerd op {score.sample_size} aanvragen · bijgewerkt op{" "}
            {new Date(score.calculated_at).toLocaleDateString("nl-NL")}
          </p>
        </>
      )}
    </section>
  );
}
