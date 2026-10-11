import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import type { EnergyProfile } from "@/lib/home-savings/scenario";

type Props = {
  value: EnergyProfile;
  onChange: (value: EnergyProfile) => void;
  category?: string | undefined;
  hideShared?: boolean;
};

const INTRO: Record<string, string> = {
  solar: "Zonnepanelen verlagen je stroomrekening vooral door stroom die je zelf direct gebruikt.",
  battery: "Een thuisbatterij bewaart zonneoverschot van overdag voor de avond en nacht.",
  heatpump: "Een warmtepomp vervangt gas door efficiënt elektrisch verwarmen.",
  ev: "Thuisladen is meestal goedkoper dan openbaar laden, zeker met je eigen zonnestroom.",
  airco: "Een airco geeft comfort bij warmte en kan ook bijverwarmen.",
};

export function EnergyProfileForm({ value: p, onChange, category, hideShared }: Props) {
  const set = (key: keyof EnergyProfile, value: unknown) =>
    onChange({
      ...p,
      [key]: value,
      provided: p.provided.includes(key) ? p.provided : [...p.provided, key],
    });
  const tag = (key: keyof EnergyProfile) =>
    p.provided.includes(key) ? null : (
      <span className="ml-1.5 rounded bg-cloud px-1.5 py-0.5 text-[10px] font-normal text-moss/70">
        geschat
      </span>
    );
  const number = (
    key: keyof EnergyProfile,
    label: string,
    min: number,
    max: number,
    step = 1,
    nullable = false,
  ) => (
    <label className="block space-y-1 text-sm" key={key}>
      <span className="font-medium">
        {label}
        {tag(key)}
      </span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={(p[key] as number | null) ?? ""}
        placeholder="Weet ik niet"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" && nullable) set(key, null);
          else if (raw !== "" && Number.isFinite(Number(raw)))
            set(key, Math.min(max, Math.max(min, Number(raw))));
        }}
      />
    </label>
  );
  const check = (key: keyof EnergyProfile, label: string) => (
    <label className="flex items-center gap-2 text-sm" key={key}>
      <input
        type="checkbox"
        checked={Boolean(p[key])}
        onChange={(e) => set(key, e.target.checked)}
      />
      {label}
    </label>
  );
  const select = (key: keyof EnergyProfile, label: string, options: Record<string, string>) => (
    <label className="block space-y-1 text-sm" key={key}>
      <span className="font-medium">
        {label}
        {tag(key)}
      </span>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-2"
        value={String(p[key])}
        onChange={(e) => set(key, typeof p[key] === "number" ? Number(e.target.value) : e.target.value)}
      >
        {Object.entries(options).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const details = (title: string, children: ReactNode) => (
    <details className="rounded-xl bg-background/60 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-moss">{title}</summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
  const choice = (value: string, options: Record<string, string>, pick: (v: string) => void) => (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(options).map(([id, text]) => (
        <button
          type="button"
          key={id}
          onClick={() => pick(id)}
          className="rounded-full border px-3 py-1 text-xs font-medium"
          style={{
            borderColor: value === id ? "#4f8f62" : "var(--color-border)",
            backgroundColor: value === id ? "#eaf3ed" : "transparent",
          }}
        >
          {text}
        </button>
      ))}
    </div>
  );

  const myData = details(
    "Mijn energiegegevens",
    <>
      {number("consumption", "Totaal stroomverbruik incl. eigen zonnestroom (kWh/jaar)", 0, 100000)}
      {number("gas", "Gasverbruik (m3/jaar)", 0, 20000)}
      {select("contractType", "Energiecontract", {
        onbekend: "Weet ik niet",
        vast: "Vast",
        variabel: "Variabel",
        dynamisch: "Dynamisch",
      })}
      {number("electricityPrice", "Stroomprijs incl. belasting (euro/kWh)", 0, 2, 0.01)}
      {number("gasPrice", "Gasprijs incl. belasting (euro/m3)", 0, 10, 0.01)}
      {number("exportPrice", "Terugleververgoeding (euro/kWh)", -1, 2, 0.01)}
      {number("exportCost", "Terugleverkosten (euro/kWh)", 0, 1, 0.01)}
      {select("year", "Rekenjaar", { "2026": "2026", "2027": "2027 en later (geen saldering)" })}
      {p.year <= 2026 && check("netMetering", "Rekenen met saldering in 2026")}
      <p className="text-xs text-moss/70">
        Velden met "geschat" gebruiken een standaardaanname. Vervang ze door je jaarafrekening voor
        een nauwkeuriger uitkomst.
      </p>
    </>,
  );

  return (
    <div className="space-y-4 text-ink">
      {category && INTRO[category] && <p className="text-sm text-moss">{INTRO[category]}</p>}

      {category === "solar" && (
        <>
          {number("existingPanels", "Hoeveel zonnepanelen heb je al?", 0, 100)}
          {p.existingPanels > 0 &&
            number("existingYield", "Werkelijke jaaropbrengst (kWh, optioneel)", 0, 100000, 1, true)}
          <div className="space-y-1 text-sm">
            <span className="font-medium">Hoeveel panelen wil je laten plaatsen?</span>
            {choice(p.adviseSolar ? "advise" : "count", { count: "Aantal kiezen", advise: "Laat adviseren" }, (v) =>
              set("adviseSolar", v === "advise"),
            )}
            {!p.adviseSolar && number("newPanels", "Aantal nieuwe panelen", 0, 100)}
          </div>
          {details(
            "Meer details",
            <>
              {p.existingPanels > 0 && number("existingWp", "Wattpiek per bestaand paneel", 0, 1000)}
              {number("newWp", "Wattpiek per nieuw paneel", 0, 1000)}
              {number("yieldPerKwp", "Opbrengst voor richting, helling en schaduw (kWh/kWp)", 200, 1300)}
            </>,
          )}
        </>
      )}

      {category === "battery" && (
        <>
          {number("existingBattery", "Capaciteit huidige thuisbatterij (kWh, 0 = geen)", 0, 100, 0.5)}
          <div className="space-y-1 text-sm">
            <span className="font-medium">Gewenste capaciteit</span>
            {choice(
              p.adviseBattery ? "advise" : String(p.newBattery),
              { "5": "5 kWh", "10": "10 kWh", "15": "15 kWh", advise: "Laat adviseren" },
              (v) =>
                v === "advise"
                  ? set("adviseBattery", true)
                  : onChange({ ...p, adviseBattery: false, newBattery: Number(v), provided: [...new Set([...p.provided, "newBattery"])] }),
            )}
          </div>
          {p.provided.includes("contractType") ? null : select("contractType", "Energiecontract", {
            onbekend: "Weet ik niet",
            vast: "Vast",
            variabel: "Variabel",
            dynamisch: "Dynamisch",
          })}
          {details("Meer details", number("batteryEfficiency", "Laad- en ontlaadrendement (0,5 tot 1)", 0.5, 1, 0.01))}
        </>
      )}

      {category === "ev" && (
        <>
          {check("hasEv", "Ik heb een elektrische auto")}
          {p.hasEv && (
            <>
              {number("evKm", "Kilometers per jaar", 0, 120000)}
              {select("homeChargeShare", "Waar laad je nu meestal?", {
                "0": "Publiek",
                "50": "Gemengd",
                "70": "Vooral thuis",
                "100": "Altijd thuis",
              })}
              {check("smartCharging", "Slim laden overdag op zonnestroom (vraagt geschikte laadpaal)")}
              {details(
                "Meer details",
                <>
                  {number("evKwhPer100Km", "Stroom incl. laadverlies (kWh/100 km)", 5, 50, 0.1)}
                  {number("publicChargePrice", "Tarief openbaar laden (euro/kWh)", 0, 2, 0.01)}
                </>,
              )}
            </>
          )}
        </>
      )}

      {category === "airco" && (
        <>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Hoeveel ruimtes wil je voorzien van airco?</span>
            <Input
              type="number"
              min={0}
              max={20}
              value={Math.round(p.coolingKwh / 100)}
              onChange={(e) =>
                set("coolingKwh", Math.min(20, Math.max(0, Number(e.target.value) || 0)) * 100)
              }
            />
          </label>
          <div className="space-y-1 text-sm">
            <span className="font-medium">Alleen koelen of ook verwarmen?</span>
            {choice(p.aircoMode, { cool: "Alleen koelen", both: "Koelen en verwarmen" }, (v) =>
              set("aircoMode", v),
            )}
          </div>
          {details(
            "Meer details",
            <>
              {p.aircoMode === "both" &&
                number("aircoHeatingShare", "Aandeel resterende gasverwarming vervangen (%)", 0, 100)}
              {number("aircoScop", "Seizoensrendement bij verwarmen", 1, 7, 0.1)}
              {number("coolingKwh", "Stroom voor koeling (kWh/jaar)", 0, 10000)}
            </>,
          )}
        </>
      )}

      {category === "heatpump" && (
        <>
          {select("heating", "Hoe verwarm je nu?", {
            gas: "Gasketel",
            hybrid: "Hybride warmtepomp",
            heatpump: "Volledig elektrische warmtepomp",
            resistance: "Elektrische weerstand / infrarood",
            district: "Stadswarmte",
          })}
          {["hybrid", "heatpump"].includes(p.heating) &&
            check("replaceHeatpump", "Bestaande warmtepomp vervangen / upgraden")}
          <div className="space-y-1 text-sm">
            <span className="font-medium">Welke warmtepomp?</span>
            {choice(p.adviseHeatpump ? "advise" : p.target, { hybrid: "Hybride", electric: "Volledig elektrisch", advise: "Laat adviseren" }, (v) =>
              v === "advise"
                ? onChange({ ...p, adviseHeatpump: true, target: p.insulation === "good" ? "electric" : "hybrid" })
                : onChange({ ...p, adviseHeatpump: false, target: v as EnergyProfile["target"], provided: [...new Set([...p.provided, "target"])] }),
            )}
          </div>
          {select("insulation", "Hoe goed is je woning geïsoleerd?", {
            unknown: "Weet ik niet",
            good: "Goed",
            average: "Gemiddeld",
            poor: "Matig",
          })}
          {details(
            "Meer details",
            <>
              {number("hotWaterGas", "Gas voor warm water (m3/jaar)", 0, 5000)}
              {number("cookingGas", "Gas voor koken (m3/jaar)", 0, 1000)}
              {["hybrid", "heatpump", "resistance"].includes(p.heating) &&
                number("heatingElectricity", "Huidig stroomverbruik verwarming (kWh/jaar)", 0, 50000)}
              {["hybrid", "heatpump"].includes(p.heating) &&
                number("existingScop", "Rendement bestaande warmtepomp", 1, 7, 0.1)}
              {select("flowTemperature", "Aanvoertemperatuur op koude dagen", {
                unknown: "Weet ik niet",
                "35": "35 graden (vloerverwarming)",
                "45": "45 graden",
                "55": "55 graden",
                "65": "65 graden",
              })}
              {number("scop", "Seizoensrendement (SCOP) volgens installateur", 1, 7, 0.1, true)}
              {p.target === "hybrid" && number("hybridCoverage", "Aandeel ruimtewarmte door warmtepomp (%)", 0, 100)}
              {p.target === "electric" && (
                <>
                  {number("hotWaterCop", "Rendement warm tapwater", 1, 5, 0.1)}
                  {check("canDisconnectGas", "Gasaansluiting kan worden opgezegd (koken elektrisch)")}
                  {p.canDisconnectGas && number("gasConnectionFixed", "Vaste gaskosten (euro/jaar)", 0, 1000)}
                </>
              )}
            </>,
          )}
        </>
      )}

      {!hideShared && myData}
    </div>
  );
}

/** Full editor ("Pas mijn gegevens aan"): every measure section plus shared energy data. */
export function FullEnergyProfileForm({ value, onChange }: Pick<Props, "value" | "onChange">) {
  return (
    <div className="space-y-6">
      {(["solar", "battery", "heatpump", "ev", "airco"] as const).map((c, i) => (
        <section key={c}>
          <EnergyProfileForm value={value} onChange={onChange} category={c} hideShared={i < 4} />
        </section>
      ))}
    </div>
  );
}
