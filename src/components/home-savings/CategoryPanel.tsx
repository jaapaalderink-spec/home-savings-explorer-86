import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ArrowRight, Info } from "lucide-react";
import { CATEGORIES, CONTRACT_META, HOUSE_TYPES } from "./categories";
import {
  EnergyContractType,
  HouseType,
  EnergyLabel,
  AdviceResult,
  CONFIDENCE_LABEL,
  formatEuro,
  buildAdviceText,
} from "@/lib/home-savings";
import { CountUp } from "./CountUp";

export interface HomeInputs {
  solar: { panelCount: number; annualConsumptionKwh: number; alreadyHasSolar: boolean };
  heatpump: { houseType: HouseType; currentHeating: "gas" | "elektrisch" | "anders"; buildYear: number; energyLabel: EnergyLabel };
  battery: {
    annualConsumptionKwh: number;
    annualFeedInKwh: number;
    goals: Array<"besparing" | "dynamisch" | "zelfconsumptie" | "noodstroom">;
  };
  ev: { evStatus: "nu" | "binnen2jaar" | "nogniet"; annualKm: number };
  airco: { roomCount: number; houseType: HouseType };
  contract: { type: EnergyContractType };
}

export const EMPTY_INPUTS: HomeInputs = {
  solar: { panelCount: 8, annualConsumptionKwh: 3500, alreadyHasSolar: false },
  heatpump: { houseType: "rijtjeshuis", currentHeating: "gas", buildYear: 1985, energyLabel: "onbekend" },
  battery: { annualConsumptionKwh: 3500, annualFeedInKwh: 2000, goals: ["besparing"] },
  ev: { evStatus: "nogniet", annualKm: 12000 },
  airco: { roomCount: 1, houseType: "rijtjeshuis" },
  contract: { type: "onbekend" },
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

export function CategoryPanel({ openId, onOpenChange, inputs, onChange, results, onCalculate }: Props) {
  const meta = openId ? META_BY_ID[openId] : null;
  const result = openId ? results[openId] ?? null : null;

  return (
    <Sheet open={openId !== null} onOpenChange={(o) => onOpenChange(o ? openId : null)}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto p-0 sm:max-w-[480px]"
        style={{ backgroundColor: "var(--color-cloud)" }}
      >
        {meta && (
          <>
            <SheetHeader className="px-6 pb-3 pt-6" style={{ backgroundColor: "var(--color-background)" }}>
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
              {openId === "solar" && (
                <SolarForm v={inputs.solar} onChange={(v) => onChange({ solar: { ...inputs.solar, ...v } })} />
              )}
              {openId === "heatpump" && (
                <HeatPumpForm v={inputs.heatpump} onChange={(v) => onChange({ heatpump: { ...inputs.heatpump, ...v } })} />
              )}
              {openId === "battery" && (
                <BatteryForm v={inputs.battery} onChange={(v) => onChange({ battery: { ...inputs.battery, ...v } })} />
              )}
              {openId === "ev" && (
                <EVForm v={inputs.ev} onChange={(v) => onChange({ ev: { ...inputs.ev, ...v } })} />
              )}
              {openId === "airco" && (
                <AircoForm v={inputs.airco} onChange={(v) => onChange({ airco: { ...inputs.airco, ...v } })} />
              )}
              {openId === "contract" && (
                <ContractForm v={inputs.contract} onChange={(v) => onChange({ contract: { ...inputs.contract, ...v } })} />
              )}

              <div className="mt-6">
                <ResultCard
                  categoryId={openId!}
                  result={result}
                  onCalculate={() => onCalculate(openId!)}
                />
              </div>

              <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-moss/60">
                <Info size={13} className="mt-0.5 shrink-0" />
                Dit is een indicatieve berekening. Voor een preciezer advies op maat, vraag gratis en
                vrijblijvend offertes aan.
              </p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ---------------- shared form bits ---------------- */

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <span className="text-sm font-semibold text-ink">{children}</span>
      {hint && <span className="text-xs text-moss/60">{hint}</span>}
    </div>
  );
}

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
            onClick={() => onPick(multi ? (sel ? value.filter((x) => x !== o.id) : [...value, o.id]) : [o.id])}
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

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-background p-3" style={{ boxShadow: "var(--shadow-panel)" }}>
      <span className="text-sm font-semibold text-ink">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

/* ---------------- forms ---------------- */

function SolarForm({ v, onChange }: { v: HomeInputs["solar"]; onChange: (v: Partial<HomeInputs["solar"]>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel hint={`${v.panelCount} panelen`}>Aantal zonnepanelen</FieldLabel>
        <Slider value={[v.panelCount]} min={4} max={24} step={1} onValueChange={(x) => onChange({ panelCount: x[0] ?? v.panelCount })} />
      </div>
      <div>
        <FieldLabel hint={`${v.annualConsumptionKwh.toLocaleString("nl-NL")} kWh`}>Jaarlijks stroomverbruik</FieldLabel>
        <Slider value={[v.annualConsumptionKwh]} min={1500} max={8000} step={250} onValueChange={(x) => onChange({ annualConsumptionKwh: x[0] ?? v.annualConsumptionKwh })} />
      </div>
      <ToggleRow label="Heb je al zonnepanelen?" checked={v.alreadyHasSolar} onChange={(c) => onChange({ alreadyHasSolar: c })} />
    </div>
  );
}

function HeatPumpForm({ v, onChange }: { v: HomeInputs["heatpump"]; onChange: (v: Partial<HomeInputs["heatpump"]>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Type woning</FieldLabel>
        <TileGroup options={HOUSE_TYPES} value={[v.houseType]} onPick={(x) => onChange({ houseType: x[0] ?? v.houseType })} />
      </div>
      <div>
        <FieldLabel>Huidige verwarming</FieldLabel>
        <TileGroup
          options={[
            { id: "gas", label: "Gas" },
            { id: "elektrisch", label: "Elektrisch" },
            { id: "anders", label: "Anders" },
          ]}
          value={[v.currentHeating]}
          onPick={(x) => onChange({ currentHeating: x[0] ?? v.currentHeating })}
        />
      </div>
      <div>
        <FieldLabel hint={`${v.buildYear}`}>Bouwjaar woning</FieldLabel>
        <Slider value={[v.buildYear]} min={1930} max={2025} step={5} onValueChange={(x) => onChange({ buildYear: x[0] ?? v.buildYear })} />
      </div>
    </div>
  );
}

function BatteryForm({ v, onChange }: { v: HomeInputs["battery"]; onChange: (v: Partial<HomeInputs["battery"]>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel hint={`${v.annualConsumptionKwh.toLocaleString("nl-NL")} kWh`}>Jaarlijks stroomverbruik</FieldLabel>
        <Slider value={[v.annualConsumptionKwh]} min={1500} max={8000} step={250} onValueChange={(x) => onChange({ annualConsumptionKwh: x[0] ?? v.annualConsumptionKwh })} />
      </div>
      <div>
        <FieldLabel hint={`${v.annualFeedInKwh.toLocaleString("nl-NL")} kWh`}>Jaarlijkse teruglevering</FieldLabel>
        <Slider value={[v.annualFeedInKwh]} min={0} max={6000} step={250} onValueChange={(x) => onChange({ annualFeedInKwh: x[0] ?? v.annualFeedInKwh })} />
      </div>
      <div>
        <FieldLabel>Belangrijkste doel</FieldLabel>
        <TileGroup
          multi
          options={[
            { id: "besparing", label: "Besparen" },
            { id: "dynamisch", label: "Dynamisch handelen" },
            { id: "zelfconsumptie", label: "Zelfconsumptie" },
            { id: "noodstroom", label: "Noodstroom" },
          ]}
          value={v.goals}
          onPick={(x) => onChange({ goals: x })}
        />
      </div>
    </div>
  );
}

function EVForm({ v, onChange }: { v: HomeInputs["ev"]; onChange: (v: Partial<HomeInputs["ev"]>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Rijd je al elektrisch?</FieldLabel>
        <TileGroup
          options={[
            { id: "nu", label: "Nu" },
            { id: "binnen2jaar", label: "Binnen 2 jaar" },
            { id: "nogniet", label: "Nog niet" },
          ]}
          value={[v.evStatus]}
          onPick={(x) => onChange({ evStatus: x[0] ?? v.evStatus })}
        />
      </div>
      <div>
        <FieldLabel hint={`${v.annualKm.toLocaleString("nl-NL")} km/jaar`}>Geschatte jaarkilometrage</FieldLabel>
        <Slider value={[v.annualKm]} min={2000} max={60000} step={1000} onValueChange={(x) => onChange({ annualKm: x[0] ?? v.annualKm })} />
      </div>
    </div>
  );
}

function AircoForm({ v, onChange }: { v: HomeInputs["airco"]; onChange: (v: Partial<HomeInputs["airco"]>) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <FieldLabel hint={`${v.roomCount} ruimte${v.roomCount === 1 ? "" : "s"}`}>Aantal ruimtes</FieldLabel>
        <Slider value={[v.roomCount]} min={1} max={8} step={1} onValueChange={(x) => onChange({ roomCount: x[0] ?? v.roomCount })} />
      </div>
      <div>
        <FieldLabel>Type woning</FieldLabel>
        <TileGroup options={HOUSE_TYPES} value={[v.houseType]} onPick={(x) => onChange({ houseType: x[0] ?? v.houseType })} />
      </div>
    </div>
  );
}

function ContractForm({ v, onChange }: { v: HomeInputs["contract"]; onChange: (v: Partial<HomeInputs["contract"]>) => void }) {
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
  categoryId,
  result,
  onCalculate,
}: {
  categoryId: string;
  result: AdviceResult | null;
  onCalculate: () => void;
}) {
  if (!result) {
    return (
      <div className="rounded-2xl p-5" style={{ backgroundColor: "var(--color-background)", boxShadow: "var(--shadow-panel)" }}>
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-2/3 rounded bg-cloud" />
          <div className="h-8 w-1/2 rounded bg-cloud" />
          <div className="h-3 w-full rounded bg-cloud" />
        </div>
        <Button onClick={onCalculate} className="mt-4 w-full" size="lg" style={{ backgroundColor: "#4f8f62", color: "white" }}>
          <Sparkles size={18} className="mr-1.5" /> Bereken je besparing
        </Button>
      </div>
    );
  }
  return (
    <div className="animate-rise rounded-2xl p-5" style={{ backgroundColor: "var(--color-background)", boxShadow: "var(--shadow-panel-lg)" }}>
      <p className="text-xs font-medium uppercase tracking-wide text-moss/60">Geschatte besparing per jaar</p>
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

      <p className="mt-3 text-sm leading-relaxed text-ink">{buildAdviceText(result.explanationReasons)}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {result.badges.map((b) => (
          <Badge key={b} variant="secondary" className="text-[11px]" style={{ backgroundColor: "#f0b84f22", color: "#7a5a16" }}>
            {b}
          </Badge>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-moss/60">{CONFIDENCE_LABEL[result.confidence]}</p>

      <Button asChild className="mt-4 w-full" size="lg" style={{ backgroundColor: "#4f8f62", color: "white" }}>
        <a href={`/offerte?cat=${categoryId}`}>
          Vraag gratis offertes aan <ArrowRight size={18} className="ml-1.5" />
        </a>
      </Button>
    </div>
  );
}
