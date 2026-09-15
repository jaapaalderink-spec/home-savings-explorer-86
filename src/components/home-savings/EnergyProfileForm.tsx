import { Input } from "@/components/ui/input";
import type { EnergyProfile } from "@/lib/home-savings/scenario";

type Props = {
  value: EnergyProfile;
  onChange: (value: EnergyProfile) => void;
  category?: string | undefined;
};
export function EnergyProfileForm({ value: p, onChange, category }: Props) {
  const set = (key: keyof EnergyProfile, value: unknown) => onChange({ ...p, [key]: value });
  const number = (key: keyof EnergyProfile, label: string, min: number, max: number, step = 1) => (
    <label className="block space-y-1 text-sm" key={key}>
      <span className="font-medium">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={(p[key] as number) ?? ""}
        placeholder="Onbekend"
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "" && (key === "scop" || key === "existingYield")) set(key, null);
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
      <span className="font-medium">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-input bg-background px-2"
        value={String(p[key])}
        onChange={(e) => set(key, e.target.value)}
      >
        {Object.entries(options).map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <div className="space-y-5 text-ink">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Huidige energie en tarieven</legend>
        {number(
          "consumption",
          "Totaal stroomverbruik incl. eigen zonnestroom en apparaten (kWh/jaar)",
          0,
          100000,
        )}
        {number("gas", "Gemeten gasverbruik (m3/jaar)", 0, 20000)}
        {number("electricityPrice", "Stroomprijs incl. belasting (euro/kWh)", 0, 2, 0.01)}
        {number("gasPrice", "Gasprijs incl. belasting (euro/m3)", 0, 10, 0.01)}
        {number("exportPrice", "Netto terugleververgoeding na kosten (euro/kWh)", -1, 2, 0.01)}
        {check("netMetering", "Rekenen met saldering in 2026")}
        <p className="text-xs text-moss/70">
          Vooraf ingevulde waarden zijn aannames. Vervang ze door je jaarafrekening en
          installatiegegevens.
        </p>
      </fieldset>
      {(!category || category === "solar" || category === "battery") && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Zonnepanelen</legend>
          {number("existingPanels", "Aantal bestaande panelen", 0, 100)}
          {p.existingPanels > 0 && (
            <>
              {number("existingWp", "Wattpiek per bestaand paneel", 0, 1000)}
              {number("existingYield", "Gemeten totale opbrengst (kWh/jaar, optioneel)", 0, 100000)}
            </>
          )}
          {number("newPanels", "Aantal extra / nieuwe panelen", 0, 100)}
          {number("newWp", "Wattpiek per nieuw paneel", 0, 1000)}
          {number(
            "yieldPerKwp",
            "Specifieke opbrengst voor richting, helling en schaduw (kWh/kWp/jaar)",
            200,
            1300,
          )}
          {number("daytimeShare", "Verbruik tijdens zonuren (%)", 0, 100)}
        </fieldset>
      )}
      {(!category || category === "heatpump" || category === "airco") && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Verwarming en warm water</legend>
          {select("heating", "Huidige verwarming", {
            gas: "Gasketel",
            hybrid: "Hybride warmtepomp",
            heatpump: "Volledig elektrische warmtepomp",
            resistance: "Elektrische weerstand / infrarood",
            district: "Stadswarmte",
          })}
          {number("hotWaterGas", "Deel van huidig gas voor warm water (m3/jaar)", 0, 5000)}
          {number("cookingGas", "Deel van huidig gas voor koken (m3/jaar)", 0, 1000)}
          {["hybrid", "heatpump", "resistance"].includes(p.heating) && (
            <>
              {number(
                "heatingElectricity",
                "Huidig stroomverbruik verwarming (kWh/jaar)",
                0,
                50000,
              )}
              {p.heating !== "resistance" &&
                number("existingScop", "Gemiddeld rendement bestaande warmtepomp", 1, 7, 0.1)}
            </>
          )}
          {["hybrid", "heatpump"].includes(p.heating) &&
            check("replaceHeatpump", "Bestaande warmtepomp vervangen / upgraden")}
          {select("target", "Nieuwe warmtepomp", {
            hybrid: "Hybride",
            electric: "Volledig elektrisch",
          })}
          {select("flowTemperature", "Benodigde aanvoertemperatuur op koude dagen", {
            unknown: "Onbekend",
            "35": "35 graden (bijv. vloerverwarming)",
            "45": "45 graden",
            "55": "55 graden",
            "65": "65 graden",
          })}
          {number("scop", "Verwacht seizoensrendement (SCOP, optioneel)", 1, 7, 0.1)}
          {p.target === "hybrid" &&
            number("hybridCoverage", "Aandeel ruimtewarmte door warmtepomp (%)", 0, 100)}
          {p.target === "electric" && number("hotWaterCop", "Rendement warm tapwater", 1, 5, 0.1)}
        </fieldset>
      )}
      {(!category || category === "battery") && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Thuisbatterij</legend>
          {number("existingBattery", "Bestaande bruikbare capaciteit (kWh)", 0, 100, 0.5)}
          {number("newBattery", "Extra / nieuwe bruikbare capaciteit (kWh)", 0, 100, 0.5)}
          {number("batteryEfficiency", "Laad- en ontlaadrendement (0,5 tot 1)", 0.5, 1, 0.01)}
        </fieldset>
      )}
      {(!category || category === "ev") && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Elektrische auto</legend>
          {check("hasEv", "Elektrische auto aanwezig in de vergelijking")}
          {check("hasCharger", "Laadpaal al aanwezig")}
          {number("evKm", "Kilometers per jaar", 0, 120000)}
          {number("evKwhPer100Km", "Stroom incl. laadverlies (kWh/100 km)", 5, 50, 0.1)}
          {number("homeChargeShare", "Aandeel thuisladen (%)", 0, 100)}
          {number("publicChargePrice", "Tarief openbaar laden (euro/kWh)", 0, 2, 0.01)}
        </fieldset>
      )}
      {(!category || category === "airco") && (
        <fieldset className="space-y-3">
          <legend className="mb-2 font-semibold">Airco</legend>
          {check("hasAirco", "Airco al aanwezig (verbruik zit in huidig stroom- en gasverbruik)")}
          {number("aircoHeatingShare", "Aandeel resterende gasverwarming vervangen (%)", 0, 100)}
          {number("aircoScop", "Seizoensrendement airco bij verwarmen", 1, 7, 0.1)}
          {number("coolingKwh", "Extra stroom voor koeling (kWh/jaar)", 0, 10000)}
        </fieldset>
      )}
    </div>
  );
}
