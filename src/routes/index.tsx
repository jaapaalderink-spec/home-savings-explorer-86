import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { ShieldCheck } from "lucide-react";
import { HouseScene } from "@/components/home-savings/HouseScene";
import { MobileTiles } from "@/components/home-savings/MobileTiles";
import {
  CategoryPanel,
  EMPTY_INPUTS,
  type HomeInputs,
} from "@/components/home-savings/CategoryPanel";
import { ContractCard } from "@/components/home-savings/ContractCard";
import { SavingsSummary } from "@/components/home-savings/SavingsSummary";
import { calculateScenario } from "@/lib/home-savings/scenario";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bespaar op je huis — Onafhankelijke Offerte" },
      {
        name: "description",
        content:
          "Klik op je huis en ontdek per duurzame maatregel wat het jou oplevert: zonnepanelen, warmtepomp, thuisbatterij, laadpaal en airco. Gratis en vrijblijvend.",
      },
      { property: "og:title", content: "Bespaar op je huis — Onafhankelijke Offerte" },
      {
        property: "og:description",
        content:
          "Zie in één oogopslag hoeveel je kunt besparen. Klik op je huis en ontdek per maatregel wat het jou oplevert.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<HomeInputs>(EMPTY_INPUTS);
  const [selected, setSelected] = useState<string[]>([]);
  const results = calculateScenario(inputs.profile, selected).results;

  const handleChange = useCallback((patch: Partial<HomeInputs>) => {
    setInputs((prev) => {
      const next = { ...prev, ...patch };
      if (patch.owned) {
        const p = { ...next.profile };
        if (patch.owned["solar"] !== prev.owned["solar"]) {
          p.existingPanels = patch.owned["solar"] ? Math.max(p.existingPanels, 8) : 0;
          p.newPanels = patch.owned["solar"] ? 0 : 8;
        }
        if (patch.owned["battery"] !== prev.owned["battery"]) {
          p.existingBattery = patch.owned["battery"] ? Math.max(p.existingBattery, 5) : 0;
          p.newBattery = patch.owned["battery"] ? 0 : 5;
        }
        if (patch.owned["heatpump"] !== prev.owned["heatpump"])
          p.heating = patch.owned["heatpump"] ? "hybrid" : "gas";
        if (patch.owned["ev"] !== prev.owned["ev"]) p.hasCharger = !!patch.owned["ev"];
        if (patch.owned["airco"] !== prev.owned["airco"]) p.hasAirco = !!patch.owned["airco"];
        next.profile = p;
      }
      next.owned = {
        ...next.owned,
        solar: next.profile.existingPanels > 0,
        battery: next.profile.existingBattery > 0,
        heatpump: ["hybrid", "heatpump"].includes(next.profile.heating),
        ev: next.profile.hasCharger,
        airco: next.profile.hasAirco,
      };
      return next;
    });
  }, []);

  const handleCalculate = useCallback((id: string) => {
    if (id !== "contract")
      setSelected((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      );
  }, []);

  const doneFlags = Object.fromEntries(
    [...new Set([...Object.keys(results), ...Object.keys(inputs.owned)])].map((id) => [
      id,
      results[id] != null || !!inputs.owned[id],
    ]),
  );

  return (
    <main className="min-h-dvh" style={{ backgroundColor: "var(--color-cloud)" }}>
      {/* top bar */}
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <span className="font-display text-lg font-bold text-moss">Onafhankelijke Offerte</span>
        <span className="flex items-center gap-3">
          <span
            className="hidden shrink-0 items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-xs font-medium text-moss sm:inline-flex"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            <ShieldCheck size={14} style={{ color: "#4f8f62" }} /> Vergelijk offertes van
            gecontroleerde installateurs
          </span>
          <Link
            to="/auth"
            className="shrink-0 text-xs font-semibold text-moss/80 underline-offset-2 hover:text-moss hover:underline"
          >
            Voor installateurs
          </Link>
        </span>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-5xl px-5 pt-4 text-center sm:pt-8">
        <h1 className="font-display text-3xl font-bold leading-tight text-ink sm:text-5xl">
          Zie in één oogopslag hoeveel je kunt besparen
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-moss/80 sm:text-lg">
          Klik op je huis en ontdek per maatregel wat het jou oplevert — vrijblijvend en binnen 2
          minuten.
        </p>
      </section>

      {/* lichte social proof, net onder de hero */}
      <ul className="mx-auto mt-4 flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-5 text-center text-xs font-medium text-moss sm:mt-5 sm:text-sm">
        <li className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} style={{ color: "#4f8f62" }} aria-hidden="true" /> Gecontroleerde
          installateurs
        </li>
        <li className="inline-flex items-center gap-1.5">
          <ShieldCheck size={14} style={{ color: "#4f8f62" }} aria-hidden="true" /> Gratis en
          vrijblijvend vergelijken
        </li>
        <li className="hidden items-center gap-1.5 sm:inline-flex">
          <ShieldCheck size={14} style={{ color: "#4f8f62" }} aria-hidden="true" /> Geen
          verplichtingen
        </li>
      </ul>

      {/* house scene */}
      <section className="mx-auto mt-6 max-w-5xl px-4 sm:px-5">
        <HouseScene activeId={openId} results={doneFlags} onPick={setOpenId} />
        <MobileTiles results={doneFlags} onPick={setOpenId} />
        <ContractCard done={!!results["contract"]} onPick={setOpenId} />
      </section>

      {/* total summary (Fase 4) */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-5">
        <SavingsSummary results={results} inputs={inputs} onPick={setOpenId} />
      </section>

      {/* panel */}
      <CategoryPanel
        openId={openId}
        onOpenChange={setOpenId}
        inputs={inputs}
        onChange={handleChange}
        results={results}
        onCalculate={handleCalculate}
      />
    </main>
  );
}
