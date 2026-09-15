import type { AdviceResult } from "@/lib/home-savings";
import { CATEGORIES, CONTRACT_META } from "./categories";
import type { HomeInputs } from "./CategoryPanel";
import { calculateScenario } from "@/lib/home-savings/scenario";

/** bouw een /offerte-link die álle ingevulde hotspot-gegevens meeneemt */
export function buildOfferteHref(
  inputs: HomeInputs,
  results: Record<string, AdviceResult | null>,
  extraCat?: string,
): string {
  const owned: Record<string, boolean> = inputs?.owned ?? {};
  const items = [...CATEGORIES, CONTRACT_META];

  const counted: string[] = items.map((c) => c.id as string).filter((id) => results[id] != null);
  if (extraCat && !counted.includes(extraCat) && extraCat !== "contract") {
    counted.push(extraCat);
  }

  const total = calculateScenario(inputs.profile, counted).savings;

  const params = new URLSearchParams({
    cats: counted.join(","),
    owned: Object.keys(owned)
      .filter((k) => owned[k])
      .join(","),
    contract: inputs.contract.type,
    consumption: String(inputs.profile.consumption),
    feedin: String(Math.round(calculateScenario(inputs.profile, []).before.exports)),
    panels: String(inputs.profile.existingPanels),
    heating: inputs.profile.heating,
    evStatus: inputs.profile.hasEv ? "nu" : "nogniet",
    evKm: String(inputs.profile.evKm),
    total: String(Math.round(total)),
    energyProfile: JSON.stringify(inputs.profile),
  });

  return `/offerte?${params.toString()}`;
}
