import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, Home, Plus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatEuro } from "@/lib/home-savings";
import {
  calculateScenario,
  profileFromSearch,
  MEASURES,
  MEASURE_LABEL,
  type EnergyProfile,
} from "@/lib/home-savings/scenario";
import { ENERGY_CONFIG } from "@/lib/home-savings/config";
import { FullEnergyProfileForm } from "@/components/home-savings/EnergyProfileForm";
import { BatteryBreakdown } from "@/components/home-savings/BatteryBreakdown";

export const Route = createFileRoute("/resultaat")({
  head: () => ({
    meta: [
      { title: "Jouw totale besparing — Onafhankelijke Offerte" },
      {
        name: "description",
        content:
          "Zie wat je gekozen energiemaatregelen samen opleveren: energiekosten voor en na, voordeel per maatregel en hoe ze samenwerken.",
      },
      { property: "og:title", content: "Jouw totale besparing — Onafhankelijke Offerte" },
      {
        property: "og:description",
        content:
          "Eén samenhangende berekening van zonnepanelen, batterij, laadpaal, airco en warmtepomp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResultPage,
});

const OWNED: Record<string, (p: EnergyProfile) => boolean> = {
  solar: (p) => p.existingPanels > 0,
  battery: (p) => p.existingBattery > 0,
  heatpump: (p) => ["hybrid", "heatpump"].includes(p.heating),
  ev: (p) => p.hasCharger,
  airco: (p) => p.hasAirco,
};

function ResultPage() {
  const searchStr = useLocation({ select: (l) => l.searchStr });
  const search = new URLSearchParams(searchStr);
  const [profile, setProfile] = useState(() => profileFromSearch(search));
  const [cats] = useState(() => (search.get("cats") ?? "").split(","));
  const [editing, setEditing] = useState(false);
  const r = calculateScenario(profile, cats);

  const offerte = new URLSearchParams(search);
  offerte.set("energyProfile", JSON.stringify(profile));
  offerte.set("total", String(Math.round(r.savings)));

  return (
    <main className="min-h-dvh pb-16" style={{ backgroundColor: "var(--color-cloud)" }}>
      <header className="mx-auto flex max-w-4xl items-center justify-between px-5 py-5">
        <Link to="/" className="font-display text-lg font-bold text-moss">
          Onafhankelijke Offerte
        </Link>
      </header>
      <section className="mx-auto max-w-4xl px-5">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
          Dit kunnen jouw energiemaatregelen opleveren
        </h1>
        {r.selected.length === 0 ? (
          <p className="mt-4 text-moss">
            Je hebt nog geen maatregelen gekozen.{" "}
            <Link to="/" className="underline">
              Kies maatregelen op je huis
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <Stat label="Energiekosten huidige woning" value={`${formatEuro(r.before.cost)}/jr`} />
              <Stat label="Na de gekozen maatregelen" value={`${formatEuro(r.after.cost)}/jr`} />
              <Stat
                label={`Samen bespaard ${r.profile.year >= 2027 ? `vanaf ${r.profile.year}` : `in ${r.profile.year}`}`}
                value={`${formatEuro(r.savings)}/jr`}
                strong
              />
              <Stat label="Gemiddeld per maand" value={formatEuro(r.savings / 12)} />
            </div>
            <p className="mt-2 text-sm text-moss/70">
              Indicatieve bandbreedte {formatEuro(r.range.min)} tot {formatEuro(r.range.max)} per
              jaar. Alleen energiekosten: aanschaf en installatie zijn niet meegerekend. Geen
              gegarandeerde besparing. Rekenjaar {r.profile.year}
              {r.profile.year <= 2026 && r.profile.netMetering
                ? " met saldering"
                : " zonder saldering"}
              , contract:{" "}
              {r.profile.contractType === "onbekend" ? "standaardaannames" : r.profile.contractType}
              .
            </p>
            <p className="mt-4 text-sm font-semibold text-ink">Korte vergelijking 2026 en 2027</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {r.comparisons.map((c) => (
                <div
                  key={c.year}
                  className="rounded-xl bg-background p-3 text-sm"
                  style={{ boxShadow: "var(--shadow-panel)" }}
                >
                  <p className="font-semibold text-ink">
                    {c.year >= 2027
                      ? `Vanaf ${c.year}, zonder saldering`
                      : `${c.year}, met saldering`}
                  </p>
                  <p className="text-moss/80">
                    Zonnepanelen en batterij samen: {formatEuro(c.package)} per jaar t.o.v. je
                    huidige woning
                    {r.selected.some((x) => x !== "solar" && x !== "battery")
                      ? " (overige gekozen maatregelen gelijk gehouden)"
                      : ""}
                    .
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="mt-8 text-lg font-semibold text-ink">Per maatregel</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MEASURES.map((id) => {
            const owned = OWNED[id]!(profile);
            const chosen = r.selected.includes(id);
            return (
              <div
                key={id}
                className="rounded-2xl bg-background p-4"
                style={{ boxShadow: "var(--shadow-panel)" }}
              >
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  {chosen ? (
                    <Check size={16} className="text-leaf" />
                  ) : owned ? (
                    <Home size={16} />
                  ) : (
                    <Plus size={16} />
                  )}
                  {MEASURE_LABEL[id]}
                </p>
                <p className="text-xs text-moss/70">
                  {owned && "Al aanwezig"}
                  {owned && chosen && " · "}
                  {chosen ? "Wil je toevoegen" : !owned && "Niet gekozen"}
                </p>
                {chosen && (
                  <dl className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-moss/70">Los aangeschaft</dt>
                      <dd className="font-semibold">{formatEuro(r.standalone[id] ?? 0)}/jr</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-moss/70">Bijdrage in pakket</dt>
                      <dd className="font-semibold text-leaf">
                        {formatEuro(r.contributions[id] ?? 0)}/jr
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
            );
          })}
        </div>

        {r.selected.length > 1 && (
          <div
            className="mt-6 rounded-2xl bg-background p-4 text-sm"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            <p className="font-semibold text-ink">
              Aanvullend effect van samenwerking: {formatEuro(r.synergy)} per jaar
            </p>
            <p className="mt-1 text-moss/80">
              Dit is het verschil tussen je pakket ({formatEuro(r.savings)}) en de optelsom van
              losse aanschaf. "Bijdrage in pakket" verdeelt het pakket eerlijk over de maatregelen,
              onafhankelijk van de volgorde waarin je ze koos.
            </p>
          </div>
        )}

        {r.battery && (
          <div
            className="mt-6 rounded-2xl bg-background p-4"
            style={{ boxShadow: "var(--shadow-panel)" }}
          >
            <BatteryBreakdown
              years={r.battery.years}
              conclusion={r.battery.conclusion}
              profile={r.profile}
              lifetime={r.battery.lifetime}
            />
            <p className="mt-2 text-[11px] text-moss/60">
              Dit is de marginale besparing bij jouw configuratie. "Bijdrage in pakket" hierboven is
              een volgorde-onafhankelijk toegerekende pakketbijdrage en kan daarvan afwijken.
            </p>
          </div>
        )}

        {r.advice.length > 0 && (
          <div className="mt-6 space-y-2">
            <h2 className="text-lg font-semibold text-ink">Advies</h2>
            {r.advice
              .filter((a) => a !== r.battery?.conclusion)
              .map((a) => (
                <p key={a} className="rounded-xl bg-background p-3 text-sm text-ink">
                  {a}
                </p>
              ))}
          </div>
        )}

        {r.selected.length > 0 && (
          <div className="mt-6 grid gap-2 text-sm text-moss sm:grid-cols-2">
            <p>
              Netafname: {Math.round(r.before.imports)} → {Math.round(r.after.imports)} kWh
            </p>
            <p>
              Teruglevering: {Math.round(r.before.exports)} → {Math.round(r.after.exports)} kWh
            </p>
            <p>Zonnestroom direct gebruikt: {Math.round(r.after.direct)} kWh</p>
            <p>
              Gas: {Math.round(r.before.gas)} → {Math.round(r.after.gas)} m3
            </p>
            {r.after.heatpumpKwh > 0 && (
              <p>Stroom warmtepomp: {Math.round(r.after.heatpumpKwh)} kWh</p>
            )}
            {r.after.aircoKwh > 0 && <p>Stroom airco: {Math.round(r.after.aircoKwh)} kWh</p>}
            {r.comfortCost > 0.5 && (
              <p>Extra kosten koeling (comfort): {formatEuro(r.comfortCost)}/jr</p>
            )}
          </div>
        )}

        <details className="mt-6 rounded-xl bg-background p-4 text-sm">
          <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-ink">
            <Info size={14} /> Gebruikte aannames
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-moss/80">
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
            <li>
              Aannames herzien op {ENERGY_CONFIG.reviewedAt}; standaardtarieven zijn geen actuele
              tarieven.
            </li>
          </ul>
        </details>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" style={{ backgroundColor: "#4f8f62", color: "white" }}>
            <a href={`/offerte?${offerte.toString()}`}>
              Vraag gratis offertes aan <ArrowRight size={18} className="ml-1.5" />
            </a>
          </Button>
          <Button variant="outline" size="lg" onClick={() => setEditing((e) => !e)}>
            Pas mijn gegevens aan
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/">Bekijk andere maatregelen</Link>
          </Button>
        </div>
        {editing && (
          <div className="mt-6 rounded-2xl bg-background p-5">
            <FullEnergyProfileForm value={profile} onChange={setProfile} />
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
      <p className="text-xs text-moss/70">{label}</p>
      <p className={`mt-1 text-xl font-bold ${strong ? "text-leaf" : "text-ink"}`}>{value}</p>
    </div>
  );
}
