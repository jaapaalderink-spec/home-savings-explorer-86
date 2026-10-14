import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listJobs, retryJob } from "@/lib/jobs.functions";

const panel = { boxShadow: "var(--shadow-panel)" };
const KIND: Record<string, string> = { distribute_lead: "Aanvraag verdelen" };

export function BackgroundJobs() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["jobs"], queryFn: () => listJobs() });
  const run = useMutation({
    mutationFn: (id: string) => retryJob({ data: { id } }),
    onSuccess: (r) => {
      toast[r.ok ? "success" : "error"](r.ok ? "Taak uitgevoerd." : "Opnieuw mislukt.");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl bg-background p-5" style={panel}>
      <h3 className="font-display text-lg font-bold text-ink">Achtergrondtaken</h3>
      <p className="mt-1 text-sm text-moss/70">
        Mislukte taken worden automatisch opnieuw geprobeerd (oplopende wachttijd, max. 5 keer).
        Daarna staan ze hier op "Mislukt" voor handmatig herstel.
      </p>
      {isLoading ? (
        <p className="mt-4 text-sm text-moss/70">Laden…</p>
      ) : !data?.length ? (
        <p className="mt-4 text-sm text-moss/70">Geen openstaande of mislukte taken.</p>
      ) : (
        <ul className="mt-3 divide-y divide-moss/10 text-sm">
          {data.map((j) => (
            <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <span className="font-semibold text-ink">{KIND[j.kind] ?? j.kind}</span>{" "}
                <span className="text-moss/70">
                  · {j.status === "failed" ? "Mislukt" : "Wacht op herpoging"} · poging {j.attempts}/
                  {j.max_attempts}
                </span>
                <span className="block text-xs text-moss/60">{j.last_error}</span>
              </div>
              <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(j.id)}>
                Nu opnieuw
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
