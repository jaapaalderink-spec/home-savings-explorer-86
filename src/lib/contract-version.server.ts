import { CONTRACT_DEFAULTS } from "@/lib/contract-policy";
import {
  MIN_TERM_MONTHS,
  NOTICE_MONTHS,
  PACKAGES,
  PACKAGE_EXTRA_PRODUCT_PRICE,
  PACKAGE_LEAD_PRICE,
  PACKAGE_PLATFORM_FEE,
  SEAT_FEE,
  type BillingMode,
  type PackageCode,
} from "@/lib/package-policy";

export type CustomPrices = {
  platformFee: number;
  seatFee: number;
  leadPrice: number;
  extraProductPrice: number;
};

export type ContractInput = {
  companyId: string;
  validFrom: string;
  leadQuotaPerMonth: number;
  paidSeats: number;
  note?: string;
  packageCode?: PackageCode;
  billingMode: BillingMode;
  customPrices?: CustomPrices;
  reviewDate?: string;
  reviewNote?: string;
};

type Db = Awaited<ReturnType<typeof import("@/lib/partner-util").adminDb>>;

/** Legt één onveranderlijke contractversie vast (+ optionele tariefreview). */
export async function insertContractVersion(db: Db, data: ContractInput, actor: string) {
  if (data.billingMode === "fixed_package" && !data.packageCode)
    throw new Error("Kies een pakket om op vast pakketbedrag te factureren.");
  if (data.customPrices && !data.note?.trim())
    throw new Error("Leg bij maatwerktarieven vast waarom en met wie dit is afgesproken.");
  const pkg = data.packageCode ? PACKAGES[data.packageCode] : null;
  const c = data.customPrices;
  const platform = c?.platformFee ?? (pkg ? PACKAGE_PLATFORM_FEE : CONTRACT_DEFAULTS.platformFee);
  const seat = c?.seatFee ?? (pkg ? SEAT_FEE : CONTRACT_DEFAULTS.seatFee);
  const lead = c?.leadPrice ?? (pkg ? PACKAGE_LEAD_PRICE : CONTRACT_DEFAULTS.baseLeadPrice);
  const extra = c?.extraProductPrice ?? (pkg ? PACKAGE_EXTRA_PRODUCT_PRICE : CONTRACT_DEFAULTS.extraProductPrice);
  const quota = pkg ? pkg.leads : data.leadQuotaPerMonth;

  const { data: last } = await db
    .from("subscription_versions")
    .select("version")
    .eq("company_id", data.companyId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: row, error } = await db
    .from("subscription_versions")
    .insert({
      company_id: data.companyId,
      version: (last?.version ?? 0) + 1,
      valid_from: data.validFrom,
      lead_quota_per_month: quota,
      paid_seats: data.paidSeats,
      platform_fee_ex_vat: platform,
      seat_fee_ex_vat: seat,
      base_lead_price_ex_vat: lead,
      extra_product_price_ex_vat: extra,
      package_code: data.packageCode ?? null,
      billing_mode: pkg ? data.billingMode : "actual_delivered",
      package_fee_ex_vat: pkg ? platform + pkg.leads * lead : null,
      included_seats: pkg?.includedSeats ?? 0,
      min_term_months: pkg ? MIN_TERM_MONTHS : 0,
      notice_months: NOTICE_MONTHS,
      custom_pricing: !!c,
      note: data.note ?? null,
      created_by: actor,
    })
    .select("id")
    .single();
  if (error || !row) {
    if (error?.code === "23505") throw new Error("Er bestaat al een contractversie met die ingangsdatum.");
    throw new Error("Contractversie opslaan is mislukt.");
  }
  if (data.reviewDate) {
    await db.from("price_reviews").insert({
      company_id: data.companyId,
      subscription_version_id: row.id,
      review_date: data.reviewDate,
      note: data.reviewNote ?? null,
      created_by: actor,
    });
  }
  await db.rpc("log_audit_event_api", {
    p_event: "COMPANY_COMMERCIAL_SETTINGS_UPDATED",
    p_entity: "company",
    p_entity_id: data.companyId,
    p_company: data.companyId,
    p_actor: actor,
    p_source: "admin",
    p_metadata: { subscription_version: data },
  } as never);
  return row.id;
}
