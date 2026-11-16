import { formatEuro } from "@/lib/home-savings";

type Lead = Record<string, unknown>;

const HEATING: Record<string, string> = {
  gas: "Gasketel", gasketel: "Gasketel", hybrid: "Hybride warmtepomp", heatpump: "Warmtepomp",
  resistance: "Elektrisch", district: "Stadsverwarming",
};
const CONTRACT: Record<string, string> = { vast: "Vast", variabel: "Variabel", dynamisch: "Dynamisch", onbekend: "Onbekend" };
const EV: Record<string, string> = { nu: "Ja, aanwezig", nogniet: "Nog niet", gepland: "Gepland" };

/** Splitst de klantnotitie van de technische rekenparameters en leest het energieprofiel. */
export function splitNotes(raw: unknown): { note: string; profile: Record<string, unknown> | null } {
  const text = typeof raw === "string" ? raw : "";
  const idx = text.indexOf("Rekenparameters:");
  if (idx === -1) return { note: text.trim(), profile: null };
  const note = text.slice(0, idx).trim();
  const json = text.slice(text.indexOf("{", idx));
  try {
    return { note, profile: JSON.parse(json) as Record<string, unknown> };
  } catch {
    return { note, profile: null };
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function LeadIntake({ lead }: { lead: Lead }) {
  const { note, profile } = splitNotes(lead["notes"]);
  const gas = num(profile?.["gas"]);
  const heating = String(lead["current_heating"] ?? profile?.["heating"] ?? "");
  const goals = (lead["battery_goals"] as string[] | null) ?? [];
  const rows: [string, string | null][] = [
    ["Woningtype", (lead["house_type"] as string) || null],
    ["Bouwjaar", num(lead["build_year"])?.toString() ?? null],
    ["Energiecontract", lead["contract_type"] ? CONTRACT[String(lead["contract_type"])] ?? String(lead["contract_type"]) : null],
    ["Verwarming", heating ? HEATING[heating] ?? heating : null],
    ["Stroomverbruik", num(lead["annual_consumption_kwh"]) != null ? `${num(lead["annual_consumption_kwh"])!.toLocaleString("nl-NL")} kWh/jaar` : null],
    ["Gasverbruik", gas != null ? `${Math.round(gas).toLocaleString("nl-NL")} m³/jaar` : null],
    ["Teruglevering", num(lead["annual_feedin_kwh"]) ? `${num(lead["annual_feedin_kwh"])!.toLocaleString("nl-NL")} kWh/jaar` : null],
    ["Zonnepanelen", num(lead["panel_count"]) ? `${num(lead["panel_count"])} panelen` : num(lead["panel_count"]) === 0 ? "Geen" : null],
    ["Elektrische auto", lead["ev_status"] ? EV[String(lead["ev_status"])] ?? String(lead["ev_status"]) : null],
    ["Jaarkilometers", num(lead["annual_km"]) ? `${num(lead["annual_km"])!.toLocaleString("nl-NL")} km` : null],
    ["Airco ruimtes", num(lead["airco_rooms"]) ? String(num(lead["airco_rooms"])) : null],
    ["Batterijcapaciteit", num(profile?.["newBattery"]) ? `${num(profile?.["newBattery"])} kWh` : null],
    ["Batterijdoelen", goals.length ? goals.join(", ") : null],
    ["Geschatte besparing", num(lead["estimated_savings"]) ? `${formatEuro(num(lead["estimated_savings"])!)} per jaar` : null],
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  if (shown.length === 0 && !note) return null;

  return (
    <details className="mt-3 rounded-xl bg-muted p-3" open>
      <summary className="cursor-pointer text-xs font-bold text-ink">Aanvraagspecificaties</summary>
      {shown.length > 0 && (
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
          {shown.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-moss/10 pb-1">
              <dt className="text-moss/70">{k}</dt>
              <dd className="text-right font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {note && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-moss">Toelichting van de klant</p>
          <p className="mt-1 whitespace-pre-line text-xs text-moss/80">{note}</p>
        </div>
      )}
    </details>
  );
}
