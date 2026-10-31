import { Fragment, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  assignLeadManually,
  getAllocationQueue,
  runAllocationRetry,
  searchCompaniesForLead,
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

type PriceMode = "standard" | "free" | "percent" | "fixed";
const MODE_LABEL: Record<PriceMode, string> = {
  standard: "Standaardtarief",
  free: "Gratis",
  percent: "Korting (%)",
  fixed: "Vaste prijs (€)",
};

function ManualAssign({ leadId }: { leadId: string }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<PriceMode>("standard");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [picked, setPicked] = useState<{ companyId: string; name: string; inArea: boolean } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const { data, isFetching } = useQuery({
    queryKey: ["company-search", leadId, term],
    queryFn: () => searchCompaniesForLead({ data: { leadId, q: term } }),
    enabled: !picked,
  });
  const num = Number(value.replace(",", "."));
  const valueOk =
    mode === "standard" ||
    mode === "free" ||
    (value !== "" && !Number.isNaN(num) && (mode === "percent" ? num > 0 && num <= 100 : num >= 0));
  const assign = useMutation({
    mutationFn: (companyId: string) =>
      assignLeadManually({
        data: {
          leadId,
          companyId,
          mode,
          ...(mode === "percent" || mode === "fixed" ? { value: num } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: (r) => {
      toast.success(`Toegewezen voor €${r.price.toFixed(2).replace(".", ",")} excl. btw.`);
      setPicked(null);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["allocation-queue"] });
      qc.invalidateQueries({ queryKey: ["company-search", leadId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <span className="block text-xs text-moss/70">Installateur</span>
        {picked ? (
          <div className="flex flex-wrap items-center gap-2">
            <strong>{picked.name}</strong>
            {!picked.inArea && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs">Buiten werkgebied</span>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
              Wijzigen
            </Button>
          </div>
        ) : (
          <div className="relative max-w-md">
            <input
              autoFocus
              className="h-9 w-full rounded-md border border-input bg-background px-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek een bedrijf op naam…"
            />
            <ul className="mt-1 max-h-64 overflow-y-auto rounded-md border border-input bg-background">
              {isFetching && !data && <li className="p-2 text-moss/70">Zoeken…</li>}
              {data?.length === 0 && <li className="p-2 text-moss/70">Geen bedrijven gevonden.</li>}
              {data?.map((c) => (
                <li key={c.companyId}>
                  <button
                    type="button"
                    disabled={c.alreadyAssigned}
                    onClick={() => setPicked(c)}
                    className="w-full px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <strong>{c.name}</strong>
                    <span className="text-moss/70">
                      {" · "}
                      {c.categories.length
                        ? c.categories.map((x) => CATEGORY_LABEL[x] ?? x).join(", ")
                        : "voert deze producten niet"}
                      {" · "}
                      {c.alreadyAssigned
                        ? "heeft deze aanvraag al"
                        : c.inArea
                          ? `binnen werkgebied${c.distanceKm !== null ? ` (${c.distanceKm} km)` : ""}`
                          : "buiten werkgebied"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {picked && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs text-moss/70">Prijs</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2"
              value={mode}
              onChange={(e) => setMode(e.target.value as PriceMode)}
            >
              {(Object.keys(MODE_LABEL) as PriceMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          {(mode === "percent" || mode === "fixed") && (
            <label className="space-y-1">
              <span className="block text-xs text-moss/70">
                {mode === "percent" ? "Kortingspercentage" : "Prijs excl. btw"}
              </span>
              <input
                className="h-9 w-28 rounded-md border border-input bg-background px-2"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={mode === "percent" ? "bijv. 50" : "bijv. 7,50"}
              />
            </label>
          )}
          <label className="flex-1 space-y-1">
            <span className="block text-xs text-moss/70">Reden (optioneel)</span>
            <input
              className="h-9 w-full rounded-md border border-input bg-background px-2"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={picked.inArea ? "bijv. coulance" : "bijv. buiten regio, telefonisch akkoord"}
            />
          </label>
          <Button
            size="sm"
            onClick={() => assign.mutate(picked.companyId)}
            disabled={assign.isPending || !valueOk}
          >
            Toewijzen aan {picked.name}
          </Button>
        </div>
      )}
    </div>
  );
}
