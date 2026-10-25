/** Membership alone never grants access to another colleague's dossiers. */
export function canReadPartnerPurchase(input: {
  companyId: string | null;
  purchaseCompanyId: string;
  userId: string;
  assignedTo: string | null;
  owner: boolean;
  accountManager: boolean;
}) {
  return input.companyId !== null && input.companyId === input.purchaseCompanyId &&
    (input.owner || (input.accountManager && input.assignedTo === input.userId));
}