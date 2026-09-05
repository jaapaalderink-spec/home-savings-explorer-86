import { describe, expect, it } from "vitest";
import {
  NEUTRAL_SCORE,
  QUALITY_WARNING,
  computeQualityScore,
  fairnessBonus,
  rankEligibleCompaniesForLead,
  smooth,
  type QualityMetrics,
} from "@/lib/quality-policy";

const base: QualityMetrics = {
  companyId: "c",
  leadsTotal: 0,
  leadsSlaEligible: 0,
  openedCount: 0,
  contactedCount: 0,
  within24h: 0,
  within48h: 0,
  closedCount: 0,
  wonCount: 0,
  quotedPlusCount: 0,
  untouchedCount: 0,
  approvedComplaints: 0,
  recent7d: 0,
};

const metrics = (over: Partial<QualityMetrics>): QualityMetrics => ({ ...base, ...over });

describe("kwaliteitsscore", () => {
  it("nieuw bedrijf zonder historie start neutraal", () => {
    const s = computeQualityScore(metrics({}));
    expect(s.overall).toBe(NEUTRAL_SCORE);
    expect(s.sampleSize).toBe(0);
    expect(s.qualityWarning).toBe(false);
  });

  it("snel eerste contact verhoogt de reactiescore", () => {
    const fast = computeQualityScore(
      metrics({ leadsTotal: 20, leadsSlaEligible: 20, within24h: 20, within48h: 20, contactedCount: 20 }),
    );
    const slow = computeQualityScore(metrics({ leadsTotal: 20, leadsSlaEligible: 20 }));
    expect(fast.response).toBeGreaterThan(slow.response);
    expect(slow.response).toBeLessThan(NEUTRAL_SCORE);
  });

  it("onaangeraakte leads verlagen de opvolgscore", () => {
    const active = computeQualityScore(
      metrics({
        leadsTotal: 20,
        leadsSlaEligible: 20,
        openedCount: 20,
        contactedCount: 20,
        quotedPlusCount: 20,
        closedCount: 20,
        wonCount: 8,
      }),
    );
    const idle = computeQualityScore(
      metrics({ leadsTotal: 20, leadsSlaEligible: 20, untouchedCount: 20 }),
    );
    expect(active.engagement).toBeGreaterThan(idle.engagement);
    expect(idle.engagement).toBeLessThan(NEUTRAL_SCORE);
  });

  it("goedgekeurde reclamaties verlagen de score, afgewezen niet", () => {
    // afgewezen reclamaties komen niet in approvedComplaints terecht
    const clean = computeQualityScore(metrics({ leadsTotal: 40 }));
    const complained = computeQualityScore(metrics({ leadsTotal: 40, approvedComplaints: 8 }));
    expect(complained.complaint).toBeLessThan(clean.complaint);
    expect(clean.complaint).toBeGreaterThan(NEUTRAL_SCORE);
  });

  it("gewonnen leads verhogen de conversiescore en open leads tellen niet als verlies", () => {
    const won = computeQualityScore(metrics({ leadsTotal: 30, closedCount: 20, wonCount: 10 }));
    const lost = computeQualityScore(metrics({ leadsTotal: 30, closedCount: 20, wonCount: 0 }));
    const open = computeQualityScore(metrics({ leadsTotal: 30, closedCount: 0, wonCount: 0 }));
    expect(won.conversion).toBeGreaterThan(lost.conversion);
    expect(open.conversion).toBe(NEUTRAL_SCORE);
  });

  it("één gelukkige win geeft geen extreme score", () => {
    const lucky = computeQualityScore(metrics({ leadsTotal: 1, closedCount: 1, wonCount: 1 }));
    expect(lucky.conversion).toBeLessThan(70);
    expect(lucky.overall).toBeLessThan(65);
  });

  it("de score convergeert bij een grotere steekproef", () => {
    const small = computeQualityScore(metrics({ leadsTotal: 2, closedCount: 2, wonCount: 2 }));
    const large = computeQualityScore(metrics({ leadsTotal: 200, closedCount: 200, wonCount: 200 }));
    expect(large.conversion).toBeGreaterThan(small.conversion);
    expect(large.conversion).toBeGreaterThan(95);
  });

  it("afvlakking blijft neutraal zonder waarnemingen", () => {
    expect(smooth(100, 0, 10)).toBe(NEUTRAL_SCORE);
    expect(smooth(100, 10, 10)).toBe(75);
  });

  it("zet een kwaliteitswaarschuwing bij structureel zwakke prestaties", () => {
    const bad = computeQualityScore(
      metrics({ leadsTotal: 60, leadsSlaEligible: 60, untouchedCount: 60, approvedComplaints: 30 }),
    );
    expect(bad.overall).toBeLessThan(QUALITY_WARNING.threshold);
    expect(bad.qualityWarning).toBe(true);
  });
});

describe("ranking", () => {
  const noJitter = { jitter: () => 0 };

  it("hoge kwaliteit gaat voor lage kwaliteit bij gelijk volume", () => {
    const ranked = rankEligibleCompaniesForLead(
      [
        { companyId: "laag", overall: 30, sampleSize: 50, recent7d: 3 },
        { companyId: "hoog", overall: 85, sampleSize: 50, recent7d: 3 },
      ],
      noJitter,
    );
    expect(ranked[0]!.companyId).toBe("hoog");
  });

  it("eerlijkheid geeft een partner met weinig recente leads een bescheiden voorsprong", () => {
    const ranked = rankEligibleCompaniesForLead(
      [
        { companyId: "druk", overall: 70, sampleSize: 50, recent7d: 12 },
        { companyId: "rustig", overall: 62, sampleSize: 50, recent7d: 0 },
      ],
      noJitter,
    );
    expect(ranked[0]!.companyId).toBe("rustig");
    expect(fairnessBonus(0)).toBe(20);
    expect(fairnessBonus(12)).toBe(0);
  });

  it("eerlijkheid laat een structureel zwakke partner niet domineren", () => {
    const ranked = rankEligibleCompaniesForLead(
      [
        { companyId: "zwak", overall: 20, sampleSize: 2, recent7d: 0 },
        { companyId: "sterk", overall: 85, sampleSize: 200, recent7d: 9 },
      ],
      { jitter: () => 5 },
    );
    expect(ranked[0]!.companyId).toBe("sterk");
  });

  it("nieuw bedrijf krijgt een tijdelijke bonus en een neutrale basisscore", () => {
    const ranked = rankEligibleCompaniesForLead(
      [
        { companyId: "nieuw", overall: null, sampleSize: 0, recent7d: 0 },
        { companyId: "oud", overall: 52, sampleSize: 100, recent7d: 0 },
      ],
      noJitter,
    );
    expect(ranked[0]!.companyId).toBe("nieuw");
    expect(ranked.find((r) => r.companyId === "nieuw")!.quality).toBe(NEUTRAL_SCORE);
    expect(ranked.find((r) => r.companyId === "oud")!.newBoost).toBe(0);
  });

  it("rangschikt alleen de aangeleverde (geschikte) kandidaten", () => {
    const ranked = rankEligibleCompaniesForLead(
      [{ companyId: "a", overall: 50, sampleSize: 10, recent7d: 0 }],
      noJitter,
    );
    expect(ranked).toHaveLength(1);
    expect(ranked[0]!.companyId).toBe("a");
  });
});
