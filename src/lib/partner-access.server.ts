import { adminDb } from "@/lib/partner-util";

/** Resolve company scope once; membership does not imply team-wide dossier access. */
export async function partnerAccess(userId: string) {
  const db = await adminDb();
  const [{ data: profile, error }, { data: owner }] = await Promise.all([
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    db.rpc("has_role", { _user_id: userId, _role: "owner" }),
  ]);
  if (error || !profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
  return { db, companyId: profile.company_id, teamRead: owner === true, userId };
}

export async function accessiblePurchase(userId: string, purchaseId: string) {
  const access = await partnerAccess(userId);
  let query = access.db.from("lead_purchases")
    .select("id, status, products, assigned_to, lead:leads(categories)")
    .eq("id", purchaseId).eq("company_id", access.companyId);
  if (!access.teamRead) query = query.eq("assigned_to", userId);
  const { data: purchase, error } = await query.maybeSingle();
  if (error || !purchase) throw new Error("Lead niet gevonden of geen toegang.");
  return { ...access, purchase };
}