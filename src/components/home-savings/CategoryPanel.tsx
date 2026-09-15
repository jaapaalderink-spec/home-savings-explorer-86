import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Info } from "lucide-react";
import { CATEGORIES, CONTRACT_META } from "./categories";
import {
  EnergyContractType,
  AdviceResult,
  CONFIDENCE_LABEL,
  formatEuro,
  buildAdviceText,
} from "@/lib/home-savings";
import { CountUp } from "./CountUp";
import { buildOfferteHref } from "./offerte-params";
import { EnergyProfileForm } from "./EnergyProfileForm";
import { DEFAULT_PROFILE, type EnergyProfile } from "@/lib/home-savings/scenario";

export interface HomeInputs {
  profile: EnergyProfile;
  contract: { type: EnergyContractType };
  owned: Record<string, boolean>;
}

export const EMPTY_INPUTS: HomeInputs = {
  profile: { ...DEFAULT_PROFILE },
  contract: { type: "onbekend" },
  owned: { solar: false, heatpump: false, battery: false, ev: false, airco: false },
};

export const OWNED_LABEL: Record<string, string> = {
  solar: "Ik heb al zonnepanelen",
  heatpump: "Ik heb al een warmtepomp",
  battery: "Ik heb al een thuisbatterij",
  ev: "Ik heb al een laadpaal",
  airco: "Ik heb al een airco",
};

interface Props {
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  inputs: HomeInputs;
  onChange: (patch: Partial<HomeInputs>) => void;
  results: Record<string, AdviceResult | null>;
  onCalculate: (id: string) => void;
}

const META_BY_ID = Object.fromEntries(
  [...CATEGORIES, CONTRACT_META].map((c) => [c.id, c]),
) as Record<string, (typeof CATEGORIES)[number]>;

export function CategoryPanel({
  openId,
  onOpenChange,
  inputs,
  onChange,
  results,
  onCalculate,
}: Props) {
  const meta = openId ? META_BY_ID[openId] : null;
  const result = openId ? (results[openId] ?? null) : null;

  return (
    <Sheet open={openId !== null} onOpenChange={(o) => onOpenChange(o ? openId : null)}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-[480px]"
        style={{ backgroundColor: "var(--color-cloud)" }}
      >
        {meta && (
          <>
            <SheetHeader
              className="px-6 pb-3 pt-6"
              style={{ backgroundColor: "var(--color-background)" }}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: "#f0b84f" }}
                >
                  <meta.icon size={22} strokeWidth={2.4} className="text-moss" />
                </span>
                <div>
                  <SheetTitle className="text-xl text-ink">{meta.label}</SheetTitle>
                  <SheetDescription className="text-moss/70">{meta.short}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="px-6 py-5">
              {openId !== "contract" && (
                <div className="mb-5">
                  <ToggleRow
                    label={OWNED_LABEL[openId!] ?? "Ik heb dit al"}
                    checked={!!inputs.owned[openId!]}
                    onChange={(c) => onChange({ owned: { ...inputs.owned, [openId!]: c } })}
                  />
                  {inputs.owned[openId!] && (
                    <p className="mt-2 text-[11px] leading-relaxed text-moss/60">
                      Dit hoort bij je huidige woning. Alleen uitbreiding of vervanging telt als
                      nieuwe maatregel.
                    </p>
                  )}
                </div>
              )}

              {openId === "contract" && (
                <ContractForm
                  v={inputs.contract}
                  onChange={(v) => onChange({ contract: { ...inputs.contract, ...v } })}
                />
              )}
              <EnergyProfileForm
                category={openId ?? undefined}
                value={inputs.profile}
                onChange={(profile) => onChange({ profile })}
              />

              {openId !== "contract" && (
                <div className="mt-6">
                  <ResultCard
                    categoryId={openId!}
                    result={result}
                    offerteHref={buildOfferteHref(inputs, results, openId!)}
                    onCalculate={() => onCalculate(openId!)}
                  />
                </div>
              )}

              <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-moss/60">
                <Info size={13} className="mt-0.5 shrink-0" />
                Dit is een indicatieve berekening. Voor een preciezer advies op maat, vraag gratis
                en vrijblijvend offertes aan.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- shared form bits ---------------- */

function TileGroup<T extends string>({
  options,
  value,
  onPick,
  multi,
}: {
  options: { id: T; label: string; desc?: string }[];
  value: T[];
  onPick: (v: T[]) => void;
  multi?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((o) => {
        const sel = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() =>
              onPick(multi ? (sel ? value.filter((x) => x !== o.id) : [...value, o.id]) : [o.id])
            }
            className="focus-brand rounded-xl border-2 p-3 text-left transition-colors"
            style={{
              borderColor: sel ? "#4f8f62" : "transparent",
              backgroundColor: sel ? "#eaf3ed" : "var(--color-background)",
            }}
          >
            <span className="block text-sm font-semibold text-ink">{o.label}</span>
            {o.desc && <span className="mt-0.5 block text-[11px] text-moss/60">{o.desc}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <div
      className="flex items-center justify-between rounded-xl bg-background p-3"
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <span className="text-sm font-semibold text-ink">{label}</span>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function ContractForm({
  v,
  onChange,
}: {
  v: HomeInputs["contract"];
  onChange: (v: Partial<HomeInputs["contract"]>) => void;
}) {
  return (
    <TileGroup
      options={[
        { id: "vast", label: "Vast", desc: "Vaste prijs per kWh" },
        { id: "dynamisch", label: "Dynamisch", desc: "Volgt de beursprijs" },
        { id: "variabel", label: "Variabel", desc: "Prijs wijzigt per periode" },
        { id: "onbekend", label: "Weet ik niet", desc: "Laat ons het adviseren" },
      ]}
      value={[v.type]}
      onPick={(x) => onChange({ type: x[0] ?? v.type })}
    />
  );
}

/* ---------------- result card ---------------- */

function ResultCard({
  offerteHref,
  result,
  onCalculate,
}: {
  categoryId: string;
  offerteHref: string;
  result: AdviceResult | null;
  onCalculate: () => void;
}) {
  if (!result) {
    return (
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: "var(--color-background)", boxShadow: "var(--shadow-panel)" }}
      >
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-2/3 rounded bg-cloud" />
          <div className="h-8 w-1/2 rounded bg-cloud" />
          <div className="h-3 w-full rounded bg-cloud" />
        </div>
        <Button
          onClick={onCalculate}
          className="mt-4 w-full"
          size="lg"
          style={{ backgroundColor: "#4f8f62", color: "white" }}
        >
          <Sparkles size={18} className="mr-1.5" /> Bereken je besparing
        </Button>
      </div>
    );
  }
  return (
    <div
      className="animate-rise rounded-2xl p-5"
      style={{ backgroundColor: "var(--color-background)", boxShadow: "var(--shadow-panel-lg)" }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-moss/60">
        Geschatte besparing per jaar
      </p>
      <p className="mt-1 text-3xl font-bold text-leaf">
        <CountUp value={result.practicalSavings} prefix="€ " />
      </p>
      <p className="text-sm text-moss/70">
        bandbreedte {formatEuro(result.range.min)} – {formatEuro(result.range.max)}
      </p>

      {result.beforeAfter && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-cloud p-2.5">
            <p className="text-[11px] text-moss/60">{result.beforeAfter.label} — nu</p>
            <p className="font-semibold text-ink">{result.beforeAfter.before}</p>
          </div>
          <div className="rounded-lg bg-cloud p-2.5">
            <p className="text-[11px] text-moss/60">na de maatregel</p>
            <p className="font-semibold text-leaf">{result.beforeAfter.after}</p>
          </div>
        </div>
      )}

      <p className="mt-3 text-sm leading-relaxed text-ink">
        {buildAdviceText(result.explanationReasons)}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {result.badges.map((b) => (
          <Badge
            key={b}
            variant="secondary"
            className="text-[11px]"
            style={{ backgroundColor: "#f0b84f22", color: "#7a5a16" }}
          >
            {b}
          </Badge>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-moss/60">{CONFIDENCE_LABEL[result.confidence]}</p>
      <Button type="button" variant="outline" className="mt-3 w-full" onClick={onCalculate}>
        Verwijder uit bespaarpakket
      </Button>

      <Button
        asChild
        className="mt-4 w-full"
        size="lg"
        style={{ backgroundColor: "#4f8f62", color: "white" }}
      >
        <a href={offerteHref}>
          Vraag gratis offertes aan <ArrowRight size={18} className="ml-1.5" />
        </a>
      </Button>
    </div>
  );
}
