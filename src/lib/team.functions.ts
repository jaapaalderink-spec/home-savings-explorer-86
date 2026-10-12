import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { adminDb } from "@/lib/partner-util";
import {
  INVITE_TTL_DAYS,
  STAFF_PERMISSIONS,
  seatQuote,
  teamResultMessage,
} from "@/lib/team-policy";

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Db = Awaited<ReturnType<typeof adminDb>>;

async function audit(
  db: Db,
  event: string,
  companyId: string,
  actor: string,
  source: "partner" | "admin",
  metadata: Record<string, unknown>,
) {
  const { error } = await db.rpc("log_audit_event_api", {
    p_event: event,
    p_entity: "company",
    p_entity_id: companyId,
    p_company: companyId,
    p_actor: actor,
    p_source: source,
    p_metadata: metadata,
  } as never);
  if (error) console.error("team audit failed", error.message);
}

/** Bepaalt het bedrijf waarvoor de gebruiker het team mag beheren. */
async function teamContext(userId: string, companyIdForAdmin?: string) {
  const db = await adminDb();
  const [{ data: isOwner }, { data: isAdmin }, { data: profile }] = await Promise.all([
    db.rpc("has_role", { _user_id: userId, _role: "owner" }),
    db.rpc("has_role", { _user_id: userId, _role: "admin" }),
    db.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
  ]);
  if (isAdmin && companyIdForAdmin) {
    return { db, companyId: companyIdForAdmin, source: "admin" as const };
  }
  if (!profile?.company_id) throw new Error("Geen bedrijf gekoppeld.");
  if (!isOwner) throw new Error("Alleen de eigenaar kan het team beheren.");
  return { db, companyId: profile.company_id, source: "partner" as const };
}

async function loadTeam(db: Db, companyId: string) {
  const now = new Date().toISOString();
  const [{ data: company }, { data: members }, { data: invites }] = await Promise.all([
    db.from("companies").select("id, name, monthly_fee_ex_vat").eq("id", companyId).single(),
    db.from("profiles").select("id, full_name, email, created_at").eq("company_id", companyId),
    db
      .from("company_invitations")
      .select("id, email, role, expires_at, created_at, seat_fee_ex_vat, seat_start_date")
      .eq("company_id", companyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .order("created_at", { ascending: false }),
  ]);
  const ids = (members ?? []).map((m) => m.id);
  const { data: roles } = ids.length
    ? await db.from("user_roles").select("user_id, role").in("user_id", ids)
    : { data: [] as Array<{ user_id: string; role: string }> };
  const list = (members ?? []).map((m) => {
    const r = (roles ?? []).filter((x) => x.user_id === m.id).map((x) => x.role as string);
    return {
      id: m.id,
      name: m.full_name || m.email || "Onbekend",
      email: m.email,
      role: r.includes("owner") ? ("owner" as const) : ("account_manager" as const),
      joinedAt: m.created_at,
    };
  });
  const base = Number(company?.monthly_fee_ex_vat ?? 0);
  return {
    companyName: company?.name ?? "",
    members: list,
    invitations: invites ?? [],
    quote: seatQuote(base, list.length, (invites ?? []).length),
  };
}

const companyArg = z.object({ companyId: z.string().uuid().optional() }).optional().default({});

export const getTeamSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyArg.parse(d))
  .handler(async ({ data, context }) => {
    const { db, companyId } = await teamContext(context.userId, data.companyId);
    return { ...(await loadTeam(db, companyId)), me: context.userId };
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(160),
        role: z.enum(["owner", "account_manager"]),
        confirmSeat: z.literal(true),
        companyId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, companyId, source } = await teamContext(context.userId, data.companyId);
    const team = await loadTeam(db, companyId);
    if (team.members.some((m) => m.email?.toLowerCase() === data.email)) {
      throw new Error("Deze persoon zit al in je team.");
    }
    // verlopen, nooit gebruikte uitnodigingen voor dit adres eerst afsluiten
    await db
      .from("company_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .ilike("email", data.email)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .lt("expires_at", new Date().toISOString());
    const token = randomToken();
    const expires = new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000).toISOString();
    const { data: inv, error } = await db
      .from("company_invitations")
      .insert({
        company_id: companyId,
        email: data.email,
        role: data.role,
        token_hash: await sha256Hex(token),
        invited_by: context.userId,
        seat_fee_ex_vat: team.quote.seatFee,
        seat_start_date: team.quote.startDate,
        monthly_total_ex_vat: team.quote.newTotal,
        expires_at: expires,
      })
      .select("id")
      .single();
    if (error || !inv) {
      if (error?.code === "23505")
        throw new Error("Er staat al een uitnodiging open voor dit adres.");
      throw new Error("Uitnodiging aanmaken is mislukt.");
    }
    await audit(db, "TEAM_INVITE_CREATED", companyId, context.userId, source, {
      invitation_id: inv.id,
      role: data.role,
      seat_fee_ex_vat: team.quote.seatFee,
      seat_start_date: team.quote.startDate,
      monthly_total_ex_vat: team.quote.newTotal,
    });
    return { token, expiresAt: expires };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), companyId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, companyId, source } = await teamContext(context.userId, data.companyId);
    const { data: rows } = await db
      .from("company_invitations")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("company_id", companyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .select("id");
    if (!rows?.length) throw new Error("Uitnodiging niet gevonden of al afgehandeld.");
    await audit(db, "TEAM_INVITE_REVOKED", companyId, context.userId, source, {
      invitation_id: data.id,
    });
    return { ok: true };
  });

export const updateTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        action: z.enum(["make_owner", "make_account_manager", "remove"]),
        companyId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { db, companyId, source } = await teamContext(context.userId, data.companyId);
    const { data: result, error } = await db.rpc("team_update_member", {
      p_company: companyId,
      p_target: data.userId,
      p_action: data.action,
      p_actor: context.userId,
      p_source: source,
    });
    if (error) throw new Error("Wijziging is mislukt.");
    if (result !== "OK") throw new Error(teamResultMessage(String(result)));
    return { ok: true };
  });

export const previewInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const db = await adminDb();
    const { data: inv } = await db
      .from("company_invitations")
      .select("email, role, expires_at, accepted_at, revoked_at, companies(name)")
      .eq("token_hash", await sha256Hex(data.token))
      .maybeSingle();
    if (!inv) return { status: "NOT_FOUND" as const };
    const status = inv.revoked_at
      ? "REVOKED"
      : inv.accepted_at
        ? "USED"
        : new Date(inv.expires_at) < new Date()
          ? "EXPIRED"
          : "OPEN";
    const company = inv.companies as unknown as { name: string } | null;
    return { status, email: inv.email, role: inv.role, companyName: company?.name ?? "" };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await adminDb();
    const email = (context.claims as { email?: string }).email ?? "";
    const { data: rows, error } = await db.rpc("accept_company_invitation", {
      p_token_hash: await sha256Hex(data.token),
      p_user: context.userId,
      p_email: email,
    });
    if (error) throw new Error("Uitnodiging accepteren is mislukt.");
    const row = (rows ?? [])[0];
    if (!row || row.result !== "OK") throw new Error(teamResultMessage(row?.result ?? ""));
    return { ok: true };
  });

/* ---------------- Platformteam (alleen platformbeheerders) ---------------- */

async function assertAdmin(userId: string) {
  const db = await adminDb();
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Alleen platformbeheerders.");
  return db;
}

export const listPlatformTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context.userId);
    const { data: roles } = await db
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "platform_staff"]);
    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    if (!ids.length) return { me: context.userId, members: [] };
    const [{ data: profiles }, { data: perms }] = await Promise.all([
      db.from("profiles").select("id, full_name, email").in("id", ids),
      db.from("staff_permissions").select("user_id, permission").in("user_id", ids),
    ]);
    return {
      me: context.userId,
      members: ids.map((id) => {
        const p = (profiles ?? []).find((x) => x.id === id);
        const r = (roles ?? []).filter((x) => x.user_id === id).map((x) => x.role as string);
        return {
          id,
          name: p?.full_name || p?.email || "Onbekend",
          email: p?.email ?? "",
          role: r.includes("admin") ? ("admin" as const) : ("platform_staff" as const),
          permissions: (perms ?? []).filter((x) => x.user_id === id).map((x) => x.permission),
        };
      }),
    };
  });

const permIds = STAFF_PERMISSIONS.map((p) => p.id) as [string, ...string[]];

export const setPlatformMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().toLowerCase().email().max(160),
        role: z.enum(["admin", "platform_staff", "none"]),
        permissions: z.array(z.enum(permIds)).max(permIds.length),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context.userId);
    const { data: target } = await db
      .from("profiles")
      .select("id")
      .ilike("email", data.email)
      .maybeSingle();
    if (!target)
      throw new Error(
        "Geen account met dit e-mailadres. Laat de persoon eerst een account aanmaken.",
      );
    if (target.id === context.userId) throw new Error("Je kunt je eigen rechten niet wijzigen.");

    if (data.role !== "admin") {
      const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
      const isAdminNow = (admins ?? []).some((a) => a.user_id === target.id);
      if (isAdminNow && (admins ?? []).length <= 1)
        throw new Error("Er moet minstens één platformbeheerder blijven.");
    }

    await db
      .from("user_roles")
      .delete()
      .eq("user_id", target.id)
      .in("role", ["admin", "platform_staff"]);
    await db.from("staff_permissions").delete().eq("user_id", target.id);
    if (data.role !== "none") {
      await db.from("user_roles").insert({ user_id: target.id, role: data.role });
    }
    if (data.role === "platform_staff" && data.permissions.length) {
      await db.from("staff_permissions").insert(
        data.permissions.map((permission) => ({
          user_id: target.id,
          permission,
          granted_by: context.userId,
        })),
      );
    }
    const { error } = await db.rpc("log_audit_event_api", {
      p_event: "STAFF_PERMISSIONS_CHANGED",
      p_entity: "company",
      p_entity_id: target.id,
      p_company: null,
      p_actor: context.userId,
      p_source: "admin",
      p_metadata: { target_user: target.id, role: data.role, permissions: data.permissions },
    } as never);
    if (error) console.error("staff audit failed", error.message);
    return { ok: true };
  });
