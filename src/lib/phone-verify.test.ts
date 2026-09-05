import { describe, expect, it } from "vitest";
import { normalizeDutchMobile, maskPhone } from "@/lib/phone";
import {
  MAX_ATTEMPTS,
  MAX_SENDS_PER_HOUR,
  checkChallenge,
  checkSendAllowed,
} from "@/lib/phone-verify-policy";
import { generateCode, hashCode, hashesMatch } from "@/lib/phone-verify.server";

const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 1000).toISOString();

describe("telefoonnummer normaliseren", () => {
  it("accepteert Nederlandse mobiele nummers in alle notaties", () => {
    expect(normalizeDutchMobile("0612345678")).toBe("+31612345678");
    expect(normalizeDutchMobile("0031612345678")).toBe("+31612345678");
    expect(normalizeDutchMobile("+31612345678")).toBe("+31612345678");
    expect(normalizeDutchMobile("06 12 34 56 78")).toBe("+31612345678");
    expect(normalizeDutchMobile("06-12345678")).toBe("+31612345678");
    expect(normalizeDutchMobile("31612345678")).toBe("+31612345678");
  });

  it("weigert ongeldige of niet-mobiele nummers", () => {
    expect(normalizeDutchMobile("0201234567")).toBeNull(); // vast nummer
    expect(normalizeDutchMobile("061234567")).toBeNull(); // te kort
    expect(normalizeDutchMobile("06123456789")).toBeNull(); // te lang
    expect(normalizeDutchMobile("+49612345678")).toBeNull(); // buitenland
    expect(normalizeDutchMobile("abcdefghij")).toBeNull();
    expect(normalizeDutchMobile("")).toBeNull();
  });

  it("maskeert het nummer voor weergave", () => {
    expect(maskPhone("+31612345678")).toMatch(/5678$/);
    expect(maskPhone("+31612345678")).not.toContain("31612");
  });
});

describe("challenge-regels", () => {
  it("laat een geldige challenge door", () => {
    expect(
      checkChallenge({ expiresAt: future, attempts: 1, verifiedAt: null, consumedAt: null }),
    ).toBeNull();
  });

  it("weigert een verlopen code", () => {
    expect(
      checkChallenge({ expiresAt: past, attempts: 0, verifiedAt: null, consumedAt: null }),
    ).toBe("EXPIRED");
  });

  it("weigert na het maximale aantal pogingen (zesde poging kan niet slagen)", () => {
    expect(
      checkChallenge({
        expiresAt: future,
        attempts: MAX_ATTEMPTS,
        verifiedAt: null,
        consumedAt: null,
      }),
    ).toBe("TOO_MANY_ATTEMPTS");
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it("weigert hergebruik van een gebruikte code", () => {
    expect(
      checkChallenge({
        expiresAt: future,
        attempts: 0,
        verifiedAt: new Date().toISOString(),
        consumedAt: null,
      }),
    ).toBe("ALREADY_USED");
    expect(
      checkChallenge({
        expiresAt: future,
        attempts: 0,
        verifiedAt: null,
        consumedAt: new Date().toISOString(),
      }),
    ).toBe("ALREADY_USED");
  });
});

describe("verzendlimieten", () => {
  it("staat een eerste verzending toe", () => {
    expect(checkSendAllowed({ sendsLastHour: 0, lastSentAt: null })).toBeNull();
  });

  it("blokkeert te veel sms'jes per uur", () => {
    expect(checkSendAllowed({ sendsLastHour: MAX_SENDS_PER_HOUR, lastSentAt: null })).toBe(
      "SEND_LIMIT_REACHED",
    );
  });

  it("blokkeert direct opnieuw versturen", () => {
    expect(checkSendAllowed({ sendsLastHour: 1, lastSentAt: new Date().toISOString() })).toBe(
      "RESEND_TOO_SOON",
    );
  });

  it("staat opnieuw versturen toe na de wachttijd", () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    expect(checkSendAllowed({ sendsLastHour: 1, lastSentAt: twoMinutesAgo })).toBeNull();
  });
});

describe("code en hash", () => {
  it("genereert een code van zes cijfers", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("hasht gebonden aan challenge en nummer en vergelijkt veilig", () => {
    const id = "11111111-1111-1111-1111-111111111111";
    const phone = "+31612345678";
    const hash = hashCode(id, phone, "123456");
    expect(hash).not.toContain("123456");
    expect(hashesMatch(hash, hashCode(id, phone, "123456"))).toBe(true);
    expect(hashesMatch(hash, hashCode(id, phone, "123457"))).toBe(false);
    expect(hashesMatch(hash, hashCode(id, "+31600000000", "123456"))).toBe(false);
    expect(
      hashesMatch(hash, hashCode("22222222-2222-2222-2222-222222222222", phone, "123456")),
    ).toBe(false);
  });
});
