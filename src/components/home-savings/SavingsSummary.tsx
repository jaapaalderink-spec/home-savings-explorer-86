import { Button } from "@/components/ui/button";
import { ArrowRight, Wand2 } from "lucide-react";
import { CATEGORIES, CONTRACT_META } from "./categories";
import { AdviceResult, formatEuro, combineSavings } from "@/lib/home-savings";
import { CountUp } from "./CountUp";
import type { HomeInputs } from "./CategoryPanel";

const META = Object.fromEntries([...CATEGORIES, CONTRACT_META].map((c) => [c.id, c])) as Record<
  string,
  (typeof CATEGORIES)[number]
>;

interface Props {
  results: Record<string, AdviceResult | null>;
  inputs: HomeInputs;
}

export function SavingsSummary({ results, inputs }: Props) {
  const entries = (Object.keys(results) as string[]).filter((id) => results[id] != null);

  if (entries.length === 0) {
    return (
      <div className="mt-10 text-center">
        <a
          href="/offerte"
          className="inline-flex items-center gap-1 text-sm text-moss/70 underline-offset-2 hover:text-moss hover:underline"
        >
          <Wand2 size={14} /> Nog niets ingevuld? Begin direct met de volledige wizard
        </a>
      </div>
    );
  }

  const total = combineSavings(
    Object.fromEntries(entries.map((id) => [id, results[id]?.practicalSavings ?? 0])),
  );

  // query params voor doorverwijzing naar de wizard
  const params = new URLSearchParams({
    cats: entries.join(","),
    houseType: inputs.heatpump.houseType,
    contract: inputs.contract.type,
    consumption: String(inputs.solar.annualConsumptionKwh),
    feedin: String(inputs.battery.annualFeedInKwh),
    panels: String(inputs.solar.panelCount),
    heating: inputs.heatpump.currentHeating,
    buildYear: String(inputs.heatpump.buildYear),
    evStatus: inputs.ev.evStatus,
    evKm: String(inputs.ev.annualKm),
    aircoRooms: String(inputs.airco.roomCount),
    boilerPersons: String(inputs.boiler.persons),
    boilerWater: inputs.boiler.currentWaterHeating,
    ehmsDevices: inputs.ehms.smartDevices.join(","),
    batteryGoals: inputs.battery.goals.join(","),
    total: String(total),
  });


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
        geschat totaal per jaar op basis van {entries.length} {entries.length === 1 ? "maatregel" : "maatregelen"}
      </p>

      <div className="mt-5 space-y-2">
        {entries.map((id) => {
          const r = results[id]!;
          const m = META[id];
          if (!m) return null;
          const Icon = m.icon;
          return (
            <div
              key={id}
              className="flex items-center gap-3 rounded-2xl bg-background p-3"
              style={{ boxShadow: "var(--shadow-panel)" }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#f0b84f" }}>
                <Icon size={18} strokeWidth={2.4} className="text-moss" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{m.label}</span>
              <span className="shrink-0 text-sm font-bold text-leaf">
                {formatEuro(r.practicalSavings)}<span className="text-xs font-normal text-moss/60">/jr</span>
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col items-center gap-3">
        <Button asChild size="lg" className="w-full sm:w-auto" style={{ backgroundColor: "#4f8f62", color: "white" }}>
          <a href={`/offerte?${params.toString()}`}>
            Vraag gratis offertes aan voor jouw situatie <ArrowRight size={18} className="ml-1.5" />
          </a>
        </Button>
        <a href="/offerte" className="inline-flex items-center gap-1 text-sm text-moss/70 underline-offset-2 hover:text-moss hover:underline">
          <Wand2 size={14} /> Nog niets ingevuld? Begin direct met de volledige wizard
        </a>
      </div>
    </section>
  );
}
