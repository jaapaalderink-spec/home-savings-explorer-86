import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Vraagt een nieuwe verificatiecode aan voor een bestaande verificatiesessie.
 * De browser kent alleen het opake sessietoken, nooit de code of de hash.
 */
export const startPhoneVerification = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { resendChallenge } = await import("@/lib/phone-verify.server");
    const result = await resendChallenge(data.token);
    return { ok: true as const, expiresAt: result.expiresAt, sendsLeft: result.sendsLeft };
  });

/** Controleert de ingevoerde code; bij succes wordt de lead verdeeld. */
export const verifyPhoneCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().uuid(),
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/, "Vul de 6-cijferige code in."),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { verifyChallenge } = await import("@/lib/phone-verify.server");
    return verifyChallenge(data.token, data.code);
  });
