import type { BatteryYear, EnergyProfile, batteryLifetime } from "@/lib/home-savings/scenario";

const eur = (n: number) =>
  `${n >= 0 ? "+" : "−"} € ${Math.abs(Math.round(n)).toLocaleString("nl-NL")}`;
// Long-term figures rounded to €10: no false precision.
const eur10 = (n: number) =>
  `€ ${(Math.round(n / 10) * 10).toLocaleString("nl-NL")}`;
const kwh = (n: number) => `${Math.round(n).toLocaleString("nl-NL")} kWh`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const CONTRACT: Record<EnergyProfile["contractType"], string> = {
  vast: "vast contract",
  variabel: "variabel contract",
  dynamisch: "dynamisch contract",
  onbekend: "standaardaannames (contract onbekend)",
};

/** Financial battery overview: same home with vs without the new battery, 2026 and 2027. */
export function BatteryBreakdown({
  years,
  conclusion,
  profile,
  lifetime,
}: {
  years: BatteryYear[];
  conclusion: string;
  profile: EnergyProfile;
  lifetime?: ReturnType<typeof batteryLifetime>;
}) {
  const main = years.find((y) => !y.netMetering) ?? years[0]!;
  const ordered = [...years].sort((a, b) => b.year - a.year); // 2027 first: prominent
  return (
    <div className="space-y-3">
      <p className="text-base font-semibold text-ink">Wat kan een thuisbatterij jou opleveren?</p>
      <p className="text-xs text-moss/80">
        Een thuisbatterij wekt geen extra stroom op. Ze slaat je eigen zonneoverschot op, zodat je
        het later zelf gebruikt in plaats van het terug te leveren.
      </p>
      <dl className="grid gap-x-6 gap-y-1 rounded-xl bg-background p-3 text-sm sm:grid-cols-2">
        <Row label={`Jaarlijkse besparing vanaf ${main.year}`} value={`${eur(main.net)}/jr`} strong />
        <Row label="Extra eigen zonnestroom gebruikt" value={kwh(main.extraSelfKwh)} />
        <Row label="Minder stroom ingekocht" value={kwh(main.importReductionKwh)} />
        <Row label="Minder stroom teruggeleverd" value={kwh(main.exportReductionKwh)} />
        <Row label="Vermeden terugleverkosten" value={`${eur(main.exportCostSaving)}/jr`} />
        {lifetime && (
          <Row
            label={`Indicatief voordeel over ${lifetime.horizonYears} jaar`}
            value={eur10(lifetime.cumulative)}
            strong
          />
        )}
      </dl>
      {lifetime && (
        <p className="text-[11px] leading-relaxed text-moss/70">
          {lifetime.horizonYears}-jaarsindicatie: eerste jaar {eur(lifetime.firstYear)}, gemiddeld{" "}
          {eur(lifetime.average)} per jaar, bandbreedte {eur10(lifetime.range.min)} tot{" "}
          {eur10(lifetime.range.max)}. Gerekend met {(lifetime.degradationPerYear * 100).toFixed(1)}%
          capaciteitsverlies per jaar ({lifetime.degradationSource}; na {lifetime.horizonYears} jaar
          nog ongeveer {Math.round(lifetime.finalHealth * 100)}% capaciteit) en de huidige
          aangenomen tarieven, zonder prijsvoorspelling. Dit is geen nettowinst: aanschaf,
          installatie en eventuele vervangingskosten zijn niet meegerekend. De levensduur van{" "}
          {lifetime.horizonYears} jaar is een rekenaanname, geen garantie.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {ordered.map((y, i) => (
          <div
            key={y.year}
            className="rounded-xl p-3"
            style={{ backgroundColor: i === 0 ? "#eaf3ed" : "var(--color-cloud)" }}
          >
            <p className="text-xs font-semibold text-moss">
              {y.netMetering ? `${y.year} · met saldering` : `Vanaf ${y.year} · zonder saldering`}
            </p>
            <p className={`mt-1 text-2xl font-bold ${y.net >= 0 ? "text-leaf" : "text-ink"}`}>
              {eur(y.net)} <span className="text-sm font-medium text-moss/70">per jaar</span>
            </p>
            <p className="text-[11px] text-moss/70">
              bandbreedte {eur(y.range.min)} tot {eur(y.range.max)}
            </p>
            <dl className="mt-2 space-y-1 text-xs">
              <Row label="Minder stroominkoop" value={eur(y.avoidedImport)} />
              <Row label="Gemiste terugleververgoeding" value={eur(y.missedExport)} />
              <Row label="Minder terugleverkosten" value={eur(y.exportCostSaving)} />
              {Math.abs(y.standbyCost) > 0.5 && (
                <Row label="Stand-byverbruik" value={eur(y.standbyCost)} />
              )}
              <Row label="Netto besparing" value={eur(y.net)} strong />
              <Row label="Minder ingekocht" value={kwh(y.importReductionKwh)} muted />
              <Row label="Minder teruggeleverd" value={kwh(y.exportReductionKwh)} muted />
              <Row
                label={`Waarvan opslagverlies (${Math.round(y.lossKwh)} kWh)`}
                value={eur(-y.lossValue)}
                muted
              />
              <Row
                label="Extra eigen zonnestroom"
                value={`${Math.round(y.extraSelfKwh)} kWh`}
                muted
              />
              <Row
                label="Eigenverbruik voor → na"
                value={`${pct(y.selfShareBefore)} → ${pct(y.selfShareAfter)}`}
                muted
              />
              {y.gridChargedKwh > 0 && (
                <Row
                  label="Geladen uit het net"
                  value={`${Math.round(y.gridChargedKwh)} kWh`}
                  muted
                />
              )}
            </dl>
          </div>
        ))}
      </div>
      <p className="text-sm leading-relaxed text-ink">{conclusion}</p>
      <p className="text-[11px] leading-relaxed text-moss/60">
        Vergeleken met dezelfde woning en dezelfde gekozen maatregelen zonder nieuwe batterij.
        Tarieven: {CONTRACT[profile.contractType]}
        {profile.supplier ? ` (${profile.supplier})` : ""}, stroom €{" "}
        {profile.electricityPrice.toFixed(2)}/kWh, terugleververgoeding €{" "}
        {profile.exportPrice.toFixed(2)}/kWh. Opslagverlies zit al in de bedragen hierboven.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 ${strong ? "border-t border-moss/15 pt-1 font-semibold text-ink" : muted ? "text-moss/60" : "text-moss"}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
