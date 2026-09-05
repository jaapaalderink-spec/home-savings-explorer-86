import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listInvoices } from "@/lib/partner.functions";
import { createInvoicePayment, refreshInvoicePayment } from "@/lib/payments.functions";
import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "@/lib/payments-policy";
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
                    <span className="text-lg font-bold text-leaf">
                      {formatEuro(Number(i.total_inc_vat ?? 0))}
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
    </main>
  );
}
