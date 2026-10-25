import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { getLeadSettings, saveLeadSettings } from "@/lib/lead-settings.functions";
import { searchPlaces } from "@/lib/place-search";
import { PROVINCES } from "@/lib/service-area-policy";
import {
  ACHTERAF_TEXT,
  SETTINGS_COLUMNS,
  areaProblem,
  columnTotals,
  companyTotal,
  estimateMonth,
  remaining,
  rowTotal,
  type Area,
  type RecipientRow,
} from "@/lib/lead-settings-policy";

const panel = { boxShadow: "var(--shadow-panel)" };
const eur = (n: number) =>
  n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

type Data = Awaited<ReturnType<typeof getLeadSettings>>;
type Row = Data["rows"][number];

export function LeadSettings() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["lead-settings"],
    queryFn: () => getLeadSettings(),
  });
  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (error || !data)
    return (
      <div role="alert" className="space-y-3 text-sm text-moss">
        <p>{(error as Error | null)?.message ?? "Leadinstellingen konden niet worden geladen."}</p>
        <Button variant="outline" onClick={() => refetch()}>Opnieuw proberen</Button>
      </div>
    );
  return <Editor key={JSON.stringify(data.rows)} data={data} />;
}

function Editor({ data }: { data: Data }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>(data.rows);
  const [acceptExtra, setAcceptExtra] = useState(data.acceptExtraProducts);
  const [open, setOpen] = useState<string | null>(null);
  const canEdit = data.canEdit;

  const policyRows: RecipientRow[] = rows as unknown as RecipientRow[];
  const totals = columnTotals(policyRows);
  const total = companyTotal(policyRows);
  const estimate = estimateMonth(data.terms, total);

  const problems = useMemo(() => {
    const out: string[] = [];
    rows.forEach((r) =>
      r.services.forEach((s) => {
        if (!s.enabled) return;
        const cs = data.companyServices.find((c) => c.category === s.category)!;
        const label = SETTINGS_COLUMNS.find((c) => c.category === s.category)!.label;
        if (!cs.active) out.push(`${r.name} – ${label}: deze dienst staat voor het bedrijf uit (tabblad Werkgebied).`);
        const p = areaProblem(cs.area, s.area as Area);
        if (p) out.push(`${r.name} – ${label}: ${p}`);
      }),
    );
    return out;
  }, [rows, data.companyServices]);

  const update = (userId: string, fn: (r: Row) => Row) =>
    setRows((rs) => rs.map((r) => (r.userId === userId ? fn(r) : r)));
  const setCell = (userId: string, category: string, patch: Partial<Row["services"][number]>) =>
    update(userId, (r) => ({
      ...r,
      services: r.services.map((s) => (s.category === category ? { ...s, ...patch } : s)),
    }));

  const save = useMutation({
    mutationFn: () =>
      saveLeadSettings({
        data: {
          acceptExtraProducts: acceptExtra,
          rows: rows.map((r) => ({
            userId: r.userId,
            paused: r.paused,
            canEditSettings: r.canEditSettings,
            services: r.services.map((s) => ({
              category: s.category,
              enabled: s.enabled,
              monthlyMax: s.monthlyMax,
              area: s.area as never,
            })),
          })),
        },
      }),
    onSuccess: (res) => {
      toast.success(`Leadinstellingen opgeslagen. Bedrijfstotaal: ${res.companyTotal} leads per maand.`);
      qc.invalidateQueries({ queryKey: ["lead-settings"] });
      qc.invalidateQueries({ queryKey: ["partner-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <p className="text-sm text-moss/70">
        Bepaal per ontvanger en per dienst hoeveel nieuwe leads je per maand wilt ontvangen. De
        aantallen samen vormen je bedrijfstotaal. Nul betekent: geen nieuwe leads voor die dienst
        bij die ontvanger. Wijzigingen gelden voor toekomstige leveringen; eerdere leads blijven
        behouden.
        {!data.settingsEnabled && " Je hebt nog niets opgeslagen; tot die tijd geldt je huidige contractverdeling."}
      </p>

      <div className="overflow-x-auto rounded-2xl bg-background" style={panel}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-moss/10 text-left text-xs uppercase tracking-wide text-moss/60">
              <th className="p-3">Ontvanger</th>
              {SETTINGS_COLUMNS.map((c) => (
                <th key={c.category} className="p-3 text-right">{c.label}</th>
              ))}
              <th className="p-3 text-right">Totaal per maand</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <RowView
                key={r.userId}
                row={r}
                open={open === r.userId}
                canEdit={canEdit}
                isOwnerView={data.owner}
                companyServices={data.companyServices}
                onToggle={() => setOpen(open === r.userId ? null : r.userId)}
                onCell={(cat, patch) => setCell(r.userId, cat, patch)}
                onRow={(patch) => update(r.userId, (x) => ({ ...x, ...patch }))}
              />
            ))}
            <tr className="border-t-2 border-moss/20 font-bold text-ink">
              <td className="p-3">Bedrijfstotaal</td>
              {SETTINGS_COLUMNS.map((c) => (
                <td key={c.category} className="p-3 text-right" data-testid={`total-${c.category}`}>
                  {totals[c.category]}
                </td>
              ))}
              <td className="p-3 text-right" data-testid="company-total">{total}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <label className="flex items-start gap-3 rounded-2xl bg-background p-4 text-sm" style={panel}>
        <Checkbox
          checked={acceptExtra}
          disabled={!canEdit}
          onCheckedChange={(v) => setAcceptExtra(v === true)}
          className="mt-0.5"
        />
        <span>
          <strong className="text-ink">Ook extra producten in dezelfde aanvraag ontvangen</strong>
          <br />
          <span className="text-moss/70">
            Vraagt een klant meerdere diensten die jij aanbiedt in je werkgebied, dan krijg je die
            als één lead. Eén primair product verbruikt één plaats; ieder extra product kost{" "}
            {eur(data.terms.extraProductPrice)} en verbruikt geen extra plaats. Het aantal ontvangen
            productonderdelen kan daardoor afwijken van het aantal unieke leads.
          </span>
        </span>
      </label>

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <section className="rounded-2xl bg-background p-5 text-sm" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">Kosten per maand (excl. btw)</h3>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5">
          <dt>Platformkosten</dt><dd className="text-right">{eur(estimate.platform)}</dd>
          <dt>
            Extra betaalde accountmanagerplaatsen: {data.terms.paidSeats} × {eur(data.terms.seatFee)}
          </dt>
          <dd className="text-right">{eur(estimate.seats)}</dd>
          <dt>Gewenste leadplaatsen: {total} × {eur(data.terms.baseLeadPrice)}</dt>
          <dd className="text-right">{eur(estimate.leads)}</dd>
          <dt className="text-moss/70">Extra product binnen dezelfde geleverde aanvraag</dt>
          <dd className="text-right text-moss/70">+ {eur(data.terms.extraProductPrice)} per stuk</dd>
          <dt className="border-t border-moss/10 pt-2 font-bold text-ink">Maandraming bij volledige levering</dt>
          <dd className="border-t border-moss/10 pt-2 text-right font-bold text-ink" data-testid="estimate">
            {eur(estimate.total)}
          </dd>
        </dl>
        <div className="mt-4 rounded-xl bg-muted p-3">
          <p className="font-semibold text-ink">Werkelijk opgebouwd deze maand</p>
          <p className="mt-1 text-moss/80">
            {data.month.deliveredPrimary} leads geleverd, {data.month.extraParts} extra
            productonderdelen · leadkosten {eur(data.month.accruedVariable)} + vaste kosten{" "}
            {eur(estimate.platform + estimate.seats)} ={" "}
            <strong>{eur(data.month.accruedVariable + estimate.platform + estimate.seats)}</strong>
          </p>
        </div>
        <p className="mt-3 text-moss/70">
          {data.terms.contract ? "Op basis van je geldende contractafspraken." : "Op basis van de standaardtarieven."}{" "}
          De raming is geen vast bedrag en geen plafond. Aantallen wijzigen activeert nooit een extra
          betaalde accountmanagerplaats; dat gaat alleen via een uitnodiging met kostenbevestiging.
        </p>
        <p className="mt-2 font-semibold text-ink">{ACHTERAF_TEXT}</p>
      </section>

      {canEdit ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => save.mutate()} disabled={save.isPending || problems.length > 0}>
            {save.isPending ? "Opslaan…" : "Leadinstellingen opslaan"}
          </Button>
          <Button variant="outline" onClick={() => { setRows(data.rows); setAcceptExtra(data.acceptExtraProducts); }}>
            Wijzigingen ongedaan maken
          </Button>
        </div>
      ) : (
        <p className="text-sm text-moss/70">
          Alleen het hoofdaccount, of een accountmanager met toestemming, kan deze instellingen wijzigen.
        </p>
      )}
    </div>
  );
}

function RowView({
  row, open, canEdit, isOwnerView, companyServices, onToggle, onCell, onRow,
}: {
  row: Row;
  open: boolean;
  canEdit: boolean;
  isOwnerView: boolean;
  companyServices: Data["companyServices"];
  onToggle: () => void;
  onCell: (category: string, patch: Partial<Row["services"][number]>) => void;
  onRow: (patch: Partial<Row>) => void;
}) {
  return (
    <>
      <tr className="border-b border-moss/10 align-top">
        <td className="p-3">
          <p className="font-semibold text-ink">{row.name}</p>
          <p className="text-xs text-moss/60">
            {row.role === "owner" ? "Hoofdaccount" : "Accountmanager"}
            {row.paused && " · gepauzeerd"}
          </p>
        </td>
        {SETTINGS_COLUMNS.map((c) => {
          const s = row.services.find((x) => x.category === c.category)!;
          return (
            <td key={c.category} className="p-3 text-right">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                aria-label={`${c.label} voor ${row.name}`}
                disabled={!canEdit}
                value={s.enabled ? s.monthlyMax : 0}
                onChange={(e) => {
                  const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                  onCell(c.category, { monthlyMax: n, enabled: n > 0 ? true : s.enabled });
                }}
                className="ml-auto h-9 w-20 text-right"
              />
              <p className="mt-1 text-xs text-moss/60">
                {s.delivered} geleverd · nog {remaining(s.enabled ? s.monthlyMax : 0, s.delivered)}
              </p>
            </td>
          );
        })}
        <td className="p-3 text-right font-semibold text-ink">
          {rowTotal(row as unknown as RecipientRow)}
        </td>
        <td className="p-3">
          <Button variant="outline" size="sm" onClick={onToggle} aria-expanded={open}>
            {open ? "Sluiten" : "Diensten & gebied"}
          </Button>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-moss/10 bg-muted/40">
          <td colSpan={SETTINGS_COLUMNS.length + 3} className="p-4">
            <div className="mb-4 flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2">
                <Switch
                  checked={!row.paused}
                  disabled={!canEdit}
                  onCheckedChange={(v) => onRow({ paused: !v })}
                />
                Nieuwe toewijzingen {row.paused ? "gepauzeerd" : "actief"}
              </label>
              {isOwnerView && row.role === "account_manager" && (
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={row.canEditSettings}
                    onCheckedChange={(v) => onRow({ canEditSettings: v === true })}
                  />
                  Mag leadinstellingen wijzigen
                </label>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {SETTINGS_COLUMNS.map((c) => {
                const s = row.services.find((x) => x.category === c.category)!;
                const cs = companyServices.find((x) => x.category === c.category)!;
                return (
                  <ServiceArea
                    key={c.category}
                    label={c.label}
                    service={s}
                    companyActive={cs.active}
                    companyAreaLabel={cs.areaLabel}
                    canEdit={canEdit}
                    onChange={(patch) => onCell(c.category, patch)}
                  />
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ServiceArea({
  label, service, companyActive, companyAreaLabel, canEdit, onChange,
}: {
  label: string;
  service: Row["services"][number];
  companyActive: boolean;
  companyAreaLabel: string | null;
  canEdit: boolean;
  onChange: (patch: Partial<Row["services"][number]>) => void;
}) {
  const area = service.area as Area;
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);
  const results = useQuery({
    queryKey: ["places", debounced],
    queryFn: () => searchPlaces(debounced),
    enabled: debounced.length >= 2,
  });
  const setArea = (a: Area) => onChange({ area: a as never });

  return (
    <fieldset disabled={!canEdit} className="space-y-2 rounded-xl bg-background p-3 text-sm">
      <label className="flex items-center gap-2 font-semibold text-ink">
        <Checkbox
          checked={service.enabled}
          onCheckedChange={(v) => onChange({ enabled: v === true })}
        />
        {label} behandelen
      </label>
      {!companyActive && (
        <p className="text-xs text-moss/70">Staat voor het bedrijf uit; zet de dienst eerst aan bij Werkgebied.</p>
      )}
      {service.enabled && (
        <>
          <select
            aria-label={`Werkgebied ${label}`}
            className="h-9 w-full rounded-md border border-input bg-background px-2"
            value={area.mode ?? "company"}
            onChange={(e) => {
              const m = e.target.value;
              if (m === "company") setArea({ mode: null });
              else if (m === "national") setArea({ mode: "national" });
              else if (m === "provinces") setArea({ mode: "provinces", provinces: [] });
              else setArea({ mode: "radius", centerLat: 52.1, centerLng: 5.1, radiusKm: 30, centerLabel: "" });
            }}
          >
            <option value="company">Volgt bedrijfsgebied{companyAreaLabel ? ` (${companyAreaLabel})` : ""}</option>
            <option value="radius">Straal rond een plaats</option>
            <option value="provinces">Provincie(s)</option>
            <option value="national">Heel Nederland</option>
          </select>
          {area.mode === "provinces" && (
            <div className="grid grid-cols-2 gap-1">
              {PROVINCES.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={area.provinces.includes(p)}
                    onCheckedChange={(v) =>
                      setArea({
                        mode: "provinces",
                        provinces: v ? [...area.provinces, p] : area.provinces.filter((x) => x !== p),
                      })
                    }
                  />
                  {p}
                </label>
              ))}
            </div>
          )}
          {area.mode === "radius" && (
            <div className="space-y-2">
              <p className="text-xs">Plaats: <strong>{area.centerLabel || "nog niet gekozen"}</strong></p>
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek een plaats" />
              {debounced.length >= 2 && (
                <ul className="divide-y divide-moss/10 rounded-md border border-input text-xs">
                  {results.data?.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="w-full p-2 text-left hover:bg-muted"
                        onClick={() => {
                          setArea({ ...area, centerLat: r.lat, centerLng: r.lng, centerLabel: r.label });
                          setQuery("");
                        }}
                      >
                        {r.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="flex items-center gap-2 text-xs">
                Straal (km)
                <Input
                  type="number"
                  min={1}
                  max={250}
                  value={area.radiusKm}
                  onChange={(e) =>
                    setArea({ ...area, radiusKm: Math.min(250, Math.max(1, Math.floor(Number(e.target.value) || 1))) })
                  }
                  className="h-8 w-20"
                />
              </label>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
