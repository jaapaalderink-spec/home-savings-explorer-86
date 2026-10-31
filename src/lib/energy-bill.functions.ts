import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MAX_BYTES = 10 * 1024 * 1024;
const MIME = ["application/pdf", "image/jpeg", "image/png"] as const;

const num = { type: ["number", "null"] };
const str = { type: ["string", "null"] };
const FIELDS = {
  consumptionKwh: num,
  feedInKwh: num,
  gasM3: num,
  electricityPricePerKwh: num,
  gasPricePerM3: num,
  supplier: str,
  contractType: { type: ["string", "null"], enum: ["vast", "variabel", "dynamisch", null] },
  firstName: str,
  lastName: str,
  postcode: str,
  houseNumber: str,
  city: str,
} as const;

export type EnergyBillData = {
  consumptionKwh: number | null;
  feedInKwh: number | null;
  gasM3: number | null;
  electricityPricePerKwh: number | null;
  gasPricePerM3: number | null;
  supplier: string | null;
  contractType: "vast" | "variabel" | "dynamisch" | null;
  firstName: string | null;
  lastName: string | null;
  postcode: string | null;
  houseNumber: string | null;
  city: string | null;
};

const PROMPT = `Je leest een Nederlandse energie-jaarafrekening of jaaropgave. Geef uitsluitend waarden die letterlijk in het document staan; anders null.
- consumptionKwh: totaal stroomverbruik van het afgelopen jaar in kWh (normaal + dal opgeteld, vóór aftrek van teruglevering).
- feedInKwh: totale teruglevering in kWh.
- gasM3: gasverbruik in m3 per jaar.
- electricityPricePerKwh en gasPricePerM3: all-in prijs per eenheid incl. btw en energiebelasting in euro, als die vermeld staat.
- contractType: vast, variabel of dynamisch als dat blijkt.
- Naam en adres van de klant (niet van de leverancier). Postcode als "1234 AB".`;

export const readEnergyBill = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().max(200),
        mimeType: z.enum(MIME),
        base64: z.string().min(10).max(Math.ceil((MAX_BYTES * 4) / 3) + 8),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true; data: EnergyBillData } | { ok: false; error: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { ok: false, error: "Het uitlezen is tijdelijk niet beschikbaar." };
    const part =
      data.mimeType === "application/pdf"
        ? { type: "input_file", filename: data.filename || "jaaropgave.pdf", file_data: `data:application/pdf;base64,${data.base64}` }
        : { type: "input_image", image_url: `data:${data.mimeType};base64,${data.base64}` };
    // Het bestand wordt alleen in het geheugen doorgestuurd en nergens opgeslagen.
    const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "openai/gpt-6-astra",
        stream: true,
        store: false,
        reasoning: { effort: "low" },
        instructions: PROMPT,
        input: [{ role: "user", content: [{ type: "input_text", text: "Lees deze jaaropgave uit." }, part] }],
        text: {
          format: {
            type: "json_schema",
            name: "energy_bill",
            strict: true,
            schema: { type: "object", additionalProperties: false, required: Object.keys(FIELDS), properties: FIELDS },
          },
        },
      }),
    });
    if (!res.ok || !res.body) {
      console.error("energy bill AI error", res.status, await res.text().catch(() => ""));
      if (res.status === 429) return { ok: false, error: "Het is nu erg druk. Probeer het over een minuut opnieuw." };
      if (res.status === 402 || res.status === 403) return { ok: false, error: "Het uitlezen is tijdelijk niet beschikbaar. Vul de gegevens zelf in." };
      return { ok: false, error: "Het document kon niet worden gelezen. Probeer een duidelijkere foto of vul de gegevens zelf in." };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let text = "";
    let refused = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
          if (ev.type === "response.refusal.delta") refused = true;
        } catch {
          /* onvolledig frame negeren */
        }
      }
    }
    if (refused || !text) return { ok: false, error: "Het document kon niet worden gelezen. Vul de gegevens zelf in." };
    try {
      return { ok: true, data: JSON.parse(text) as EnergyBillData };
    } catch {
      return { ok: false, error: "Het document kon niet worden gelezen. Vul de gegevens zelf in." };
    }
  });
