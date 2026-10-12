import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  assignLeadManually,
  getAllocationQueue,
  getEligibleForLead,
  runAllocationRetry,
} from "@/lib/contracts.functions";
import { FULFILLMENT_LABEL, type FulfillmentStatus } from "@/lib/lead-planner";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";

const panel = { boxShadow: "var(--shadow-panel)" };
const fmt = (d: string) =>
  new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });

export function AllocationQueue() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["allocation-queue"],
    queryFn: () => getAllocationQueue(),
  });
  const [open, setOpen] = useState<string | null>(null);
  const retry = useMutation({
    mutationFn: () => runAllocationRetry(),
    onSuccess: (r) => {
      toast.success(`${r.retried} aanvragen opnieuw geprobeerd, ${r.assigned} toewijzingen.`);
      qc.invalidateQueries({ queryKey: ["allocation-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {(["complete", "partial", "waiting", "undeliverable"] as FulfillmentStatus[]).map((s) => (
          <span key={s} className="rounded-full bg-background px-3 py-1 text-sm" style={panel}>
            {FULFILLMENT_LABEL[s]}: <strong>{data?.totals[s] ?? 0}</strong>
          </span>
        ))}
        <Button variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>
          Nu opnieuw proberen
        </Button>
      </div>
      <p className="text-sm text-moss/70">
        Wachtende en gedeeltelijk geleverde aanvragen worden elk uur opnieuw geprobeerd, tot 30
        dagen na binnenkomst.
      </p>
      <div className="overflow-x-auto rounded-2xl bg-background" style={panel}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-moss/60">
            <tr>
              <th className="p-3">Binnen</th>
              <th className="p-3">Plaats</th>
              <th className="p-3">Producten</th>
              <th className="p-3">Bedrijven</th>
              <th className="p-3">Status</th>
              <th className="p-3">Herpoging tot</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {(data?.leads ?? []).map((l) => (
              <Fragment key={l.id}>
                <tr className="border-t border-moss/10">
                  <td className="p-3">{fmt(l.created_at)}</td>
                  <td className="p-3">{`${l.postcode?.slice(0, 4) ?? ""} ${l.city ?? ""}`}</td>
                  <td className="p-3">
                    {(l.categories ?? []).map((c) => CATEGORY_LABEL[c] ?? c).join(", ")}
                  </td>
                  <td className="p-3">
                    {l.purchase_count} / {Math.min(l.max_partners, 4)}
                  </td>
                  <td className="p-3">
                    {FULFILLMENT_LABEL[l.fulfillment_status as FulfillmentStatus]}
                  </td>
                  <td className="p-3">{l.retry_until ? fmt(l.retry_until) : "—"}</td>
                  <td className="p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setOpen(open === l.id ? null : l.id)}
                    >
                      Handmatig toewijzen
                    </Button>
                  </td>
                </tr>
                {open === l.id && (
                  <tr>
                    <td colSpan={7} className="bg-muted/50 p-3">
                      <ManualAssign leadId={l.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {data && data.leads.length === 0 && (
          <p className="p-4 text-sm text-moss/70">Geen aanvragen in de wachtrij.</p>
        )}
      </div>
    </div>
  );
}

function ManualAssign({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["eligible", leadId],
    queryFn: () => getEligibleForLead({ data: { leadId } }),
  });
  const assign = useMutation({
    mutationFn: (companyId: string) => assignLeadManually({ data: { leadId, companyId } }),
    onSuccess: () => {
      toast.success("Toegewezen.");
      qc.invalidateQueries({ queryKey: ["allocation-queue"] });
      qc.invalidateQueries({ queryKey: ["eligible", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (isLoading) return <p className="text-sm">Laden…</p>;
  if (!data?.length)
    return <p className="text-sm text-moss/70">Geen bedrijf levert deze producten op deze plek.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {data.map((c) => (
        <li key={c.companyId} className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>{c.name}</strong> · {c.categories.map((x) => CATEGORY_LABEL[x] ?? x).join(", ")}
            {c.distanceKm !== null && ` · ${c.distanceKm} km`}
          </span>
          <Button size="sm" onClick={() => assign.mutate(c.companyId)} disabled={assign.isPending}>
            Toewijzen
          </Button>
        </li>
      ))}
    </ul>
  );
}
