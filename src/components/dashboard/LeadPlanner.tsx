import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAppointments, scheduleAppointment, setLeadPriority, updateAppointment } from "@/lib/agenda.functions";
import { APPOINTMENT_KINDS, KIND_LABEL, PRIORITIES, PRIORITY_LABEL, type AppointmentKind, type Priority } from "@/lib/agenda-policy";

const input =
  "min-h-9 rounded-lg border border-moss/20 bg-background px-2 text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf";

export const PRIORITY_CLASS: Record<Priority, string> = {
  high: "bg-destructive/15 text-destructive",
  normal: "bg-muted text-moss",
  low: "bg-secondary text-moss/70",
};

export function invalidateAgenda(qc: ReturnType<typeof useQueryClient>, purchaseId: string) {
  qc.invalidateQueries({ queryKey: ["appointments", purchaseId] });
  qc.invalidateQueries({ queryKey: ["agenda"] });
}

/** Prioriteit + afspraak plannen per lead. */
export function LeadPlanner({ purchaseId }: { purchaseId: string }) {
  const qc = useQueryClient();
  const load = useServerFn(listAppointments);
  const schedule = useServerFn(scheduleAppointment);
  const update = useServerFn(updateAppointment);
  const prio = useServerFn(setLeadPriority);
  const { data } = useQuery({ queryKey: ["appointments", purchaseId], queryFn: () => load({ data: { purchaseId } }) });
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [kind, setKind] = useState<AppointmentKind>("onsite");
  const [note, setNote] = useState("");
  const done = () => invalidateAgenda(qc, purchaseId);

  const setPrio = useMutation({
    mutationFn: (priority: Priority) => prio({ data: { purchaseId, priority } }),
    onSuccess: () => { done(); qc.invalidateQueries({ queryKey: ["my-leads"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: () => schedule({ data: { purchaseId, scheduledAt: new Date(`${date}T${time}`).toISOString(), kind, ...(note ? { note } : {}) } }),
    onSuccess: () => { toast.success("Afspraak ingepland"); setOpen(false); setNote(""); setDate(""); done(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const change = useMutation({
    mutationFn: (v: { id: string; status: "done" | "cancelled" }) => update({ data: { purchaseId, ...v } }),
    onSuccess: done,
    onError: (e: Error) => toast.error(e.message),
  });

  const planned = (data?.appointments ?? []).filter((a) => a.status === "planned");
  return (
    <div className="space-y-2 rounded-xl bg-muted/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-moss/70">
          Prioriteit
          <select className={input} value={data?.priority ?? "normal"} disabled={setPrio.isPending} onChange={(e) => setPrio.mutate(e.target.value as Priority)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </label>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => setOpen((o) => !o)}>
          <CalendarPlus size={14} className="mr-1.5" /> Afspraak plannen
        </Button>
      </div>

      {planned.map((a) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 text-xs text-moss">
          <span className="rounded-full bg-leaf/15 px-2 py-0.5 font-semibold text-leaf">Afspraak gepland</span>
          <span>{new Date(a.scheduledAt).toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" })}</span>
          <span className="text-moss/70">· {KIND_LABEL[a.kind]}</span>
          {a.note && <span className="text-moss/70">· {a.note}</span>}
          <span className="ml-auto flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => change.mutate({ id: a.id, status: "done" })}><Check size={14} className="mr-1" />Gehouden</Button>
            <Button size="sm" variant="ghost" onClick={() => change.mutate({ id: a.id, status: "cancelled" })}><X size={14} className="mr-1" />Annuleren</Button>
          </span>
        </div>
      ))}

      {open && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-moss/70">Datum<input type="date" className={input} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-moss/70">Tijd<input type="time" className={input} value={time} onChange={(e) => setTime(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs text-moss/70">Soort
            <select className={input} value={kind} onChange={(e) => setKind(e.target.value as AppointmentKind)}>
              {APPOINTMENT_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-moss/70">Notitie<input className={input} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <Button size="sm" disabled={!date || !time || add.isPending} onClick={() => add.mutate()}>Inplannen</Button>
        </div>
      )}
    </div>
  );
}
