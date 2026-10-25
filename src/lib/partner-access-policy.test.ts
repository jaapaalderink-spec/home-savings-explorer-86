import { describe, expect, it } from "vitest";
import { canReadPartnerPurchase } from "./partner-access-policy";

const scope = { companyId: "company-a", purchaseCompanyId: "company-a", userId: "manager-a", assignedTo: "manager-a", owner: false, accountManager: true };

describe("partner dossier access", () => {
  it("allows an account manager's assigned dossier", () => expect(canReadPartnerPurchase(scope)).toBe(true));
  it("denies a colleague's dossier", () => expect(canReadPartnerPurchase({ ...scope, assignedTo: "manager-b" })).toBe(false));
  it("reserves the unassigned pool for owners", () => expect(canReadPartnerPurchase({ ...scope, assignedTo: null })).toBe(false));
  it("allows the owner to read their company pool", () => expect(canReadPartnerPurchase({ ...scope, owner: true, assignedTo: null })).toBe(true));
  it("never grants cross-company access to an owner", () => expect(canReadPartnerPurchase({ ...scope, owner: true, purchaseCompanyId: "company-b" })).toBe(false));
  it("denies assignment without a current partner role", () => expect(canReadPartnerPurchase({ ...scope, accountManager: false })).toBe(false));
});