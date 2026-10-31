import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createContractVersion,
  getCompanyContracts,
  searchCompanies,
} from "@/lib/contracts.functions";
import { CONTRACT_DEFAULTS, contractMonthlyEstimate } from "@/lib/contract-policy";
import { formatEuro } from "@/lib/home-savings";
import { PACKAGES, SELECTABLE_PACKAGES, fixedMonthlyCost, packageFee, type BillingMode, type PackageCode } from "@/lib/package-policy";

const panel = { boxShadow: "var(--shadow-panel)" };
const fmt = (d: string) =>
  new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

export function ContractsAdmin() {
  const [q, setQ] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["company-search", q],
    queryFn: () => searchCompanies({ data: { q } }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <section className="rounded-2xl bg-background p-4" style={panel}>
        <Label htmlFor="co-q">Bedrijf zoeken</Label>
        <Input id="co-q" value={q} onChange={(e) => setQ(e.target.value)} className="mt-1" />
        <ul className="mt-3 max-h-[480px] divide-y divide-moss/10 overflow-auto text-sm">
          {(list.data ?? []).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setCompanyId(c.id)}
                className={`w-full p-2 text-left ${companyId === c.id ? "bg-muted font-semibold" : ""}`}
              >
                {c.name}
                {!c.active && <span className="ml-1 text-xs text-moss/60">(inactief)</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {companyId ? (
        <CompanyContract companyId={companyId} />
      ) : (
        <p className="text-sm text-moss/70">Kies een bedrijf om de contractversies te zien.</p>
      )}
    </div>
  );
}

function CompanyContract({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["contracts", companyId],
    queryFn: () => getCompanyContracts({ data: { companyId } }),
  });
  const [quota, setQuota] = useState(20);
  const [seats, setSeats] = useState(0);
  const [validFrom, setValidFrom] = useState<string>("");
  const [note, setNote] = useState("");
  const [pkg, setPkg] = useState<PackageCode | "">("");
  const [mode, setMode] = useState<BillingMode>("actual_delivered");
  const save = useMutation({
    mutationFn: () =>
      createContractVersion({
        data: {
          companyId,
          validFrom: validFrom || data!.earliestStart,
          leadQuotaPerMonth: quota,
          paidSeats: seats,
          ...(note ? { note } : {}),
          ...(pkg ? { packageCode: pkg, billingMode: mode } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Contractversie opgeslagen.");
      qc.invalidateQueries({ queryKey: ["contracts", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!data) return null;
  const start = validFrom || data.earliestStart;
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(data.earliestStart);
    d.setUTCMonth(d.getUTCMonth() + i);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-background p-5" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">{data.company?.name}</h3>
        {data.versions.length === 0 ? (
          <p className="mt-1 text-sm text-moss/70">
            Oud contract: abonnement {data.company?.plan_name}, {data.company?.monthly_lead_limit}{" "}
            leads per maand, {formatEuro(Number(data.company?.monthly_fee_ex_vat ?? 0))} per maand.
            De oude leadprijzen blijven gelden tot een nieuwe contractversie ingaat.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-moss/10 text-sm">
            {data.versions.map((v) => (
              <li key={v.id} className="py-2">
                <span className="font-semibold text-ink">Versie {v.version}</span> · vanaf{" "}
                {fmt(v.valid_from)}
                {v.id === data.activeId && (
                  <span className="ml-2 rounded-full bg-leaf/15 px-2 text-xs text-leaf">
                    actief
                  </span>
                )}
                {v.valid_from > new Date().toISOString().slice(0, 10) && (
                  <span className="ml-2 rounded-full bg-muted px-2 text-xs">gepland</span>
                )}
                {v.package_code && (
                  <span className="block text-moss/70">
                    Pakket {PACKAGES[v.package_code as PackageCode]?.label} ·{" "}
                    {v.billing_mode === "fixed_package"
                      ? `vast pakketbedrag ${formatEuro(Number(v.package_fee_ex_vat))} p/m`
                      : "werkelijke levering (vaste fee + geleverde leads)"}{" "}
                    · minimaal {v.min_term_months} maanden
                  </span>
                )}
                <span className="block text-moss/70">
                  {v.lead_quota_per_month} leadplaatsen p/m · {v.paid_seats} extra plekken · lead{" "}
                  {formatEuro(Number(v.base_lead_price_ex_vat))} +{" "}
                  {formatEuro(Number(v.extra_product_price_ex_vat))} per extra product
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-background p-5" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">Nieuwe contractversie</h3>
        <p className="mt-1 text-sm text-moss/70">
          Gaat in op de eerste van een maand, op zijn vroegst {fmt(data.earliestStart)}. Bestaande
          versies worden nooit aangepast.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="c-pkg">Pakket</Label>
            <select
              id="c-pkg"
              value={pkg}
              onChange={(e) => setPkg(e.target.value as PackageCode | "")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Geen pakket (maatwerk aantal)</option>
              {SELECTABLE_PACKAGES.map((k) => (
                <option key={k} value={k}>
                  {PACKAGES[k].label} — {PACKAGES[k].leads} leads, {PACKAGES[k].includedSeats} extra plek(ken) inbegrepen
                </option>
              ))}
            </select>
          </div>
          {pkg && (
            <fieldset className="space-y-1.5 text-sm">
              <legend className="mb-1.5 text-sm font-medium">Facturatie</legend>
              <label className="flex items-start gap-2">
                <input type="radio" name="c-mode" checked={mode === "actual_delivered"} onChange={() => setMode("actual_delivered")} />
                <span>Werkelijke levering — €99 vast + alleen geleverde leads. Vroeg stoppen: resterende maanden × €99.</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" name="c-mode" checked={mode === "fixed_package"} onChange={() => setMode("fixed_package")} />
                <span>Vast pakketbedrag — {formatEuro(packageFee(pkg))} per maand, ook bij minder levering. Vroeg stoppen: resterende maanden × {formatEuro(packageFee(pkg))}.</span>
              </label>
            </fieldset>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-quota">Leadplaatsen per maand</Label>
            <Input
              id="c-quota"
              type="number"
              min={0}
              value={pkg ? PACKAGES[pkg].leads : quota}
              disabled={!!pkg}
              onChange={(e) => setQuota(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-seats">Extra gebruikersplekken</Label>
            <Input
              id="c-seats"
              type="number"
              min={0}
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
            <span className="text-xs text-moss/60">
              Nu {data.memberCount} gebruiker(s), 1 inbegrepen
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-from">Ingangsdatum</Label>
            <select
              id="c-from"
              value={start}
              onChange={(e) => setValidFrom(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {fmt(m)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="c-note">Notitie (optioneel)</Label>
          <Input id="c-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {pkg ? (
          <div className="mt-4 rounded-xl bg-muted p-4 text-sm text-moss/80">
            Vaste maandkosten: <strong>{formatEuro(fixedMonthlyCost(mode, pkg, seats))}</strong> excl. btw
            {mode === "actual_delivered"
              ? `, plus ${formatEuro(15)} per werkelijk geleverde lead.`
              : `, ${PACKAGES[pkg].leads} leads inbegrepen; meerlevering ${formatEuro(15)} per lead.`}{" "}
            Extra product in dezelfde aanvraag: + {formatEuro(10)}. Minimaal 6 maanden, daarna 1 maand opzegtermijn.
          </div>
        ) : (
        <div className="mt-4 rounded-xl bg-muted p-4 text-sm text-moss/80">
          Platform {formatEuro(CONTRACT_DEFAULTS.platformFee)} + {seats} ×{" "}
          {formatEuro(CONTRACT_DEFAULTS.seatFee)} + {quota} ×{" "}
          {formatEuro(CONTRACT_DEFAULTS.baseLeadPrice)} ={" "}
          <strong>{formatEuro(contractMonthlyEstimate(quota, seats))}</strong> per maand excl. btw.
          Extra producten in dezelfde toewijzing: +{" "}
          {formatEuro(CONTRACT_DEFAULTS.extraProductPrice)} per product.
        </div>
        )}
        <Button className="mt-4" onClick={() => save.mutate()} disabled={save.isPending}>
          Contractversie opslaan
        </Button>
      </section>
    </div>
  );
}
