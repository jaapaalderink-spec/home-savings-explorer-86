import { describe, expect, it } from "vitest";
import { followUpReason, byPriorityThenAge, type FollowUpInput } from "./agenda-policy";

const now = new Date("2026-11-10T12:00:00Z");
const base: FollowUpInput = {
  status: "contacted", closed: false, priority: "normal",
  createdAt: "2026-11-09T10:00:00Z", lastActivityAt: "2026-11-09T10:00:00Z",
  followUpDates: [], appointments: [],
};

describe("followUpReason", () => {
  it("new lead needs a call", () => expect(followUpReason({ ...base, status: "new" }, now)).toBe("not_contacted"));
  it("closed lead never needs follow-up", () => expect(followUpReason({ ...base, status: "new", closed: true }, now)).toBeNull());
  it("future appointment removes it from the list", () =>
    expect(followUpReason({ ...base, status: "new", appointments: [{ scheduledAt: "2026-11-12T09:00:00Z", status: "planned" }] }, now)).toBeNull());
  it("past planned appointment asks for outcome", () =>
    expect(followUpReason({ ...base, appointments: [{ scheduledAt: "2026-11-10T09:00:00Z", status: "planned" }] }, now)).toBe("appointment_overdue"));
  it("follow-up date today is due", () => expect(followUpReason({ ...base, followUpDates: ["2026-11-10"] }, now)).toBe("follow_up_due"));
  it("idle more than 5 days is stale", () => expect(followUpReason({ ...base, lastActivityAt: "2026-11-04T11:00:00Z" }, now)).toBe("stale"));
  it("idle 4 days is fine", () => expect(followUpReason({ ...base, lastActivityAt: "2026-11-06T12:00:00Z" }, now)).toBeNull());
});

it("high priority sorts first", () => {
  const list = [{ priority: "low" as const, createdAt: "1" }, { priority: "high" as const, createdAt: "2" }];
  expect(list.sort(byPriorityThenAge)[0]!.priority).toBe("high");
});
