import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  buyLeadBundle,
  confirmTermination,
  getMySubscription,
  previewTermination,
  withdrawTermination,
} from "@/lib/subscription.functions";
import { BUNDLES, PACKAGES, packageFee, type BundleSize, type PackageCode } from "@/lib/package-policy";
import { formatEuro } from "@/lib/home-savings";

const panel = { boxShadow: "var(--shadow-panel)" };
const monthLabel = (d: string) => new Date(d).toLocaleDateString("nl-NL", { month: "long", year: "numeric" });

export function SubscriptionPanel() {
  const qc = useQueryClient();
  const fetchSub = useServerFn(getMySubscription);
  const { data, error } = useQuery({ queryKey: ["my-subscription"], queryFn: () => fetchSub() });
  const buy = useServerFn(buyLeadBundle);
  const preview = useServerFn(previewTermination);
  const confirm = useServerFn(confirmTermination);
  const withdraw = useServerFn(withdrawTermination);
  const [stop, setStop] = useState("");
  const [ack, setAck] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["my-subscription"] });

  const stopMonth = stop || data?.earliestStop || "";
  const calc = useQuery({
    queryKey: ["termination-preview", stopMonth],
    queryFn: () => preview({ data: { stopMonth } }),
    enabled: !!stopMonth && !!data && !data.termination,
  });

  const bundle = useMutation({
    mutationFn: (size: BundleSize) => buy({ data: { size } }),
    onSuccess: () => { toast.success("Bundel toegevoegd voor deze maand."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancel = useMutation({
    mutationFn: () => confirm({ data: { stopMonth } }),
    onSuccess: () => { toast.success("Opzegging vastgelegd."); setAck(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const undo = useMutation({
    mutationFn: () => withdraw(),
    onSuccess: () => { toast.success("Opzegging ingetrokken."); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return null;
  const a = data.active;
  const pkg = a?.package_code ? PACKAGES[a.package_code as PackageCode] : null;
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(data.earliestStop);
    d.setUTCMonth(d.getUTCMonth() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-background p-5" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">Je abonnement</h3>
        {!a ? (
          <p className="mt-1 text-sm text-moss/70">Je hebt nog een oud contract; neem contact op om over te stappen op een pakket.</p>
        ) : (
          <div className="mt-2 space-y-1 text-sm text-moss/80">
            <p>
              <strong className="text-ink">{pkg ? `Pakket ${pkg.label}` : "Maatwerkcontract"}</strong> · {a.lead_quota_per_month} leads per maand
              {data.contractStart && <> · sinds {monthLabel(data.contractStart)}</>}
            </p>
            <p>
              {a.billing_mode === "fixed_package"
                ? `Vast pakketbedrag: ${formatEuro(packageFee(a.package_code as PackageCode))} per maand excl. btw, ook als er minder leads zijn geleverd.`
                : `${formatEuro(Number(a.platform_fee_ex_vat))} vaste platformkosten per maand plus alleen de werkelijk geleverde leads (${formatEuro(Number(a.base_lead_price_ex_vat))} per lead).`}
            </p>
            {a.min_term_months > 0 && <p>Minimaal {a.min_term_months} maanden, daarna {a.notice_months} maand opzegtermijn.</p>}
          </div>
        )}
      </section>

      {a && (
        <section className="rounded-2xl bg-background p-5" style={panel}>
          <h3 className="font-display text-lg font-bold text-ink">Extra leads deze maand</h3>
          <p className="mt-1 text-sm text-moss/70">
            Een bundel komt bovenop je pakket en loopt tot het einde van deze maand. Je betaalt alleen voor leads die je echt ontvangt, achteraf op de maandfactuur.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(BUNDLES).map(Number) as BundleSize[]).map((s) => (
              <Button key={s} variant="outline" disabled={bundle.isPending} onClick={() => bundle.mutate(s)}>
                {s} leads à {formatEuro(BUNDLES[s])} (max. {formatEuro(s * BUNDLES[s])})
              </Button>
            ))}
          </div>
          {data.bundles.length > 0 && (
            <ul className="mt-3 text-sm text-moss/80">
              {data.bundles.map((b) => (
                <li key={b.id}>Bundel van {b.size}: {b.delivered} van {b.size} geleverd</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {a && (
        <section className="rounded-2xl bg-background p-5" style={panel}>
          <h3 className="font-display text-lg font-bold text-ink">Opzeggen</h3>
          {data.termination ? (
            <div className="mt-2 space-y-2 text-sm text-moss/80">
              <p>
                Je contract stopt na <strong>{monthLabel(data.termination.effective_month)}</strong>.
                {Number(data.termination.settlement_ex_vat) > 0
                  ? ` Afkoop resterende minimumtermijn: ${formatEuro(Number(data.termination.settlement_ex_vat))} excl. btw, op de laatste maandfactuur.`
                  : " Er is geen afkoop verschuldigd."}
              </p>
              <Button variant="outline" disabled={undo.isPending} onClick={() => undo.mutate()}>Opzegging intrekken</Button>
            </div>
          ) : (
            <div className="mt-2 space-y-3 text-sm">
              <label className="block">
                <span className="text-moss/80">Laatste maand van je contract</span>
                <select value={stopMonth} onChange={(e) => { setStop(e.target.value); setAck(false); }}
                  className="mt-1 h-10 w-full max-w-xs rounded-md border border-input bg-background px-3">
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
              </label>
              {calc.data && (
                <div className="rounded-xl bg-muted p-4 text-moss/80">
                  {calc.data.remainingMonths > 0 ? (
                    <>Je stopt vóór het einde van de minimumtermijn. Afkoop: {calc.data.remainingMonths} × {formatEuro(calc.data.monthly)} = <strong>{formatEuro(calc.data.total)}</strong> excl. btw. De lopende maanden worden zoals gewoonlijk gefactureerd.</>
                  ) : (
                    <>Geen afkoop: je minimumtermijn is dan voorbij. Je betaalt alleen de gewone maandfactuur tot en met deze maand.</>
                  )}
                </div>
              )}
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>Ik begrijp dat ik na deze maand geen aanvragen meer ontvang.</span>
              </label>
              <Button variant="destructive" disabled={!ack || cancel.isPending || !calc.data} onClick={() => cancel.mutate()}>
                Opzegging bevestigen
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
