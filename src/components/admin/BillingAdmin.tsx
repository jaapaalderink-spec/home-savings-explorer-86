import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  generateInvoices,
  listComplaints,
  listCreditNotes,
  listInvoices,
  reviewComplaint,
} from "@/lib/partner.functions";
import { formatEuro } from "@/lib/home-savings";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments-policy";
import {
  COMPLAINT_OUTCOME_LABEL,
  CREDIT_STATUS_LABEL,
  type ComplaintOutcome,
  type CreditNoteStatus,
} from "@/lib/credit-policy";

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
  const creditNotes = useQuery({ queryKey: ["credit-notes"], queryFn: () => listCreditNotes() });

  const review = useMutation({
    mutationFn: (input: { complaintId: string; approve: boolean }) =>
      reviewComplaint({ data: input }),
    onSuccess: (result) => {
      const outcome = COMPLAINT_OUTCOME_LABEL[result.result as ComplaintOutcome] ?? "Beoordeeld";
      toast.success(
        result.creditNumber ? `${outcome}: ${result.creditNumber}` : `Reclamatie: ${outcome}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["complaints"] });
      void queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
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
      <section
        className="rounded-2xl bg-background p-4"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <p className="text-sm font-semibold text-ink">Reclamaties</p>
        {complaints.isLoading ? (
          <Skeleton className="mt-3 h-24 w-full rounded-xl" />
        ) : !complaints.data || complaints.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-moss/70">Geen reclamaties.</p>
        ) : (
          <ul className="mt-3 divide-y divide-moss/10">
            {complaints.data.items.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-ink">
                    {(c.company as { name?: string } | null)?.name ?? "Onbekend bedrijf"} ·{" "}
                    {REASON_LABEL[c.reason as string] ?? c.reason}
                  </p>
                  <p className="text-xs text-moss/70">
                    {new Date(c.created_at as string).toLocaleDateString("nl-NL")} ·{" "}
                    {STATUS_LABEL[c.status as string] ?? c.status}
                    {Number(c.credit_ex_vat ?? 0) > 0 &&
                      ` · credit ${formatEuro(Number(c.credit_ex_vat))}`}
                  </p>
                  {c.details && (
                    <p className="mt-1 max-w-xl text-xs text-moss/80">{c.details as string}</p>
                  )}
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

      <section
        className="rounded-2xl bg-background p-4"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
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
                  <th className="p-2">Betaling</th>
                </tr>
              </thead>
              <tbody>
                {invoices.data.items.map((i) => (
                  <tr key={i.id} className="border-t border-moss/10">
                    <td className="p-2 font-semibold text-ink">{i.invoice_number as string}</td>
                    <td className="p-2 text-moss/80">
                      {(i.company as { name?: string } | null)?.name ?? "—"}
                    </td>
                    <td className="p-2 text-xs text-moss/70">
                      {new Date(i.period_start as string).toLocaleDateString("nl-NL")} –{" "}
                      {new Date(i.period_end as string).toLocaleDateString("nl-NL")}
                    </td>
                    <td className="p-2 text-moss/80">
                      {formatEuro(Number(i.subtotal_ex_vat ?? 0))}
                    </td>
                    <td className="p-2 font-semibold text-leaf">
                      {formatEuro(Number(i.total_inc_vat ?? 0))}
                      {Number(i.credit_applied_inc_vat ?? 0) > 0 && (
                        <span className="block text-[11px] font-normal text-moss/70">
                          credit −{formatEuro(Number(i.credit_applied_inc_vat))} · te betalen{" "}
                          {formatEuro(Number(i.amount_due_inc_vat ?? i.total_inc_vat ?? 0))}
                        </span>
                      )}
                      {((i.credit_notes ?? []) as Array<{ credit_number: string }>).map((cn) => (
                        <span key={cn.credit_number} className="block text-[11px] font-normal text-moss/60">
                          {cn.credit_number}
                        </span>
                      ))}
                    </td>
                    <td className="p-2 text-xs text-moss/80">{i.status as string}</td>
                    <td className="p-2 text-xs text-moss/80">
                      {PAYMENT_STATUS_LABEL[(i.payment_status ?? "open") as PaymentStatus]}
                      {i.payment_review_required ? " · controle nodig" : ""}
                      {(() => {
                        const attempts = (i.payments ?? []) as Array<{
                          provider_payment_id: string;
                          created_at: string;
                          paid_at: string | null;
                        }>;
                        const last = attempts[attempts.length - 1];
                        if (!last) return null;
                        return (
                          <span className="block text-[11px] text-moss/60">
                            {last.provider_payment_id} ·{" "}
                            {new Date(
                              (last.paid_at ?? last.created_at) as string,
                            ).toLocaleDateString("nl-NL")}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section
        className="rounded-2xl bg-background p-4"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <p className="text-sm font-semibold text-ink">Creditnota's</p>
        {creditNotes.isLoading ? (
          <Skeleton className="mt-3 h-24 w-full rounded-xl" />
        ) : !creditNotes.data || creditNotes.data.items.length === 0 ? (
          <p className="mt-2 text-sm text-moss/70">Nog geen creditnota's.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-moss/60">
                <tr>
                  <th className="p-2">Creditnummer</th>
                  <th className="p-2">Bedrijf</th>
                  <th className="p-2">Oorspronkelijke factuur</th>
                  <th className="p-2">Lead</th>
                  <th className="p-2">Excl. btw</th>
                  <th className="p-2">Btw</th>
                  <th className="p-2">Incl. btw</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Datum</th>
                </tr>
              </thead>
              <tbody>
                {creditNotes.data.items.map((cn) => {
                  const lead = (cn.purchase as { lead?: { first_name?: string; last_name?: string; postcode?: string } } | null)?.lead;
                  return (
                    <tr key={cn.id as string} className="border-t border-moss/10">
                      <td className="p-2 font-semibold text-ink">{cn.credit_number as string}</td>
                      <td className="p-2 text-moss/80">
                        {(cn.company as { name?: string } | null)?.name ?? "—"}
                      </td>
                      <td className="p-2 text-xs text-moss/70">
                        {(cn.invoice as { invoice_number?: string } | null)?.invoice_number ?? "—"}
                      </td>
                      <td className="p-2 text-xs text-moss/70">
                        {lead ? `${lead.first_name ?? ""} ${lead.last_name ?? ""} · ${lead.postcode ?? ""}` : "—"}
                      </td>
                      <td className="p-2 text-moss/80">
                        −{formatEuro(Number(cn.subtotal_ex_vat ?? 0))}
                      </td>
                      <td className="p-2 text-xs text-moss/70">
                        −{formatEuro(Number(cn.vat_amount ?? 0))} (
                        {Math.round(Number(cn.vat_rate ?? 0) * 100)}%)
                      </td>
                      <td className="p-2 font-semibold text-leaf">
                        −{formatEuro(Number(cn.total_inc_vat ?? 0))}
                      </td>
                      <td className="p-2 text-xs text-moss/80">
                        {CREDIT_STATUS_LABEL[(cn.status ?? "open") as CreditNoteStatus]}
                      </td>
                      <td className="p-2 text-xs text-moss/70">
                        {new Date(cn.issued_at as string).toLocaleDateString("nl-NL")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
