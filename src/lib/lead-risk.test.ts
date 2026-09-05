import { describe, expect, it } from "vitest";
import {
  BLOCK_SCORE,
  DUPLICATE_WINDOW_DAYS,
  MAX_LEADS_PER_EMAIL,
  MAX_LEADS_PER_PHONE,
  NEUTRAL_CONFIRMATION,
  assessLeadRisk,
  houseNumberKey,
  normalizeEmail,
  postcodeKey,
  type LeadCandidate,
  type NewLead,
} from "@/lib/lead-risk-policy";

const NOW = new Date("2026-06-15T12:00:00Z");

const base: NewLead = {
  phone: "+31612345678",
  emailNormalized: "jan@example.com",
  postcodeKey: "1234AB",
  houseNumberKey: "12",
  categories: ["solar"],
};

function past(minutes: number) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function candidate(over: Partial<LeadCandidate> = {}): LeadCandidate {
  return {
    id: over.id ?? "lead-1",
    phone: base.phone,
    emailNormalized: base.emailNormalized,
    postcodeKey: base.postcodeKey,
    houseNumberKey: base.houseNumberKey,
    categories: ["solar"],
    createdAt: past(60),
    phoneVerified: true,
    ...over,
  };
}

describe("normalisatie", () => {
  it("e-mail wordt getrimd en kleingemaakt zonder providertrucs", () => {
    expect(normalizeEmail("  Jan.Test+Zon@Example.COM ")).toBe("jan.test+zon@example.com");
  });

  it("postcode en huisnummer worden vergelijkbare sleutels", () => {
    expect(postcodeKey(" 1234 ab ")).toBe("1234AB");
    expect(houseNumberKey(" 12 A ")).toBe("12a");
  });
});

describe("duplicaatdetectie", () => {
  it("zelfde geverifieerde nummer, adres en categorie binnen het venster is een duplicaat", () => {
    const r = assessLeadRisk({ lead: base, recent: [candidate()] }, NOW);
    expect(r.isDuplicate).toBe(true);
    expect(r.confidence).toBe("high");
    expect(r.matchedLeadId).toBe("lead-1");
    expect(r.reasons).toContain("identical_request");
    expect(r.score).toBeGreaterThanOrEqual(BLOCK_SCORE);
    expect(r.status).toBe("blocked");
    expect(r.allowSms).toBe(false);
  });

  it("dezelfde persoon met een ander product wordt niet geblokkeerd", () => {
    const r = assessLeadRisk(
      { lead: { ...base, categories: ["heatpump"] }, recent: [candidate()] },
      NOW,
    );
    expect(r.isDuplicate).toBe(false);
    expect(r.status).not.toBe("blocked");
    expect(r.reviewRequired).toBe(true); // wel opvallend: zelfde nummer + adres
    expect(r.allowSms).toBe(true);
  });

  it("buiten het venster van 30 dagen is een nieuwe aanvraag gewoon toegestaan", () => {
    const old = candidate({ createdAt: past((DUPLICATE_WINDOW_DAYS + 1) * 24 * 60) });
    const r = assessLeadRisk({ lead: base, recent: [old] }, NOW);
    expect(r.isDuplicate).toBe(false);
    expect(r.status).toBe("clean");
    expect(r.score).toBe(0);
    expect(r.allowSms).toBe(true);
  });

  it("een onbevestigde eerdere poging is geen hard duplicaat", () => {
    const r = assessLeadRisk({ lead: base, recent: [candidate({ phoneVerified: false })] }, NOW);
    expect(r.isDuplicate).toBe(false);
    expect(r.confidence).toBe("medium");
  });

  it("zonder huisnummer geldt een postcode niet als hetzelfde adres", () => {
    const r = assessLeadRisk(
      {
        lead: { ...base, houseNumberKey: "" },
        recent: [candidate({ houseNumberKey: "" })],
      },
      NOW,
    );
    expect(r.isDuplicate).toBe(false);
  });

  it("een ander adres met dezelfde achternaam levert geen signaal op", () => {
    const r = assessLeadRisk(
      {
        lead: base,
        recent: [
          candidate({
            id: "other",
            phone: "+31698765432",
            emailNormalized: "ander@example.com",
            houseNumberKey: "99",
          }),
        ],
      },
      NOW,
    );
    expect(r.reasons).toHaveLength(0);
    expect(r.status).toBe("clean");
  });
});

describe("snelheidslimieten", () => {
  it("te veel aanvragen van hetzelfde nummer binnen 24 uur wordt begrensd", () => {
    const recent = Array.from({ length: MAX_LEADS_PER_PHONE }, (_, i) =>
      candidate({
        id: `p${i}`,
        houseNumberKey: `${i + 20}`,
        categories: ["airco"],
        createdAt: past(30 * (i + 1)),
      }),
    );
    const r = assessLeadRisk({ lead: base, recent }, NOW);
    expect(r.reasons).toContain("submission_velocity");
    expect(r.status).toBe("blocked");
    expect(r.allowSms).toBe(false);
  });

  it("te veel aanvragen van hetzelfde e-mailadres binnen 24 uur wordt begrensd", () => {
    const recent = Array.from({ length: MAX_LEADS_PER_EMAIL }, (_, i) =>
      candidate({
        id: `e${i}`,
        phone: `+3161111111${i}`,
        houseNumberKey: `${i + 40}`,
        categories: ["airco"],
        createdAt: past(45 * (i + 1)),
      }),
    );
    const r = assessLeadRisk({ lead: base, recent }, NOW);
    expect(r.reasons).toContain("submission_velocity");
    expect(r.status).toBe("blocked");
  });

  it("twee aanvragen op één dag zijn nog gewoon toegestaan", () => {
    const recent = [
      candidate({ id: "a", houseNumberKey: "80", categories: ["airco"], createdAt: past(120) }),
    ];
    const r = assessLeadRisk({ lead: base, recent }, NOW);
    expect(r.status).toBe("clean");
    expect(r.allowSms).toBe(true);
  });

  it("herhaald mislukte verificaties verhogen de score", () => {
    const r = assessLeadRisk({ lead: base, recent: [], failedVerifications: 12 }, NOW);
    expect(r.reasons).toContain("verification_failures");
    expect(r.reviewRequired).toBe(false);
    expect(r.score).toBe(30);
  });
});

describe("sms-kosten", () => {
  it("een identieke inzending van minuten oud krijgt geen nieuwe code", () => {
    const r = assessLeadRisk({ lead: base, recent: [candidate({ createdAt: past(3) })] }, NOW);
    expect(r.allowSms).toBe(false);
  });
});

describe("consumentboodschap", () => {
  it("verklapt niets over opgeslagen gegevens", () => {
    const text = NEUTRAL_CONFIRMATION.toLowerCase();
    for (const leak of ["telefoonnummer", "e-mail", "bestaat", "dubbel", "geblokkeerd", "score"]) {
      expect(text).not.toContain(leak);
    }
  });
});
