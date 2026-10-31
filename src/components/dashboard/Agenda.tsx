import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Download, MapPin, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getAgenda } from "@/lib/agenda.functions";
import { KIND_LABEL, PRIORITY_LABEL, REASON_LABEL } from "@/lib/agenda-policy";
import { PRIORITY_CLASS } from "@/components/dashboard/LeadPlanner";

type Appt = Awaited<ReturnType<typeof getAgenda>>["appointments"][number];

function downloadIcs(a: Appt) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(a.scheduledAt);
  const end = new Date(start.getTime() + 60 * 60000);
  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Onafhankelijke Offerte//NL", "BEGIN:VEVENT",
    `UID:${a.id}@onafhankelijke-offerte.nl`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`${KIND_LABEL[a.kind]} – ${a.name}`)}`, `LOCATION:${esc(a.address)}`,
    `DESCRIPTION:${esc(`Tel: ${a.phone}${a.note ? `\n${a.note}` : ""}`)}`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const link = document.createElement("a");
  link.href = url; link.download = "afspraak.ics"; link.click();
  URL.revokeObjectURL(url);
}

function bucket(iso: string) {
  const d = new Date(iso); const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(d) - day(now)) / 86400000;
  if (diff <= 0) return "Vandaag";
  if (diff < 7) return "Deze week";
  return "Later";
}

export function Agenda({ onOpenLeads }: { onOpenLeads: () => void }) {
  const load = useServerFn(getAgenda);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["agenda"], queryFn: () => load() });
  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (error) return <div role="alert" className="text-sm text-moss">Agenda laden is mislukt. <Button size="sm" variant="outline" onClick={() => refetch()}>Opnieuw</Button></div>;
  const panel = "rounded-2xl bg-background p-5";
  const groups = ["Vandaag", "Deze week", "Later"].map((g) => [g, (data?.appointments ?? []).filter((a) => bucket(a.scheduledAt) === g)] as const);

  return (
    <div className="space-y-4">
      <section className={panel} style={{ boxShadow: "var(--shadow-panel)" }}>
        <h2 className="font-display text-lg font-bold text-ink">Opvolging vereist ({data?.followUps.length ?? 0})</h2>
        <p className="text-xs text-moss/70">Blijft hier staan tot er iets met de lead gebeurt: bellen, status bijwerken of een afspraak plannen.</p>
        {data?.followUps.length === 0 ? <p className="mt-3 text-sm text-moss/70">Alles is opgevolgd.</p> : (
          <ul className="mt-3 divide-y divide-moss/10">
            {data?.followUps.map((f) => (
              <li key={f.purchaseId} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLASS[f.priority]}`}>{PRIORITY_LABEL[f.priority]}</span>
                <span className="font-semibold text-ink">{f.name}</span>
                <span className="text-xs text-moss/70">{f.address}</span>
                <span className="text-xs font-semibold text-moss">· {REASON_LABEL[f.reason]}</span>
                <span className="ml-auto flex gap-2">
                  <a href={`tel:${f.phone}`} className="inline-flex items-center gap-1 text-xs font-semibold text-leaf"><Phone size={12} />Bellen</a>
                  <Button size="sm" variant="outline" onClick={onOpenLeads}>Naar lead</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={panel} style={{ boxShadow: "var(--shadow-panel)" }}>
        <h2 className="font-display text-lg font-bold text-ink">Geplande afspraken</h2>
        {data?.appointments.length === 0 && <p className="mt-3 text-sm text-moss/70">Nog geen afspraken gepland. Plan er een via Mijn leads.</p>}
        {groups.map(([label, list]) => list.length > 0 && (
          <div key={label} className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-moss/60">{label}</h3>
            <ul className="mt-1 divide-y divide-moss/10">
              {list.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="w-36 font-semibold text-ink">{new Date(a.scheduledAt).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="font-semibold text-ink">{a.name}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-moss/70"><MapPin size={12} />{a.address}</span>
                  <span className="text-xs text-moss/70">· {KIND_LABEL[a.kind]}</span>
                  {a.priority !== "normal" && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_CLASS[a.priority]}`}>{PRIORITY_LABEL[a.priority]}</span>}
                  <span className="ml-auto flex gap-2">
                    <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-xs font-semibold text-leaf"><Phone size={12} />Bellen</a>
                    <Button size="sm" variant="ghost" onClick={() => downloadIcs(a)}><Download size={14} className="mr-1" />In mijn agenda</Button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
