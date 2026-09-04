import type { AdviceResult } from "@/lib/home-savings";
import { combineSavings } from "@/lib/home-savings";
import { CATEGORIES, CONTRACT_META } from "./categories";
import type { HomeInputs } from "./CategoryPanel";

/** bouw een /offerte-link die álle ingevulde hotspot-gegevens meeneemt */
export function buildOfferteHref(
  inputs: HomeInputs,
  results: Record<string, AdviceResult | null>,
  extraCat?: string,
): string {
  const owned: Record<string, boolean> = inputs?.owned ?? {};
  const items = [...CATEGORIES, CONTRACT_META];

  const counted = items
    .map((c) => c.id)
    .filter((id) => results[id] != null && !owned[id]);
  if (extraCat && !counted.includes(extraCat) && !owned[extraCat] && extraCat !== "contract") {
    counted.push(extraCat);
  }

  const total = combineSavings(
    Object.fromEntries(counted.map((id) => [id, results[id]?.practicalSavings ?? 0])),
  );

  // warmtepomp gebruikt gas/elektrisch/anders; het offerteformulier gebruikt gasketel/hybride/stadswarmte/warmtepomp
  const heatingMap: Record<string, string> = { gas: "gasketel", elektrisch: "warmtepomp" };
  const heating = heatingMap[inputs.heatpump.currentHeating] ?? "";

  const params = new URLSearchParams({
    cats: counted.join(","),
    owned: Object.keys(owned).filter((k) => owned[k]).join(","),
    houseType: inputs.heatpump.houseType,
    contract: inputs.contract.type,
    consumption: String(inputs.solar.annualConsumptionKwh),
    feedin: String(inputs.battery.annualFeedInKwh),
    panels: String(inputs.solar.panelCount),
    heating,
    buildYear: String(inputs.heatpump.buildYear),
    energyLabel: inputs.heatpump.energyLabel,
    evStatus: inputs.ev.evStatus,
    evKm: String(inputs.ev.annualKm),
    aircoRooms: String(inputs.airco.roomCount),
    batteryGoals: inputs.battery.goals.join(","),
    total: String(total),
  });

  return `/offerte?${params.toString()}`;
}
