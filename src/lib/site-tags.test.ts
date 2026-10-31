import { describe, expect, it } from "vitest";
import { normalizeTag } from "./site-tags";

describe("normalizeTag", () => {
  it("extracts the Search Console code from a pasted meta tag", () => {
    expect(normalizeTag("search_console_token", '<meta name="google-site-verification" content="abcDEF123_-xyz" />')).toBe("abcDEF123_-xyz");
  });
  it("uppercases and accepts a GA4 id", () => {
    expect(normalizeTag("ga_measurement_id", " g-ab12cd34 ")).toBe("G-AB12CD34");
  });
  it("empty means switched off", () => {
    expect(normalizeTag("gtm_container_id", "")).toBeNull();
  });
  it("rejects script injection", () => {
    expect(() => normalizeTag("ads_conversion_id", "AW-1');alert(1)//")).toThrow();
  });
});
