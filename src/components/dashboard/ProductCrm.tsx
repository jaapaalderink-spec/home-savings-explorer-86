import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { addQuote, getPurchaseCrm, saveProductCrm } from "@/lib/crm.functions";
import { LOST_REASONS, type LostReason } from "@/lib/crm-policy";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { STATUS_LABEL, checkStatusTransition, LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status-policy";
import { formatEuro } from "@/lib/home-savings";

const input =
  "min-h-9 rounded-lg border border-moss/20 bg-background px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf";

/** Opvolging per product binnen één aanvraag: status, vervolgdatum, verliesreden en offerteversies. */
export function ProductCrm({ purchaseId }: { purchaseId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["purchase-crm", purchaseId],
    queryFn: () => getPurchaseCrm({ data: { purchaseId } }),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["purchase-crm", purchaseId] });
    qc.invalidateQueries({ queryKey: ["my-leads"] });
    qc.invalidateQueries({ queryKey: ["crm-stats"] });
  };
  const save = useMutation({
    mutationFn: (v: { category: string; status: LeadStatus; followUpDate?: string | null; lostReason?: LostReason | null }) =>
      saveProductCrm({ data: { purchaseId, ...v } }),
    onSuccess: () => {
      toast.success("Opgeslagen");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const quote = useMutation({
    mutationFn: (v: { category: string; amount: number; note?: string }) => addQuote({ data: { purchaseId, ...v } }),
    onSuccess: (r) => {
      toast.success(`Offerte versie ${r.version} vastgelegd`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-xs text-moss/60">Laden…</p>;

  return (
    <div className="space-y-2">
      {(data ?? []).map((p) => (
        <ProductRow
          key={p.category}
          row={p}
          busy={save.isPending || quote.isPending}
          onSave={(v) => save.mutate({ category: p.category, ...v })}
          onQuote={(amount, note) => quote.mutate({ category: p.category, amount, ...(note ? { note } : {}) })}
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
}: {
  row: Row;
  busy: boolean;
  onSave: (v: { status: LeadStatus; followUpDate?: string | null; lostReason?: LostReason | null }) => void;
  onQuote: (amount: number, note?: string) => void;
}) {
  const [status, setStatus] = useState<LeadStatus>(row.status);
  const [followUp, setFollowUp] = useState(row.followUpDate ?? "");
  const [reason, setReason] = useState<LostReason | "">((row.lostReason as LostReason) ?? "");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const closed = row.status === "won" || row.status === "lost";

  return (
    <div className="rounded-xl border border-moss/15 p-3">
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
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
            {LEAD_STATUSES.filter((s) => s === row.status || checkStatusTransition(row.status, s).ok).map((s) => (
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
        ) : null}
        <button
          type="button"
          disabled={busy || (status === "lost" && !reason)}
          onClick={() => onSave({ status, followUpDate: followUp || null, lostReason: reason || null })}
          className="min-h-9 rounded-full bg-leaf px-3 text-xs font-semibold text-background disabled:opacity-40"
        >
          Opslaan
        </button>
      </div>

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
          <button
            type="button"
            disabled={busy || amount === "" || Number(amount) < 0}
            onClick={() => {
              onQuote(Number(amount), note || undefined);
              setAmount("");
              setNote("");
            }}
            className="min-h-9 rounded-full border border-leaf px-3 text-xs font-semibold text-leaf disabled:opacity-40"
          >
            Offerte vastleggen
          </button>
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
