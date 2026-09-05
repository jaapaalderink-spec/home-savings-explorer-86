/** Server-only logica voor sms-verificatie: codes, hashes en database. */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/partner-util";
import {
  CODE_TTL_MS,
  MAX_SENDS_PER_HOUR,
  SEND_MESSAGE,
  CHALLENGE_MESSAGE,
  checkChallenge,
  checkSendAllowed,
} from "@/lib/phone-verify-policy";
import { sendSms, verificationSmsBody } from "@/lib/sms.server";

/** Cryptografisch veilige 6-cijferige code. */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashSecret(): string {
  return (
    process.env["PHONE_VERIFY_SECRET"] ??
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
    "development-only-fallback"
  );
}

/** HMAC van de code, gebonden aan challenge-id en telefoonnummer. */
export function hashCode(challengeId: string, phone: string, code: string): string {
  return createHmac("sha256", hashSecret()).update(`${challengeId}:${phone}:${code}`).digest("hex");
}

/** Constante-tijd vergelijking van twee hex-hashes. */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export type StartResult = { token: string; expiresAt: string; sendsLeft: number };

/**
 * Maakt een nieuwe verificatie-challenge voor een lead en verstuurt de code.
 * Rate limit: max 3 sms per nummer per uur en niet binnen 60 seconden opnieuw.
 */
export async function createChallenge(leadId: string, phoneE164: string): Promise<StartResult> {
  const db = await adminDb();
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const { data: recent } = await db
    .from("phone_verifications")
    .select("id, send_count, last_sent_at")
    .eq("phone", phoneE164)
    .gte("last_sent_at", hourAgo)
    .order("last_sent_at", { ascending: false });

  const sendsLastHour = (recent ?? []).reduce((sum, r) => sum + (r.send_count ?? 1), 0);
  const lastSentAt = recent?.[0]?.last_sent_at ?? null;
  const blocked = checkSendAllowed({ sendsLastHour, lastSentAt }, now);
  if (blocked) throw new Error(SEND_MESSAGE[blocked]);

  const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
  const { data: row, error } = await db
    .from("phone_verifications")
    .insert({
      lead_id: leadId,
      phone: phoneE164,
      attempts: 0,
      send_count: 1,
      last_sent_at: now.toISOString(),
      expires_at: expiresAt,
    })
    .select("id, token")
    .single();
  if (error || !row) {
    console.error("createChallenge failed", error?.message);
    throw new Error("We konden geen verificatiecode aanmaken. Probeer het opnieuw.");
  }

  const code = generateCode();
  await db
    .from("phone_verifications")
    .update({ code_hash: hashCode(row.id, phoneE164, code) })
    .eq("id", row.id);

  await sendSms(phoneE164, verificationSmsBody(code));

  return {
    token: row.token,
    expiresAt,
    sendsLeft: Math.max(0, MAX_SENDS_PER_HOUR - sendsLastHour - 1),
  };
}

/** Verstuurt een nieuwe code voor een bestaande challenge (nieuw record, zelfde lead). */
export async function resendChallenge(token: string): Promise<StartResult> {
  const db = await adminDb();
  const { data: existing } = await db
    .from("phone_verifications")
    .select("lead_id, phone, verified_at")
    .eq("token", token)
    .maybeSingle();
  if (!existing?.lead_id) throw new Error("Verificatie niet gevonden. Start je aanvraag opnieuw.");
  if (existing.verified_at) throw new Error(CHALLENGE_MESSAGE.ALREADY_USED);
  return createChallenge(existing.lead_id, existing.phone);
}

export type VerifyResult =
  | { ok: true; assigned: number; state: string }
  | { ok: false; error: string; attemptsLeft: number };

/** Controleert de code en verdeelt de lead pas na succes. */
export async function verifyChallenge(token: string, code: string): Promise<VerifyResult> {
  const db = await adminDb();
  const { data: row } = await db
    .from("phone_verifications")
    .select("id, lead_id, phone, code_hash, attempts, expires_at, verified_at, consumed_at")
    .eq("token", token)
    .maybeSingle();
  if (!row) throw new Error("Verificatie niet gevonden. Start je aanvraag opnieuw.");

  const blocked = checkChallenge(
    {
      expiresAt: row.expires_at,
      attempts: row.attempts ?? 0,
      verifiedAt: row.verified_at,
      consumedAt: row.consumed_at,
    },
    new Date(),
  );
  if (blocked) return { ok: false, error: CHALLENGE_MESSAGE[blocked], attemptsLeft: 0 };

  const expected = row.code_hash ?? "";
  const given = hashCode(row.id, row.phone, code);
  if (!expected || !hashesMatch(expected, given)) {
    const attempts = (row.attempts ?? 0) + 1;
    await db.from("phone_verifications").update({ attempts }).eq("id", row.id);
    const attemptsLeft = Math.max(0, 5 - attempts);
    return {
      ok: false,
      error:
        attemptsLeft === 0
          ? CHALLENGE_MESSAGE.TOO_MANY_ATTEMPTS
          : "Onjuiste code. Probeer het opnieuw.",
      attemptsLeft,
    };
  }

  const nowIso = new Date().toISOString();
  await db
    .from("phone_verifications")
    .update({ verified_at: nowIso, consumed_at: nowIso, code_hash: null })
    .eq("id", row.id);

  if (!row.lead_id) throw new Error("Verificatie hoort niet bij een aanvraag.");
  await db
    .from("leads")
    .update({ phone_verified: true, phone_verified_at: nowIso })
    .eq("id", row.lead_id);

  const { distributeLead } = await import("@/lib/leads.server");
  const result = await distributeLead(row.lead_id);
  return { ok: true, assigned: result.assigned, state: result.state };
}
