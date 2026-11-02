import { Button } from "@/components/ui/button";
import { ArrowRight, Wand2, Check, Circle, Home } from "lucide-react";
import { CATEGORIES, CONTRACT_META } from "./categories";
import { AdviceResult, formatEuro } from "@/lib/home-savings";
import { CountUp } from "./CountUp";
import { buildOfferteHref, buildResultHref } from "./offerte-params";
import type { HomeInputs } from "./CategoryPanel";
import { calculateScenario } from "@/lib/home-savings/scenario";

interface Props {
  results: Record<string, AdviceResult | null>;
  inputs: HomeInputs;
  onPick?: (id: string) => void;
}

export function SavingsSummary({ results, inputs, onPick }: Props) {
  const owned: Record<string, boolean> = inputs?.owned ?? {};
  const items = [...CATEGORIES, CONTRACT_META];

  const counted = items.map((c) => c.id).filter((id) => results[id] != null);

  const scenario = calculateScenario(inputs.profile, counted);
  const total = scenario.savings;

  const doneCount = items.filter(
    (c) =>
      results[c.id] != null ||
      owned[c.id] ||
      (c.id === "contract" && inputs.contract.type !== "onbekend"),
  ).length;

  const offerteHref = buildOfferteHref(inputs, results);

  return (
    <section
      className="animate-rise mx-auto mt-12 w-full max-w-3xl rounded-3xl p-6 sm:p-8"
      style={{ backgroundColor: "#eaf3ed", boxShadow: "var(--shadow-panel-lg)" }}
    >
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-moss/70">
        Jouw bespaarpotentieel
      </p>
      <p className="mt-1 text-center text-5xl font-bold text-leaf">
        <CountUp value={total} prefix="€ " />
      </p>
      <p className="mt-1 text-center text-sm text-moss/70">
        geschat totaal per jaar, {doneCount} van {items.length} onderdelen ingevuld
      </p>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${(doneCount / items.length) * 100}%`, backgroundColor: "#4f8f62" }}
        />
      </div>

      {counted.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-ink">Effect van je maatregelen</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-moss/60">Energiekosten</p>
              <p className="mt-1 text-sm text-moss/70 line-through">{formatEuro(scenario.before.cost)}</p>
              <p className="text-lg font-bold text-leaf">{formatEuro(scenario.after.cost)}<span className="text-xs font-normal text-moss/60">/jaar</span></p>
            </div>
            <div className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-moss/60">Bandbreedte besparing</p>
              <p className="mt-1 text-lg font-bold text-ink">{formatEuro(scenario.range.min)} tot {formatEuro(scenario.range.max)}</p>
              <p className="text-xs text-moss/60">per jaar, afhankelijk van aannames</p>
            </div>
            <div className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-moss/60">Verbruik</p>
              <p className="mt-1 text-sm text-ink">Stroom: <span className="font-semibold">{Math.round(scenario.before.imports)} → {Math.round(scenario.after.imports)} kWh</span></p>
              <p className="text-sm text-ink">Gas: <span className="font-semibold">{Math.round(scenario.before.gas)} → {Math.round(scenario.after.gas)} m³</span></p>
            </div>
          </div>
          {scenario.notes.length > 0 && (
            <details className="group mt-3 rounded-2xl bg-background/60 p-3 text-sm text-moss">
              <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-ink">
                <span>Uitgangspunten en aannames ({scenario.notes.length})</span>
                <span className="text-xs font-normal text-moss/60 group-open:hidden">Bekijk ▾</span>
                <span className="hidden text-xs font-normal text-moss/60 group-open:inline">Verberg ▴</span>
              </summary>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed">
                {scenario.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <h2 className="mt-6 text-sm font-semibold text-ink">Checklist</h2>
      <ul className="mt-2 space-y-2">
        {items.map((c) => {
          const r = results[c.id];
          const isOwned = !!owned[c.id];
          const filled = c.id === "contract" ? inputs.contract.type !== "onbekend" : r != null;
          const Icon = c.icon;

          let status: { text: string; tone: string; mark: typeof Check } = {
            text: "Nog invullen",
            tone: "text-moss/50",
            mark: Circle,
          };
          if (isOwned) status = { text: "Heb ik al", tone: "text-moss/70", mark: Home };
          else if (filled) status = { text: "Ingevuld", tone: "text-leaf", mark: Check };

          const Mark = status.mark;

          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick?.(c.id)}
                className="focus-brand flex w-full items-center gap-3 rounded-2xl bg-background p-3 text-left transition-colors hover:bg-background/70"
                style={{ boxShadow: "var(--shadow-panel)" }}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: isOwned ? "#dfe7e1" : "#f0b84f" }}
                >
                  <Icon size={18} strokeWidth={2.4} className="text-moss" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{c.label}</span>
                  <span className={`flex items-center gap-1 text-[11px] ${status.tone}`}>
                    <Mark size={11} /> {status.text}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-bold text-leaf">
                  {!r ? (
                    <span className="text-xs font-normal text-moss/50">…</span>
                  ) : (
                    <>
                      {formatEuro(r.practicalSavings)}
                      <span className="text-xs font-normal text-moss/60">/jr</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button
          asChild
          size="lg"
          className="w-full sm:w-auto"
          style={{ backgroundColor: "#4f8f62", color: "white" }}
        >
          <a href={offerteHref}>
            Vraag gratis offertes aan voor jouw situatie <ArrowRight size={18} className="ml-1.5" />
          </a>
        </Button>
        {counted.length > 0 && (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <a href={buildResultHref(inputs, results)}>Bekijk mijn totale voordeel</a>
          </Button>
        )}
        <a
          href="/offerte"
          className="inline-flex items-center gap-1 text-sm text-moss/70 underline-offset-2 hover:text-moss hover:underline"
        >
          <Wand2 size={14} /> Liever alles achter elkaar invullen? Start de volledige wizard
        </a>
      </div>
    </section>
  );
}
