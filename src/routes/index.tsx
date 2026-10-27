import { useCalculatorConfig } from "@/lib/home-savings/use-calculator-config";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import { HouseScene } from "@/components/home-savings/HouseScene";
import { MobileTiles } from "@/components/home-savings/MobileTiles";
import { CategoryPanel, type HomeInputs } from "@/components/home-savings/CategoryPanel";
import { ContractCard } from "@/components/home-savings/ContractCard";
import { SavingsSummary } from "@/components/home-savings/SavingsSummary";
import { calculateScenario } from "@/lib/home-savings/scenario";
import {
  sessionStore,
  useCalculatorSession,
  removeMeasure,
  resetMeasure,
  toggleMeasure,
} from "@/lib/home-savings/session";
import { ResetCalculation } from "@/components/home-savings/ResetCalculation";

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
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search["open"] === "string" ? { open: search["open"] } : {},
  component: HomePage,
});

function HomePage() {
  const [openId, setOpenId] = useState<string | null>(null);
  useCalculatorConfig();
  const session = useCalculatorSession();
  const inputs: HomeInputs = session;
  const selected = session.selected;
  const results = calculateScenario(inputs.profile, selected).results;
  const { open } = Route.useSearch();
  const navigate = Route.useNavigate();

  // "Aanpassen" vanuit het totaaloverzicht opent direct de juiste hotspot
  useEffect(() => {
    if (!open) return;
    setOpenId(open);
    navigate({ search: {}, replace: true });
  }, [open, navigate]);

  const handleChange = useCallback((patch: Partial<HomeInputs>) => {
    sessionStore.set((session) => {
      const prev: HomeInputs = session;
      const next = { ...prev, ...patch };
      if (patch.contract)
        next.profile = {
          ...next.profile,
          contractType: patch.contract.type as typeof next.profile.contractType,
          provided: [...new Set([...next.profile.provided, "contractType"])],
        };
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
      return { ...session, profile: next.profile, contract: next.contract, owned: next.owned };
    });
  }, []);

  const handleCalculate = useCallback((id: string) => {
    if (id !== "contract") sessionStore.set((s) => toggleMeasure(s, id));
  }, []);
  const handleRemove = useCallback(
    (id: string) => sessionStore.set((s) => removeMeasure(s, id)),
    [],
  );
  const handleReset = useCallback((id: string) => sessionStore.set((s) => resetMeasure(s, id)), []);

  const status = Object.fromEntries(
    ["solar", "heatpump", "battery", "ev", "airco", "contract"].map((id) => [
      id,
      selected.includes(id) || (id === "contract" && inputs.contract.type !== "onbekend")
        ? "selected"
        : inputs.owned[id]
          ? "owned"
          : "none",
    ]),
  ) as Record<string, "selected" | "owned" | "none">;

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
            to="/duurzaam-nieuws"
            className="shrink-0 text-xs font-semibold text-moss/80 underline-offset-2 hover:text-moss hover:underline"
          >
            Duurzaam nieuws
          </Link>
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
        <HouseScene activeId={openId} status={status} onPick={setOpenId} />
        <MobileTiles status={status} onPick={setOpenId} />
        <ContractCard done={!!results["contract"]} onPick={setOpenId} />
      </section>

      {/* total summary (Fase 4) */}
      <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-5">
        <SavingsSummary results={results} inputs={inputs} onPick={setOpenId} />
        <div className="mt-6 text-center">
          <ResetCalculation />
        </div>
      </section>

      {/* panel */}
      <CategoryPanel
        openId={openId}
        onOpenChange={setOpenId}
        inputs={inputs}
        onChange={handleChange}
        results={results}
        onCalculate={handleCalculate}
        selected={selected}
        onRemove={handleRemove}
        onReset={handleReset}
      />
    </main>
  );
}
