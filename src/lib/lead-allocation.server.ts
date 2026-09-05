/**
 * Server-only toegang tot de gezaghebbende toewijzingsroute in de database.
 *
 * Alle slotallocatie loopt via de databasefunctie `allocate_lead_to_company`.
 * Die vergrendelt de lead (SELECT ... FOR UPDATE), controleert verificatie,
 * vrije plekken, geschiktheid en maandcapaciteit, bepaalt de prijs en schrijft
 * de toewijzing weg — alles binnen één transactie. Applicatiecode mag nooit
 * zelf op een eerder opgehaalde telling vertrouwen.
 */
import { adminDb } from "@/lib/partner-util";

/** Voorspelbare uitkomsten; alleen onverwachte databasefouten worden gegooid. */
export const ALLOCATION_RESULTS = [
  "allocated",
  "already_assigned",
  "lead_full",
  "lead_not_verified",
  "lead_not_eligible",
  "lead_not_found",
  "company_not_eligible",
  "company_capacity_full",
] as const;

export type AllocationResult = (typeof ALLOCATION_RESULTS)[number];

export type Allocation = {
  result: AllocationResult;
  purchaseId: string | null;
  priceExVat: number;
  billable: boolean;
  isTrial: boolean;
  trialSequenceNumber: number | null;
};

/** Uitkomsten waarbij verder zoeken naar een volgende partner zinloos is. */
export function isLeadTerminal(result: AllocationResult): boolean {
  return (
    result === "lead_full" ||
    result === "lead_not_verified" ||
    result === "lead_not_eligible" ||
    result === "lead_not_found"
  );
}

/** Wijst één lead aan één bedrijf toe via de databasefunctie. */
export async function allocateLeadToCompany(params: {
  leadId: string;
  companyId: string;
  source?: "assigned" | "market";
  purchasedBy?: string | null;
}): Promise<Allocation> {
  const db = await adminDb();
  const { data, error } = await db.rpc("allocate_lead_to_company", {
    p_lead_id: params.leadId,
    p_company_id: params.companyId,
    p_source: params.source ?? "assigned",
    ...(params.purchasedBy ? { p_purchased_by: params.purchasedBy } : {}),
  });

  if (error) {
    // Het databasevangnet (trigger) meldt een volle lead als uitzondering.
    if (error.message?.includes("LEAD_FULL")) {
      return {
        result: "lead_full",
        purchaseId: null,
        priceExVat: 0,
        billable: false,
        isTrial: false,
        trialSequenceNumber: null,
      };
    }
    console.error("allocate_lead_to_company failed", error.message);
    throw new Error("Toewijzen van de lead is mislukt.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        result: string;
        purchase_id: string | null;
        price_ex_vat: number | null;
        billable: boolean | null;
        is_trial: boolean | null;
        trial_sequence_number: number | null;
      }
    | null
    | undefined;

  if (!row) throw new Error("Toewijzen van de lead gaf geen resultaat.");

  return {
    result: row.result as AllocationResult,
    purchaseId: row.purchase_id ?? null,
    priceExVat: Number(row.price_ex_vat ?? 0),
    billable: row.billable === true,
    isTrial: row.is_trial === true,
    trialSequenceNumber: row.trial_sequence_number ?? null,
  };
}
