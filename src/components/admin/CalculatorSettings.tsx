/** Calculatorinstellingen — centrale rekenwaarden; alleen voor beheer. */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Plus, RotateCcw, Rocket, Save, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SETTINGS,
  SETTING_BY_KEY,
  SETTING_TABS,
  defaultValue,
  validateOverrides,
  withOverrides,
  type Overrides,
  type SettingDef,
  type SettingTab,
  type SettingValue,
} from "@/lib/home-savings/calculator-settings";
import { DEFAULT_ENERGY_CONFIG, type TariffSet } from "@/lib/home-savings/config";
import {
  DEFAULT_PROFILE,
  MEASURES,
  MEASURE_LABEL,
  calculateScenario,
} from "@/lib/home-savings/scenario";
import {
  getCalculatorConfigAdmin,
  publishCalculatorDraft,
  saveCalculatorDraft,
} from "@/lib/calculator-config.functions";

const fullValues = (stored: Record<string, unknown> | null | undefined): Overrides =>
  Object.fromEntries(
    SETTINGS.map((s) => [s.key, (stored?.[s.key] as SettingValue) ?? defaultValue(s.key)]),
  );
const fmtDate = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })
    : "—";
const show = (d: SettingDef, v: unknown) => {
  if (d.kind === "number") return String(+((v as number) * (d.scale ?? 1)).toFixed(4)).replace(".", ",");
  if (d.kind === "list") return (v as number[]).join("; ");
  if (d.kind === "boolean") return v ? "aan" : "uit";
  if (d.kind === "select") return d.options[String(v)] ?? String(v);
  return String(v);
};

// Testwoning for the preview: gas-heated, 3.500 kWh, an EV, all measures.
const TEST_PROFILE = { ...DEFAULT_PROFILE, hasEv: true };

export function CalculatorSettings() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["calculator-config"],
    queryFn: () => getCalculatorConfigAdmin(),
  });
  const [tab, setTab] = useState<SettingTab>("general");
  const [values, setValues] = useState<Overrides>(() => fullValues(null));
  const [text, setText] = useState<Record<string, string>>({});
  const [tariffs, setTariffs] = useState<TariffSet[]>([]);
  const [resetKeys, setResetKeys] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const source = data?.draft ?? data?.published;
  const sourceValues = useMemo(() => fullValues(source?.values as never), [source]);
  useEffect(() => {
    setValues(sourceValues);
    setText({});
    setTariffs(((source?.tariff_sets as TariffSet[] | undefined) ?? []).map((t) => ({ ...t })));
    setResetKeys([]);
  }, [source, sourceValues]);

  const errors = useMemo(() => validateOverrides(values), [values]);
  const dirty =
    JSON.stringify(values) !== JSON.stringify(sourceValues) ||
    JSON.stringify(tariffs) !== JSON.stringify(source?.tariff_sets ?? []);

  const lastChange = useMemo(() => {
    const m: Record<string, string> = {};
    for (const h of data?.history ?? []) if (!m[h.setting_key]) m[h.setting_key] = h.changed_at;
    return m;
  }, [data]);

  const save = useMutation({
    mutationFn: () => saveCalculatorDraft({ data: { values, tariffSets: tariffs, resetKeys } }),
    onSuccess: (r) => {
      toast.success(`Concept opgeslagen (${r.changed} wijziging${r.changed === 1 ? "" : "en"}). Nog niet live.`);
      qc.invalidateQueries({ queryKey: ["calculator-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const publish = useMutation({
    mutationFn: () => publishCalculatorDraft(),
    onSuccess: (r) => {
      toast.success(`Versie ${r.version} is gepubliceerd en actief voor consumenten.`);
      qc.invalidateQueries({ queryKey: ["calculator-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = useMemo(() => {
    const run = (v: Record<string, unknown>) =>
      withOverrides(v, () => calculateScenario(TEST_PROFILE, MEASURES));
    const live = run((data?.published?.values as Record<string, unknown>) ?? {});
    const draft = Object.keys(errors).length ? null : run(values);
    return { live, draft };
  }, [values, errors, data]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;

  const setValue = (key: string, v: SettingValue) => {
    setValues((s) => ({ ...s, [key]: v }));
    setResetKeys((r) => r.filter((k) => k !== key));
  };
  const tabSettings = SETTINGS.filter((s) => s.tab === tab);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-ink">Calculatorinstellingen</h2>
            <p className="text-sm text-moss/70">
              Actief voor consumenten:{" "}
              <strong>
                {data?.published ? `versie ${data.published.version}` : "standaardwaarden (nog niets gepubliceerd)"}
              </strong>
              {data?.published && ` sinds ${fmtDate(data.published.published_at)}`}.{" "}
              {data?.draft
                ? `Concept versie ${data.draft.version}, laatst opgeslagen ${fmtDate(data.draft.updated_at)}.`
                : "Geen concept."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => save.mutate()}
              disabled={!dirty || Object.keys(errors).length > 0 || save.isPending}
            >
              <Save size={15} className="mr-1.5" /> Opslaan
            </Button>
            <Button
              onClick={() => setConfirmPublish(true)}
              disabled={!data?.draft || dirty || publish.isPending}
              style={{ backgroundColor: "#4f8f62", color: "white" }}
            >
              <Rocket size={15} className="mr-1.5" /> Publiceren
            </Button>
          </div>
        </div>
        {dirty && (
          <p className="mt-2 text-xs text-moss/70">
            Je hebt niet-opgeslagen wijzigingen. Die hebben geen invloed op consumenten; ook
            opgeslagen wijzigingen worden pas actief na publiceren.
          </p>
        )}
      </section>

      <nav className="flex flex-wrap gap-1.5" aria-label="Instellingsgroepen">
        {SETTING_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              tab === t.id ? "bg-moss text-cloud" : "bg-background text-moss hover:bg-moss/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-ink">{SETTING_TABS.find((t) => t.id === tab)?.label}</h3>
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} className="mr-1" /> Standaardwaarden herstellen
          </Button>
        </div>
        <div className="divide-y">
          {tabSettings.map((d) => {
            const v = values[d.key];
            const err = errors[d.key];
            return (
              <div key={d.key} className="grid gap-2 py-3 md:grid-cols-[1fr_220px]">
                <div>
                  <p className="text-sm font-semibold text-ink">{d.label}</p>
                  {d.help && <p className="text-xs text-moss/70">{d.help}</p>}
                  <p className="mt-1 text-[11px] text-moss/60">
                    Standaard: {show(d, defaultValue(d.key))} {d.kind === "number" ? d.unit : ""}
                    {d.kind === "number" && ` · bereik ${d.min}–${d.max}`}
                    {" · "}laatst gewijzigd: {fmtDate(lastChange[d.key])}
                  </p>
                </div>
                <div>
                  <Field
                    def={d}
                    value={v!}
                    text={text[d.key]}
                    onText={(t) => setText((s) => ({ ...s, [d.key]: t }))}
                    onChange={(nv) => setValue(d.key, nv)}
                  />
                  {err && <p className="mt-1 text-xs text-destructive">{err}</p>}
                </div>
              </div>
            );
          })}
        </div>
        {tab === "general" && (
          <>
            <LegalRules />
            <TariffSets value={tariffs} onChange={setTariffs} />
          </>
        )}
        {tab === "rules" && <LegalRules />}
      </section>

      <section className="rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
        <h3 className="flex items-center gap-1.5 font-semibold text-ink">
          <Scale size={16} /> Voorbeeldberekening
        </h3>
        <p className="text-xs text-moss/70">
          Testwoning met gasketel, 3.500 kWh stroom, 1.500 m³ gas en een elektrische auto, met alle
          vijf maatregelen. Vergelijkt de actieve instellingen met wat je nu op dit scherm hebt staan.
        </p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-moss/70">
            <tr>
              <th className="py-1">Maatregel (los)</th>
              <th className="py-1 text-right">Actief</th>
              <th className="py-1 text-right">Met wijzigingen</th>
            </tr>
          </thead>
          <tbody>
            {MEASURES.map((m) => (
              <tr key={m} className="border-t">
                <td className="py-1.5">{MEASURE_LABEL[m]}</td>
                <td className="py-1.5 text-right">{eur(preview.live.standalone[m])}</td>
                <Diff a={preview.live.standalone[m]} b={preview.draft?.standalone[m]} />
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className="py-1.5">Totaal pakket per jaar</td>
              <td className="py-1.5 text-right">{eur(preview.live.savings)}</td>
              <Diff a={preview.live.savings} b={preview.draft?.savings} />
            </tr>
          </tbody>
        </table>
        {!preview.draft && (
          <p className="mt-2 text-xs text-destructive">Corrigeer eerst de ongeldige waarden.</p>
        )}
      </section>

      <section className="rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
        <h3 className="flex items-center gap-1.5 font-semibold text-ink">
          <History size={16} /> Wijzigingshistorie
        </h3>
        {data?.history.length ? (
          <ul className="mt-2 max-h-80 divide-y overflow-y-auto text-sm">
            {data.history.map((h) => {
              const d = SETTING_BY_KEY[h.setting_key];
              return (
                <li key={h.id} className="py-2">
                  <span className="text-xs text-moss/60">
                    {fmtDate(h.changed_at)} · {h.who} · versie{" "}
                    {(h.version as { version?: number } | null)?.version ?? "?"}
                  </span>
                  <br />
                  {h.action === "publish" ? (
                    <strong>Gepubliceerd</strong>
                  ) : (
                    <>
                      {d?.label ?? (h.setting_key === "tariffSets" ? "Leverancierstarieven" : h.setting_key)}
                      {h.action === "reset" && " (standaard hersteld)"}:{" "}
                      {d ? `${show(d, h.old_value)} → ${show(d, h.new_value)}` : "bijgewerkt"}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-moss/70">Nog geen wijzigingen.</p>
        )}
      </section>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Standaardwaarden herstellen?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle instellingen op het tabblad "{SETTING_TABS.find((t) => t.id === tab)?.label}"
              krijgen weer hun standaardwaarde. Daarna nog opslaan en publiceren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const keys = tabSettings.map((s) => s.key);
                setValues((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, defaultValue(k)])) }));
                setText({});
                setResetKeys((r) => [...new Set([...r, ...keys])]);
              }}
            >
              Herstellen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concept publiceren?</AlertDialogTitle>
            <AlertDialogDescription>
              Alle nieuwe berekeningen van consumenten gebruiken direct deze instellingen. Nieuwe
              aanvragen worden gekoppeld aan deze versie.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => publish.mutate()}>Publiceren</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const eur = (n: number | undefined) =>
  n === undefined ? "—" : `€ ${Math.round(n).toLocaleString("nl-NL")}`;

function Diff({ a, b }: { a: number | undefined; b: number | undefined }) {
  const changed = b !== undefined && a !== undefined && Math.round(a) !== Math.round(b);
  return (
    <td className={`py-1.5 text-right ${changed ? "font-semibold text-leaf" : ""}`}>{eur(b)}</td>
  );
}

function Field({
  def: d,
  value,
  text,
  onText,
  onChange,
}: {
  def: SettingDef;
  value: SettingValue;
  text: string | undefined;
  onText: (t: string) => void;
  onChange: (v: SettingValue) => void;
}) {
  if (d.kind === "boolean")
    return <Switch aria-label={d.label} checked={Boolean(value)} onCheckedChange={onChange} />;
  if (d.kind === "select")
    return (
      <select
        aria-label={d.label}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.entries(d.options).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    );
  if (d.kind === "list")
    return (
      <Input
        aria-label={d.label}
        value={text ?? (value as number[]).join("; ")}
        onChange={(e) => {
          onText(e.target.value);
          const nums = e.target.value
            .split(/[;\s]+/)
            .filter(Boolean)
            .map((x) => Number(x.replace(",", ".")));
          onChange(nums);
        }}
      />
    );
  const scale = d.scale ?? 1;
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={d.label}
        type="text"
        inputMode="decimal"
        value={text ?? String(+((value as number) * scale).toFixed(4)).replace(".", ",")}
        onChange={(e) => {
          onText(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          onChange(e.target.value.trim() === "" ? Number.NaN : n / scale);
        }}
      />
      <span className="w-20 shrink-0 text-xs text-moss/70">{d.unit}</span>
    </div>
  );
}

function LegalRules() {
  const L = DEFAULT_ENERGY_CONFIG.legalMinExport;
  return (
    <div className="mt-4 rounded-xl bg-cloud p-3 text-xs text-moss/80">
      <p className="font-semibold text-ink">Wettelijke regels (vast in de rekenlogica, niet aanpasbaar)</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>
          Salderen geldt tot en met {DEFAULT_ENERGY_CONFIG.netMeteringLastYear}; de regeling eindigt
          op 1 januari {DEFAULT_ENERGY_CONFIG.netMeteringLastYear + 1}.
        </li>
        <li>
          {L.fromYear}–{L.toYear}: minimale terugleververgoeding {Math.round(L.share * 100)}% van
          een aangenomen kale leveringsprijs (€ {String(L.bareSupplyPrice).replace(".", ",")}/kWh)
          bij vaste en variabele contracten.
        </li>
        <li>Aanschafprijzen en terugverdientijden worden nooit berekend.</li>
      </ul>
    </div>
  );
}

const EMPTY_TARIFF = (): TariffSet => ({
  id: crypto.randomUUID(),
  supplier: "",
  product: "",
  contractType: "vast",
  validFrom: new Date().toISOString().slice(0, 10),
  validTo: "",
  version: 1,
  source: "",
  checkedAt: new Date().toISOString().slice(0, 10),
  electricityPrice: 0.29,
  exportPrice: 0.05,
  exportCostModel: "perKwh",
  exportCost: 0,
});

function TariffSets({ value, onChange }: { value: TariffSet[]; onChange: (v: TariffSet[]) => void }) {
  const upd = (i: number, patch: Partial<TariffSet>) =>
    onChange(value.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const txt = (i: number, k: keyof TariffSet, label: string, type = "text") => (
    <label className="block text-[11px] text-moss/70">
      {label}
      <Input
        type={type}
        value={String(value[i]![k] ?? "")}
        onChange={(e) =>
          upd(i, {
            [k]: type === "number" ? Number(e.target.value.replace(",", ".")) : e.target.value,
          } as Partial<TariffSet>)
        }
      />
    </label>
  );
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-ink">Tarieven van energieleveranciers</h4>
        <Button size="sm" variant="outline" onClick={() => onChange([...value, EMPTY_TARIFF()])}>
          <Plus size={14} className="mr-1" /> Toevoegen
        </Button>
      </div>
      <p className="text-xs text-moss/70">
        Alleen gecontroleerde tarieven met bron en datum. Worden opgeslagen bij de configuratieversie.
      </p>
      {value.map((t, i) => (
        <div key={t.id} className="mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-3">
          {txt(i, "supplier", "Leverancier")}
          {txt(i, "product", "Product")}
          <label className="block text-[11px] text-moss/70">
            Contracttype
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={t.contractType}
              onChange={(e) => upd(i, { contractType: e.target.value as TariffSet["contractType"] })}
            >
              <option value="vast">Vast</option>
              <option value="variabel">Variabel</option>
              <option value="dynamisch">Dynamisch</option>
            </select>
          </label>
          {txt(i, "electricityPrice", "Stroomprijs (€/kWh)", "number")}
          {txt(i, "exportPrice", "Terugleververgoeding (€/kWh)", "number")}
          {txt(i, "exportCost", "Terugleverkosten (€/kWh)", "number")}
          {txt(i, "validFrom", "Geldig vanaf", "date")}
          {txt(i, "validTo", "Geldig tot", "date")}
          {txt(i, "checkedAt", "Laatst gecontroleerd", "date")}
          <div className="sm:col-span-2">{txt(i, "source", "Bron (link of document)")}</div>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <Trash2 size={14} className="mr-1" /> Verwijderen
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
