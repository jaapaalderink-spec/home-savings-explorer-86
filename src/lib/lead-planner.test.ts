import { describe, expect, it } from "vitest";
import { planAllocation, type PlanCandidate } from "./lead-planner";

const c = (id: string, products: string[], remainingShare = 1, rank = 0): PlanCandidate => ({
  companyId: id,
  products,
  remainingShare,
  rank,
});

describe("planAllocation", () => {
  it("nooit meer dan 4 bedrijven, ook als er meer plekken gevraagd worden", () => {
    const plan = planAllocation(
      ["solar"],
      9,
      ["a", "b", "c", "d", "e", "f"].map((i) => c(i, ["solar"])),
    );
    expect(plan).toHaveLength(4);
  });

  it("één toewijzing per bedrijf met gebundelde producten", () => {
    const plan = planAllocation(["solar", "battery"], 2, [c("a", ["solar", "battery"])]);
    expect(plan).toEqual([{ companyId: "a", products: ["battery", "solar"] }]);
  });

  it("dekt eerst alle producten voordat het eerlijkheid laat meewegen", () => {
    const plan = planAllocation(["solar", "heatpump"], 2, [
      c("solarA", ["solar"], 1, 0),
      c("solarB", ["solar"], 1, 1),
      c("heat", ["heatpump"], 0.1, 5),
    ]);
    expect(plan.map((p) => p.companyId).sort()).toEqual(["heat", "solarA"]);
  });

  it("verdeelt daarna op resterend quotum", () => {
    const plan = planAllocation(["solar"], 2, [
      c("vol", ["solar"], 0.1, 0),
      c("ruim", ["solar"], 0.9, 3),
      c("half", ["solar"], 0.5, 1),
    ]);
    expect(plan.map((p) => p.companyId)).toEqual(["ruim", "half"]);
  });

  it("slaat bedrijven zonder quotum of zonder passend product over", () => {
    const plan = planAllocation(["solar"], 4, [c("leeg", ["solar"], 0), c("anders", ["airco"])]);
    expect(plan).toEqual([]);
  });

  it("houdt rekening met al afgedekte producten bij een herpoging", () => {
    const plan = planAllocation(
      ["solar", "ev"],
      1,
      [c("s", ["solar"], 1, 0), c("e", ["ev"], 0.2, 9)],
      ["solar"],
    );
    expect(plan.map((p) => p.companyId)).toEqual(["e"]);
  });
});
