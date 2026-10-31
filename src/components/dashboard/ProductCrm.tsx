import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addQuote, getPurchaseCrm, saveProductCrm } from "@/lib/crm.functions";
import { LOST_REASONS, type LostReason } from "@/lib/crm-policy";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { STATUS_LABEL, LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status-policy";
import { formatEuro } from "@/lib/home-savings";
import { CalendarPlus } from "lucide-react";
import { requestAppointment } from "@/components/dashboard/LeadPlanner";

const input =
  "min-h-9 rounded-lg border border-moss/20 bg-background px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf";

/** Opvolging per product binnen één aanvraag: status, vervolgdatum, verliesreden en offerteversies. */
export function ProductCrm({ purchaseId }: { purchaseId: string }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveProductCrm);
  const quoteFn = useServerFn(addQuote);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["purchase-crm", purchaseId],
    queryFn: () => getPurchaseCrm({ data: { purchaseId } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["purchase-crm", purchaseId] });
    qc.invalidateQueries({ queryKey: ["my-leads"] });
    qc.invalidateQueries({ queryKey: ["crm-stats"] });
    qc.invalidateQueries({ queryKey: ["manager-stats"] });
    qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["my-quality"] });
  };
  const save = useMutation({
    mutationFn: (v: { category: string; revision: number; status: LeadStatus; wonAmount?: number | null; reopenReason?: string; followUpDate?: string | null; lostReason?: LostReason | null }) =>
      saveFn({ data: { purchaseId, ...v } }),
    onSuccess: () => {
      toast.success("Opgeslagen");
      refresh();
    },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });
  const quote = useMutation({
    mutationFn: (v: { category: string; revision: number; amount: number; note?: string }) => quoteFn({ data: { purchaseId, ...v } }),
    onSuccess: (r) => {
      toast.success(`Offerte versie ${r.version} vastgelegd`);
      refresh();
    },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });

  if (isLoading) return <p className="text-xs text-moss/60">Laden…</p>;
  if (error) return <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-moss"><span>Productgegevens konden niet worden geladen.</span><Button size="sm" variant="outline" onClick={() => refetch()}>Opnieuw proberen</Button></div>;

  return (
    <div className="space-y-2">
      {(data ?? []).map((p) => (
        <ProductRow
          key={`${p.category}:${p.revision}`}
          row={p}
          busy={save.isPending || quote.isPending}
          onPlan={() => requestAppointment(purchaseId)}
          onSave={(v) => save.mutate({ category: p.category, revision: p.revision, ...v })}
          onQuote={(amount, note) => quote.mutate({ category: p.category, revision: p.revision, amount, ...(note ? { note } : {}) })}
        />
      ))}
    </div>
  );
}

type Row = Awaited<ReturnType<typeof getPurchaseCrm>>[number];

function ProductRow({
  row,
  busy,
  onSave,
  onQuote,
  onPlan,
}: {
  onPlan: () => void;
  row: Row;
  busy: boolean;
  onSave: (v: { status: LeadStatus; wonAmount?: number | null; reopenReason?: string; followUpDate?: string | null; lostReason?: LostReason | null }) => void;
  onQuote: (amount: number, note?: string) => void;
}) {
  const [status, setStatus] = useState<LeadStatus>(row.status);
  const [followUp, setFollowUp] = useState(row.followUpDate ?? "");
  const [reason, setReason] = useState<LostReason | "">((row.lostReason as LostReason) ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [wonAmount, setWonAmount] = useState(row.wonAmount == null ? "" : String(row.wonAmount));
  const [reopenReason, setReopenReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const closed = row.status === "won" || row.status === "lost";
  const reopening = closed && status !== row.status;

  return (
    <div className="border-t border-moss/15 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-ink">{CATEGORY_LABEL[row.category] ?? row.category}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-moss">{STATUS_LABEL[row.status]}</span>
        {row.followUpDate && !closed && (
          <span className="text-xs text-moss/70">
            Vervolg {new Date(row.followUpDate).toLocaleDateString("nl-NL")}
          </span>
        )}
        {row.status === "lost" && row.lostReason && (
          <span className="text-xs text-moss/70">{LOST_REASONS[row.lostReason as LostReason]}</span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-moss/70">
          Status
          <select disabled={busy} className={input} value={status} onChange={(e) => { setStatus(e.target.value as LeadStatus); setConfirmed(false); }}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {status === "lost" ? (
          <label className="flex flex-col gap-1 text-xs text-moss/70">
            Reden
            <select className={input} value={reason} onChange={(e) => setReason(e.target.value as LostReason)}>
              <option value="">Kies…</option>
              {Object.entries(LOST_REASONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ) : status !== "won" ? (
          <label className="flex flex-col gap-1 text-xs text-moss/70">
            Vervolgdatum
            <input type="date" className={input} value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-moss/70">
            Gewonnen bedrag excl. btw
            <input type="number" min={0} step="0.01" className={`${input} w-40`} value={wonAmount} onChange={(e) => setWonAmount(e.target.value)} />
          </label>
        )}
        <Button
          type="button"
          size="sm"
          disabled={busy || (status === "lost" && !reason) || (status === "won" && (wonAmount === "" || !Number.isFinite(Number(wonAmount)) || Number(wonAmount) < 0)) || (reopening && (!confirmed || reopenReason.trim().length < 3))}
          onClick={() => onSave({ status, wonAmount: status === "won" ? Number(wonAmount) : null, ...(reopening ? { reopenReason } : {}), followUpDate: followUp || null, lostReason: reason || null })}
        >
          Opslaan
        </Button>
        {!closed && (
          <Button type="button" size="sm" variant="outline" onClick={onPlan}>
            <CalendarPlus size={14} className="mr-1.5" /> Afspraak inplannen
          </Button>
        )}
      </div>
      {reopening && (
        <div className="mt-3 space-y-2 bg-muted p-3 text-xs text-moss">
          <p>Dit herstelt het CRM-resultaat. Eerdere winst vervalt uit actuele rapportage; historie blijft bewaard. Dit geeft geen credit voor de geleverde lead.</p>
          <label className="flex flex-col gap-1">Reden van herstel
            <input className={input} value={reopenReason} maxLength={500} onChange={(e) => setReopenReason(e.target.value)} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />Ik bevestig de wijziging van resultaat en opvolging.</label>
        </div>
      )}

      {!closed && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-moss/70">
            Offertebedrag excl. btw
            <input type="number" min={0} step={1} className={`${input} w-32`} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-moss/70">
            Toelichting
            <input className={input} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || amount === "" || Number(amount) < 0}
            onClick={() => {
              onQuote(Number(amount), note || undefined);
              setAmount("");
              setNote("");
            }}
          >
            Offerte vastleggen
          </Button>
        </div>
      )}

      {row.quotes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-moss/75">
          {row.quotes.map((q) => (
            <li key={q.version}>
              Versie {q.version}: <strong className="text-ink">{formatEuro(q.amount)}</strong> ·{" "}
              {new Date(q.createdAt).toLocaleDateString("nl-NL")}
              {q.note ? ` · ${q.note}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
