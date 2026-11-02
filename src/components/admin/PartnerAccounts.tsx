import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  approvePartner,
  completePriceReview,
  listPartnerAccounts,
  listPriceReviews,
  setPartnerClosed,
} from "@/lib/partner-admin.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";
import { PACKAGES, SELECTABLE_PACKAGES, type BillingMode, type PackageCode } from "@/lib/package-policy";
import { CustomPricingFields, defaultPricing, pricingPayload, type PricingState } from "@/components/admin/CustomPricingFields";

const panel = { boxShadow: "var(--shadow-panel)" };
const fmt = (d: string) => new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });

type Accounts = Awaited<ReturnType<typeof listPartnerAccounts>>;
type Company = Accounts["companies"][number];
type Review = Awaited<ReturnType<typeof listPriceReviews>>[number];

function downloadReviewIcs(r: Review) {
  const day = r.review_date.replace(/-/g, "");
  const v = r.subscription_versions;
  const desc = [
    `Tariefreview ${r.companies?.name ?? ""}`,
    v ? `Huidig: abonnement ${formatEuro(Number(v.platform_fee_ex_vat))}, extra accountmanager ${formatEuro(Number(v.seat_fee_ex_vat))}, lead ${formatEuro(Number(v.base_lead_price_ex_vat))} + ${formatEuro(Number(v.extra_product_price_ex_vat))} per extra product` : "",
    r.note ?? "",
  ].filter(Boolean).join("\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Onafhankelijke Offerte//NL", "BEGIN:VEVENT",
    `UID:review-${r.id}@onafhankelijke-offerte.nl`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day}`,
    `SUMMARY:Tariefreview ${r.companies?.name ?? ""}`,
    `DESCRIPTION:${desc}`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `tariefreview-${r.review_date}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export function PartnerAccounts() {
  const [view, setView] = useState<"pending" | "approved" | "closed">("pending");
  const { data, isLoading } = useQuery({ queryKey: ["partner-accounts"], queryFn: () => listPartnerAccounts() });
  const list = (data?.companies ?? []).filter((c) => c.approval_status === view);
  const count = (s: string) => (data?.companies ?? []).filter((c) => c.approval_status === s).length;

  return (
    <div className="space-y-4">
      <PriceReviews />
      <section className="rounded-2xl bg-background p-5" style={panel}>
        <div className="flex flex-wrap gap-2">
          {([["pending", "Nieuwe aanmeldingen"], ["approved", "Actief"], ["closed", "Gesloten"]] as const).map(([id, label]) => (
            <Button key={id} size="sm" variant={view === id ? "default" : "outline"} onClick={() => setView(id)}>
              {label} ({count(id)})
            </Button>
          ))}
        </div>
        {isLoading ? (
          <p className="mt-4 text-sm text-moss/70">Laden…</p>
        ) : list.length === 0 ? (
          <p className="mt-4 text-sm text-moss/70">Geen bedrijven in deze lijst.</p>
        ) : (
          <ul className="mt-4 divide-y divide-moss/10">
            {list.map((c) => (
              <PartnerRow key={c.id} c={c} months={[data!.currentMonth, data!.nextMonth]} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PartnerRow({ c, months }: { c: Company; months: string[] }) {
  const [open, setOpen] = useState<"approve" | "close" | null>(null);
  const qc = useQueryClient();
  const reopen = useMutation({
    mutationFn: () => setPartnerClosed({ data: { companyId: c.id, close: false } }),
    onSuccess: () => { toast.success("Account heropend."); qc.invalidateQueries({ queryKey: ["partner-accounts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <li className="py-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">{c.name}</p>
          <p className="text-moss/70">
            {c.owner?.name ?? "—"} · {c.owner?.email ?? c.contact_email ?? "geen e-mail"}
            {(c.owner?.phone ?? c.contact_phone) ? ` · ${c.owner?.phone ?? c.contact_phone}` : ""}
          </p>
          <p className="text-moss/60">
            Aangemeld {fmt(c.created_at)} · {c.categories.map((k) => CATEGORY_LABEL[k] ?? k).join(", ")}
          </p>
          {c.approval_status === "closed" && (
            <p className="text-moss/60">Gesloten {c.closed_at ? fmt(c.closed_at) : ""}: {c.closed_reason}</p>
          )}
        </div>
        <div className="flex gap-2">
          {c.approval_status === "pending" && (
            <Button size="sm" onClick={() => setOpen(open === "approve" ? null : "approve")}>Goedkeuren & abonnement instellen</Button>
          )}
          {c.approval_status !== "closed" && (
            <Button size="sm" variant="outline" onClick={() => setOpen(open === "close" ? null : "close")}>Account sluiten</Button>
          )}
          {c.approval_status === "closed" && (
            <Button size="sm" variant="outline" disabled={reopen.isPending} onClick={() => reopen.mutate()}>Heropenen</Button>
          )}
        </div>
      </div>
      {open === "approve" && <ApproveForm c={c} months={months} onDone={() => setOpen(null)} />}
      {open === "close" && <CloseForm c={c} onDone={() => setOpen(null)} />}
    </li>
  );
}

function ApproveForm({ c, months, onDone }: { c: Company; months: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [pkg, setPkg] = useState<PackageCode>("start");
  const [mode, setMode] = useState<BillingMode>("actual_delivered");
  const [seats, setSeats] = useState(0);
  const [validFrom, setValidFrom] = useState(months[1]);
  const [note, setNote] = useState("");
  const [pricing, setPricing] = useState<PricingState>(defaultPricing);
  const save = useMutation({
    mutationFn: () =>
      approvePartner({
        data: { companyId: c.id, packageCode: pkg, billingMode: mode, paidSeats: seats, validFrom, ...(note ? { note } : {}), ...pricingPayload(pricing) },
      }),
    onSuccess: () => {
      toast.success(`${c.name} is goedgekeurd.`);
      qc.invalidateQueries({ queryKey: ["partner-accounts"] });
      qc.invalidateQueries({ queryKey: ["price-reviews"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-3 rounded-xl bg-muted p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={`a-pkg-${c.id}`}>Pakket</Label>
          <select id={`a-pkg-${c.id}`} value={pkg} onChange={(e) => setPkg(e.target.value as PackageCode)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {SELECTABLE_PACKAGES.map((k) => (
              <option key={k} value={k}>{PACKAGES[k].label}, {PACKAGES[k].leads} leads</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`a-mode-${c.id}`}>Facturatie</Label>
          <select id={`a-mode-${c.id}`} value={mode} onChange={(e) => setMode(e.target.value as BillingMode)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="actual_delivered">Werkelijk geleverde leads</option>
            <option value="fixed_package">Vast pakketbedrag</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`a-seats-${c.id}`}>Extra accountmanagers</Label>
          <Input id={`a-seats-${c.id}`} type="number" min={0} value={seats} onChange={(e) => setSeats(Number(e.target.value))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`a-from-${c.id}`}>Ingangsdatum</Label>
          <select id={`a-from-${c.id}`} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {months.map((m, i) => <option key={m} value={m}>{fmt(m)}{i === 0 ? " (deze maand)" : ""}</option>)}
          </select>
        </div>
      </div>
      <CustomPricingFields value={pricing} onChange={setPricing} />
      <div className="mt-3 space-y-1.5">
        <Label htmlFor={`a-note-${c.id}`}>Notitie {pricing.enabled ? "(verplicht bij maatwerk)" : "(optioneel)"}</Label>
        <Input id={`a-note-${c.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button className="mt-3" disabled={save.isPending} onClick={() => save.mutate()}>Goedkeuren en activeren</Button>
    </div>
  );
}

function CloseForm({ c, onDone }: { c: Company; onDone: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => setPartnerClosed({ data: { companyId: c.id, close: true, reason } }),
    onSuccess: () => {
      toast.success("Account gesloten. Er worden geen nieuwe aanvragen meer toegewezen.");
      qc.invalidateQueries({ queryKey: ["partner-accounts"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mt-3 rounded-xl bg-muted p-4">
      <Label htmlFor={`close-${c.id}`}>Reden van sluiten</Label>
      <Input id={`close-${c.id}`} className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Bijv. opzegging, wanbetaling, kwaliteit" />
      <p className="mt-2 text-xs text-moss/60">Facturen en historie blijven bewaard. Het account kan later worden heropend.</p>
      <Button className="mt-3" variant="destructive" disabled={save.isPending || reason.trim().length < 3} onClick={() => save.mutate()}>Account sluiten</Button>
    </div>
  );
}

function PriceReviews() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["price-reviews"], queryFn: () => listPriceReviews() });
  const done = useMutation({
    mutationFn: (id: string) => completePriceReview({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["price-reviews"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const open = (data ?? []).filter((r) => r.status === "open");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="rounded-2xl bg-background p-5" style={panel}>
      <h3 className="font-display text-lg font-bold text-ink">Tariefreviews</h3>
      {open.length === 0 ? (
        <p className="mt-1 text-sm text-moss/70">Geen geplande reviews. Stel een reviewdatum in bij maatwerktarieven.</p>
      ) : (
        <ul className="mt-2 divide-y divide-moss/10 text-sm">
          {open.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                <strong className="text-ink">{r.companies?.name}</strong> · {fmt(r.review_date)}
                {r.review_date <= today && <span className="ml-2 rounded-full bg-destructive/15 px-2 text-xs text-destructive">nu bespreken</span>}
                {r.note && <span className="block text-moss/70">{r.note}</span>}
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => downloadReviewIcs(r)}><Download size={14} className="mr-1" />In mijn agenda</Button>
                <Button size="sm" variant="outline" disabled={done.isPending} onClick={() => done.mutate(r.id)}>Afgerond</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
