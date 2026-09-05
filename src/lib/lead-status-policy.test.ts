import { describe, expect, it } from "vitest";
import { allowedNextStatuses, checkStatusTransition } from "@/lib/lead-status-policy";

describe("statusovergangen", () => {
  it("dezelfde status is geen wijziging", () => {
    expect(checkStatusTransition("new", "new")).toEqual({ ok: true, changed: false });
  });

  it("de normale volgorde is toegestaan", () => {
    expect(checkStatusTransition("new", "contacted").ok).toBe(true);
    expect(checkStatusTransition("contacted", "quoted").ok).toBe(true);
    expect(checkStatusTransition("quoted", "won").ok).toBe(true);
  });

  it("een sprong overslaan mag een partner niet", () => {
    expect(checkStatusTransition("new", "won").ok).toBe(false);
    expect(checkStatusTransition("new", "quoted").ok).toBe(false);
  });

  it("een gewonnen lead is eindstation voor een partner", () => {
    expect(allowedNextStatuses("won")).toEqual([]);
    expect(checkStatusTransition("won", "lost").ok).toBe(false);
  });

  it("een verloren lead kan heropend worden", () => {
    expect(checkStatusTransition("lost", "contacted").ok).toBe(true);
  });

  it("beheer mag corrigeren", () => {
    expect(checkStatusTransition("won", "lost", true)).toEqual({ ok: true, changed: true });
    expect(allowedNextStatuses("won", true)).toHaveLength(4);
  });
});
