/**
 * Platformbeheer vereist tweestapsverificatie: rol 'admin' én een sessie op niveau aal2.
 * Zonder tweede stap geldt de gebruiker niet als beheerder (fail closed).
 */
type Claims = { aal?: unknown } | null | undefined;
type RpcDb = { rpc: (fn: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown }> };

export function sessionHasMfa(claims: Claims): boolean {
  return claims?.aal === "aal2";
}

export async function adminRole(db: RpcDb, userId: string, claims: Claims) {
  const { data } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  return { data: Boolean(data) && sessionHasMfa(claims) };
}
