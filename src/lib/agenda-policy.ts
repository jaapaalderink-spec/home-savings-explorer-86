/** Zuivere regels voor agenda, prioriteit en "opvolging vereist". */
export const PRIORITIES = ["high", "normal", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { high: "Hoog", normal: "Normaal", low: "Laag" };
const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export const APPOINTMENT_KINDS = ["onsite", "phone", "video"] as const;
export type AppointmentKind = (typeof APPOINTMENT_KINDS)[number];
export const KIND_LABEL: Record<AppointmentKind, string> = {
  onsite: "Adviesgesprek op locatie",
  phone: "Telefonisch",
  video: "Videogesprek",
};

/** Dagen zonder update waarna een gebelde/geofferte lead opvolging nodig heeft. */
export const STALE_DAYS = 5;

export type FollowUpInput = {
  status: string; // dossierstatus
  closed: boolean;
  priority: Priority;
  createdAt: string;
  lastActivityAt: string;
  followUpDates: Array<string | null>;
  appointments: Array<{ scheduledAt: string; status: "planned" | "done" | "cancelled" }>;
};

export type FollowUpReason = "appointment_overdue" | "follow_up_due" | "not_contacted" | "stale";
export const REASON_LABEL: Record<FollowUpReason, string> = {
  appointment_overdue: "Afspraak geweest — uitkomst vastleggen",
  follow_up_due: "Vervolgdatum bereikt",
  not_contacted: "Nog niet gebeld",
  stale: `Langer dan ${STALE_DAYS} dagen geen actie`,
};

/** Geeft de reden terug waarom een lead opvolging nodig heeft, of null. Blijft staan tot er iets gebeurt. */
export function followUpReason(i: FollowUpInput, now: Date): FollowUpReason | null {
  if (i.closed) return null;
  const planned = i.appointments.filter((a) => a.status === "planned");
  if (planned.some((a) => new Date(a.scheduledAt) <= now)) return "appointment_overdue";
  if (planned.some((a) => new Date(a.scheduledAt) > now)) return null; // er staat iets gepland
  const today = now.toISOString().slice(0, 10);
  if (i.followUpDates.some((d) => d != null && d <= today)) return "follow_up_due";
  if (i.status === "new") return "not_contacted";
  const idle = (now.getTime() - new Date(i.lastActivityAt).getTime()) / 86400000;
  if (idle > STALE_DAYS) return "stale";
  return null;
}

export function byPriorityThenAge<T extends { priority: Priority; createdAt: string }>(a: T, b: T) {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt);
}

/** Na zoveel werkuren (ma–vr, Europe/Amsterdam) zonder contact wordt een lead automatisch Hoog. */
export const ESCALATE_WORK_HOURS = 48;
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", weekday: "short" });
const isWeekend = (d: Date) => { const w = weekdayFmt.format(d); return w === "Sat" || w === "Sun"; };

/** Verstreken uren tussen from en to, waarbij zaterdag en zondag (Amsterdamse tijd) niet meetellen. */
export function workingHoursBetween(from: Date, to: Date): number {
  const step = 15 * 60000; // kwartierresolutie
  let ms = 0;
  for (let t = from.getTime(); t < to.getTime(); t += step) {
    const slice = Math.min(step, to.getTime() - t);
    if (!isWeekend(new Date(t))) ms += slice;
    if (ms >= 1000 * 3600 * 24 * 30) break;
  }
  return ms / 3600000;
}

/** Nog geen contact (status Nieuw, niets gepland) en ≥ 48 werkuren oud → Hoog, ook als handmatig lager gezet. */
export function effectivePriority(i: { priority: Priority; status: string; closed: boolean; createdAt: string; hasPlannedAppointment: boolean }, now: Date): { priority: Priority; escalated: boolean } {
  if (!i.closed && i.status === "new" && !i.hasPlannedAppointment && i.priority !== "high"
    && workingHoursBetween(new Date(i.createdAt), now) >= ESCALATE_WORK_HOURS) return { priority: "high", escalated: true };
  return { priority: i.priority, escalated: false };
}
