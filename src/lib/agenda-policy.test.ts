import { describe, expect, it } from "vitest";
import { followUpReason, byPriorityThenAge, effectivePriority, workingHoursBetween, type FollowUpInput } from "./agenda-policy";

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

describe("48 werkuren escalatie", () => {
  const lead = { priority: "low" as const, status: "new", closed: false, hasPlannedAppointment: false };
  it("weekend telt niet mee: do 11:00 → ma 11:00 is precies 48u", () =>
    expect(workingHoursBetween(new Date("2026-11-05T10:00:00Z"), new Date("2026-11-09T10:00:00Z"))).toBe(48));
  it("vrijdag 15:00 is maandag 15:00 nog niet verhoogd", () =>
    expect(effectivePriority({ ...lead, createdAt: "2026-11-06T14:00:00Z" }, new Date("2026-11-09T14:00:00Z")).escalated).toBe(false));
  it("na 48 werkuren zonder contact wordt ook Laag naar Hoog gezet", () =>
    expect(effectivePriority({ ...lead, createdAt: "2026-11-06T14:00:00Z" }, new Date("2026-11-10T14:00:00Z"))).toEqual({ priority: "high", escalated: true }));
  it("gebeld lead wordt niet verhoogd", () =>
    expect(effectivePriority({ ...lead, status: "contacted", createdAt: "2026-11-02T08:00:00Z" }, new Date("2026-11-10T14:00:00Z")).escalated).toBe(false));
  it("geplande afspraak voorkomt verhoging", () =>
    expect(effectivePriority({ ...lead, hasPlannedAppointment: true, createdAt: "2026-11-02T08:00:00Z" }, new Date("2026-11-10T14:00:00Z")).escalated).toBe(false));
});
