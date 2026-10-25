import { adminDb } from "@/lib/partner-util";
import { canReadPartnerPurchase } from "@/lib/partner-access-policy";

/** Resolve company scope once; membership does not imply team-wide dossier access. */
export async function partnerAccess(userId: string) {
  const db = await adminDb();
  const [{ data: profile, error }, { data: roles, error: roleError }] = await Promise.all([
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (error || !profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
  const owner = roles?.some((r) => r.role === "owner") === true;
  const accountManager = roles?.some((r) => r.role === "account_manager") === true;
  if (roleError || (!owner && !accountManager)) throw new Error("Geen toegang tot het partnerportaal.");
  return { db, companyId: profile.company_id, teamRead: owner, owner, accountManager, userId };
}

export async function accessiblePurchase(userId: string, purchaseId: string) {
  const access = await partnerAccess(userId);
  let query = access.db.from("lead_purchases")
    .select("id, company_id, status, products, assigned_to, lead:leads(categories)")
    .eq("id", purchaseId).eq("company_id", access.companyId);
  if (!access.teamRead) query = query.eq("assigned_to", userId);
  const { data: purchase, error } = await query.maybeSingle();
  if (error || !purchase || !canReadPartnerPurchase({
    companyId: access.companyId, purchaseCompanyId: purchase.company_id,
    userId, assignedTo: purchase.assigned_to, owner: access.owner, accountManager: access.accountManager,
  })) throw new Error("Lead niet gevonden of geen toegang.");
  return { ...access, purchase };
}