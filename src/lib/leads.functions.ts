import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const leadSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().min(8).max(24),
  postcode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/, "Ongeldige postcode"),
  houseNumber: z.string().trim().max(12).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  categories: z.array(z.string().max(24)).min(1).max(6),
  contractType: z.string().max(24).optional().default("onbekend"),
  houseType: z.string().max(24).optional().default(""),
  currentHeating: z.string().max(24).optional().default(""),
  buildYear: z.number().int().min(1850).max(2035).optional(),
  annualConsumptionKwh: z.number().int().min(0).max(30000).optional(),
  annualFeedInKwh: z.number().int().min(0).max(30000).optional(),
  panelCount: z.number().int().min(0).max(60).optional(),
  evStatus: z.string().max(24).optional().default(""),
  annualKm: z.number().int().min(0).max(120000).optional(),
  aircoRooms: z.number().int().min(0).max(12).optional(),
  smartDevices: z.array(z.string().max(24)).max(12).optional().default([]),
  batteryGoals: z.array(z.string().max(24)).max(12).optional().default([]),
  estimatedSavings: z.number().int().min(0).max(20000).optional().default(0),
  notes: z.string().trim().max(1000).optional().default(""),
});

export type LeadInput = z.infer<typeof leadSchema>;

/**
 * Slaat de aanvraag op en start de sms-verificatie.
 * De lead wordt hier NIET verdeeld; dat gebeurt pas na een geslaagde verificatie.
 */
export const submitLead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data }) => {
    const { normalizeDutchMobile } = await import("@/lib/phone");
    const phone = normalizeDutchMobile(data.phone);
    if (!phone) {
      throw new Error("Vul een geldig Nederlands mobiel nummer in, bijvoorbeeld 06 12345678.");
    }

    const { insertLead } = await import("@/lib/leads.server");
    const { assessSubmission, applyAssessment } = await import("@/lib/lead-risk.server");
    const { NEUTRAL_CONFIRMATION } = await import("@/lib/lead-risk-policy");

    // Beoordeel de inzending vóórdat er een sms de deur uit gaat.
    const assessment = await assessSubmission({ ...data, phone });
    const leadId = await insertLead({ ...data, phone });
    await applyAssessment(leadId, assessment);

    if (!assessment.allowSms) {
      // Neutrale bevestiging: we verklappen nooit dat er al gegevens bestaan,
      // en er wordt geen nieuwe verificatiecode verstuurd of lead verdeeld.
      return {
        ok: true,
        needsVerification: false as const,
        message: NEUTRAL_CONFIRMATION,
        token: "",
        expiresAt: "",
        phoneMasked: "",
      };
    }

    const { createChallenge } = await import("@/lib/phone-verify.server");
    const challenge = await createChallenge(leadId, phone);

    const { maskPhone } = await import("@/lib/phone");
    return {
      ok: true,
      needsVerification: true as const,
      message: null,
      token: challenge.token,
      expiresAt: challenge.expiresAt,
      phoneMasked: maskPhone(phone),
    };
  });
