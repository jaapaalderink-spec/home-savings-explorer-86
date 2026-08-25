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

export const submitLead = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data }) => {
    const { insertLead, distributeLead } = await import("@/lib/leads.server");
    const leadId = await insertLead(data);
    const result = await distributeLead(leadId);
    return { ok: true, assigned: result.assigned, state: result.state };
  });

