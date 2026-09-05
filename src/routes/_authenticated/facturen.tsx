import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listCreditNotes, listInvoices } from "@/lib/partner.functions";
import { createInvoicePayment, refreshInvoicePayment } from "@/lib/payments.functions";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments-policy";
import { CREDIT_STATUS_LABEL, type CreditNoteStatus } from "@/lib/credit-policy";
import { formatEuro } from "@/lib/home-savings";

export const Route = createFileRoute("/_authenticated/facturen")({
  head: () => ({
    meta: [
      { title: "Facturen betalen — Onafhankelijke Offerte" },
      {
        name: "description",
        content:
          "Bekijk je maandfacturen, betaal openstaande bedragen met iDEAL en volg de betaalstatus.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const queryClient = useQueryClient();
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => listInvoices() });
  const credits = useQuery({ queryKey: ["credit-notes"], queryFn: () => listCreditNotes() });
  const returnedInvoice = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("invoice");

  const refresh = useMutation({
    mutationFn: (invoiceId: string) => refreshInvoicePayment({ data: { invoiceId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  // Terugkeer van Mollie zegt niets: we halen de echte status op bij de backend.
  useEffect(() => {
    if (returnedInvoice) refresh.mutate(returnedInvoice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedInvoice]);

  const pay = useMutation({
    mutationFn: (invoiceId: string) => createInvoicePayment({ data: { invoiceId } }),
    onSuccess: (result) => {
      if (result.checkoutUrl) window.location.href = result.checkoutUrl;
      else {
        toast.success("Deze factuur is al voldaan.");
        void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Facturen</h1>
        <Link to="/dashboard" className="text-sm font-semibold text-leaf">
          Terug naar dashboard
        </Link>
      </div>

      {invoices.isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !invoices.data || invoices.data.items.length === 0 ? (
        <p className="text-sm text-moss/70">Er zijn nog geen facturen.</p>
      ) : (
        <ul className="space-y-3">
          {invoices.data.items.map((i) => {
            const status = (i.payment_status ?? "open") as PaymentStatus;
            const paid = status === "paid";
            const pending = status === "pending";
            return (
              <li
                key={i.id as string}
                className="rounded-2xl bg-background p-4"
                style={{ boxShadow: "var(--shadow-panel)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">Factuur {i.invoice_number as string}</p>
                    <p className="text-xs text-moss/70">
                      {new Date(i.period_start as string).toLocaleDateString("nl-NL")} –{" "}
                      {new Date(i.period_end as string).toLocaleDateString("nl-NL")} ·{" "}
                      {PAYMENT_STATUS_LABEL[status] ?? status}
                      {paid && i.paid_at
                        ? ` op ${new Date(i.paid_at as string).toLocaleDateString("nl-NL")}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-right text-lg font-bold text-leaf">
                      {formatEuro(Number(i.amount_due_inc_vat ?? i.total_inc_vat ?? 0))}
                      {Number(i.credit_applied_inc_vat ?? 0) > 0 && (
                        <span className="block text-xs font-normal text-moss/70">
                          {formatEuro(Number(i.total_inc_vat ?? 0))} − credit{" "}
                          {formatEuro(Number(i.credit_applied_inc_vat))}
                        </span>
                      )}
                    </span>
                    {paid ? null : pending ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refresh.mutate(i.id as string)}
                        disabled={refresh.isPending}
                      >
                        Status vernieuwen
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => pay.mutate(i.id as string)}
                        disabled={pay.isPending}
                      >
                        {status === "open" ? "Betalen" : "Opnieuw betalen"}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Creditnota's</h2>
          {credits.data && credits.data.openCreditIncVat > 0 && (
            <span className="text-sm font-semibold text-leaf">
              Openstaand tegoed {formatEuro(credits.data.openCreditIncVat)}
            </span>
          )}
        </div>
        {credits.isLoading ? (
          <Skeleton className="h-20 w-full rounded-2xl" />
        ) : !credits.data || credits.data.items.length === 0 ? (
          <p className="text-sm text-moss/70">Er zijn nog geen creditnota's.</p>
        ) : (
          <ul className="space-y-3">
            {credits.data.items.map((cn) => (
              <li
                key={cn.id as string}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-background p-4"
                style={{ boxShadow: "var(--shadow-panel)" }}
              >
                <div>
                  <p className="font-semibold text-ink">Creditnota {cn.credit_number as string}</p>
                  <p className="text-xs text-moss/70">
                    {new Date(cn.issued_at as string).toLocaleDateString("nl-NL")}
                    {(cn.invoice as { invoice_number?: string } | null)?.invoice_number
                      ? ` · bij factuur ${(cn.invoice as { invoice_number?: string }).invoice_number}`
                      : ""}{" "}
                    · {CREDIT_STATUS_LABEL[(cn.status ?? "open") as CreditNoteStatus]}
                  </p>
                </div>
                <span className="text-lg font-bold text-leaf">
                  −{formatEuro(Number(cn.total_inc_vat ?? 0))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
