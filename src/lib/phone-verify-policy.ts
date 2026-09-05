/**
 * Regels rond sms-verificatie: geldigheidsduur, pogingen en verzendlimieten.
 * Pure functies zonder database of secrets, zodat ze te testen zijn.
 */

export const CODE_TTL_MS = 10 * 60 * 1000; // 10 minuten
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS_PER_HOUR = 3;
export const RESEND_COOLDOWN_MS = 60 * 1000; // niet direct opnieuw versturen

export type ChallengeState = {
  expiresAt: string | Date;
  attempts: number;
  verifiedAt: string | Date | null;
  consumedAt: string | Date | null;
};

export type ChallengeError = "EXPIRED" | "TOO_MANY_ATTEMPTS" | "ALREADY_USED";
export type SendError = "SEND_LIMIT_REACHED" | "RESEND_TOO_SOON";

function ms(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/** Mag er nog een code op deze challenge ingevuld worden? */
export function checkChallenge(state: ChallengeState, now: Date = new Date()): ChallengeError | null {
  if (state.verifiedAt || state.consumedAt) return "ALREADY_USED";
  if (state.attempts >= MAX_ATTEMPTS) return "TOO_MANY_ATTEMPTS";
  if (ms(state.expiresAt) <= now.getTime()) return "EXPIRED";
  return null;
}

/** Mag er (opnieuw) een sms verstuurd worden naar dit nummer? */
export function checkSendAllowed(
  input: { sendsLastHour: number; lastSentAt: string | Date | null },
  now: Date = new Date(),
): SendError | null {
  if (input.sendsLastHour >= MAX_SENDS_PER_HOUR) return "SEND_LIMIT_REACHED";
  if (input.lastSentAt && now.getTime() - ms(input.lastSentAt) < RESEND_COOLDOWN_MS) {
    return "RESEND_TOO_SOON";
  }
  return null;
}

export const CHALLENGE_MESSAGE: Record<ChallengeError, string> = {
  EXPIRED: "Deze code is verlopen. Vraag een nieuwe code aan.",
  TOO_MANY_ATTEMPTS: "Te veel pogingen. Vraag een nieuwe code aan.",
  ALREADY_USED: "Dit nummer is al bevestigd.",
};

export const SEND_MESSAGE: Record<SendError, string> = {
  SEND_LIMIT_REACHED: "Je hebt te vaak een code aangevraagd. Probeer het over een uur opnieuw.",
  RESEND_TOO_SOON: "Wacht even voordat je een nieuwe code aanvraagt.",
};
