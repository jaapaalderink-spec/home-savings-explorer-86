import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { generateInvoices, listComplaints, listInvoices, reviewComplaint } from "@/lib/partner.functions";
import { formatEuro } from "@/lib/home-savings";

const REASON_LABEL: Record<string, string> = {
  unreachable: "Niet bereikbaar",
  invalid_phone: "Ongeldig nummer",
  duplicate: "Dubbele lead",
  out_of_area: "Buiten werkgebied",
  no_interest: "Geen interesse",
  spam: "Spam",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "In behandeling",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
};

export function BillingAdmin() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const complaints = useQuery({ queryKey: ["complaints"], queryFn: () => listComplaints() });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });

  const review = useMutation({
    mutationFn: (input: { complaintId: string; approve: boolean }) => reviewComplaint({ data: input }),
    onSuccess: () => {
      toast.success("Reclamatie beoordeeld.");
      void queryClient.invalidateQueries({ queryKey: ["complaints"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generate = useMutation({
    mutationFn: () => generateInvoices({ data: { year, month } }),
    onSuccess: () => {
      toast.success("Facturen aangemaakt.");
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
        <p className="text-sm font-semibold text-ink">Reclamaties</p>
        {complaints.isLoading ? (
          <Skeleton className="mt-3 h-24 w-full rounded-xl" />
        ) : !complaints.data || complaints.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-moss/70">Geen reclamaties.</p>
        ) : (
          <ul className="mt-3 divide-y divide-moss/10">
            {complaints.data.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-semibold text-ink">
                    {(c.company as { name?: string } | null)?.name ?? "Onbekend bedrijf"} ·{" "}
                    {REASON_LABEL[c.reason as string] ?? c.reason}
                  </p>
                  <p className="text-xs text-moss/70">
                    {new Date(c.created_at as string).toLocaleDateString("nl-NL")} ·{" "}
                    {STATUS_LABEL[c.status as string] ?? c.status}
                    {Number(c.credit_ex_vat ?? 0) > 0 && ` · credit ${formatEuro(Number(c.credit_ex_vat))}`}
                  </p>
                  {c.details && <p className="mt-1 max-w-xl text-xs text-moss/80">{c.details as string}</p>}
                </div>
                {(c.status as string) === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => review.mutate({ complaintId: c.id as string, approve: true })}
                      disabled={review.isPending}
                    >
                      Crediteren
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => review.mutate({ complaintId: c.id as string, approve: false })}
                      disabled={review.isPending}
                    >
                      Afwijzen
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm font-semibold text-ink">Facturen</p>
          <div className="flex items-end gap-2">
            <label className="text-xs text-moss/70">
              Jaar
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="ml-2 w-20 rounded-lg border border-moss/20 px-2 py-1 text-sm text-ink"
              />
            </label>
            <label className="text-xs text-moss/70">
              Maand
              <input
                type="number"
                min={1}
                max={12}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="ml-2 w-16 rounded-lg border border-moss/20 px-2 py-1 text-sm text-ink"
              />
            </label>
            <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
              Facturen aanmaken
            </Button>
          </div>
        </div>

        {invoices.isLoading ? (
          <Skeleton className="mt-3 h-24 w-full rounded-xl" />
        ) : !invoices.data || invoices.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-moss/70">Nog geen facturen.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-moss/60">
                <tr>
                  <th className="p-2">Nummer</th>
                  <th className="p-2">Bedrijf</th>
                  <th className="p-2">Periode</th>
                  <th className="p-2">Excl. btw</th>
                  <th className="p-2">Incl. btw</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.data.items.map((i) => (
                  <tr key={i.id} className="border-t border-moss/10">
                    <td className="p-2 font-semibold text-ink">{i.invoice_number as string}</td>
                    <td className="p-2 text-moss/80">{(i.company as { name?: string } | null)?.name ?? "—"}</td>
                    <td className="p-2 text-xs text-moss/70">
                      {new Date(i.period_start as string).toLocaleDateString("nl-NL")} –{" "}
                      {new Date(i.period_end as string).toLocaleDateString("nl-NL")}
                    </td>
                    <td className="p-2 text-moss/80">{formatEuro(Number(i.subtotal_ex_vat ?? 0))}</td>
                    <td className="p-2 font-semibold text-leaf">{formatEuro(Number(i.total_inc_vat ?? 0))}</td>
                    <td className="p-2 text-xs text-moss/80">{i.status as string}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
