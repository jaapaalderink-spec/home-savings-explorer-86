import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitLead } from "@/lib/leads.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";

export const Route = createFileRoute("/offerte")({
  head: () => ({
    meta: [
      { title: "Gratis offertes aanvragen — Onafhankelijke Offerte" },
      {
        name: "description",
        content:
          "Vul in 3 stappen je situatie in en ontvang gratis en vrijblijvend tot 3 offertes van gecontroleerde installateurs voor zonnepanelen, warmtepomp, thuisbatterij, laadpaal of airco.",
      },
      { property: "og:title", content: "Gratis offertes aanvragen — Onafhankelijke Offerte" },
      {
        property: "og:description",
        content: "In 3 stappen tot 3 offertes van gecontroleerde installateurs. Gratis en vrijblijvend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OffertePage,
});

const CATEGORY_IDS = ["solar", "heatpump", "battery", "ev", "airco"] as const;

const HOUSE_TYPES = ["rijtjeshuis", "hoekwoning", "vrijstaand", "appartement"];
const HEATING = ["gasketel", "hybride", "stadswarmte", "warmtepomp"];
const CONTRACTS = ["vast", "variabel", "dynamisch", "onbekend"];

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function num(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function OffertePage() {
  const navigate = useNavigate();
  const search = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => ({
    categories: (search.get("cats") ?? "")
      .split(",")
      .filter((c) => (CATEGORY_IDS as readonly string[]).includes(c)),
    postcode: "",
    houseNumber: "",
    city: "",
    houseType: search.get("houseType") ?? "rijtjeshuis",
    currentHeating: search.get("heating") ?? "gasketel",
    contractType: search.get("contract") ?? "onbekend",
    buildYear: num(search.get("buildYear"), 1990),
    annualConsumptionKwh: num(search.get("consumption"), 3500),
    annualFeedInKwh: num(search.get("feedin"), 0),
    panelCount: num(search.get("panels"), 0),
    evStatus: search.get("evStatus") ?? "",
    annualKm: num(search.get("evKm"), 0),
    aircoRooms: num(search.get("aircoRooms"), 0),
    
    batteryGoals: (search.get("batteryGoals") ?? "").split(",").filter(Boolean),
    estimatedSavings: num(search.get("total"), 0),
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  }));

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleCategory = (id: string) =>
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(id)
        ? prev.categories.filter((c) => c !== id)
        : [...prev.categories, id],
    }));

  const canContinue =
    step === 0
      ? form.categories.length > 0
      : step === 1
        ? /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/.test(form.postcode)
        : true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await submitLead({ data: form });
      navigate({ to: "/bedankt", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Verzenden mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh" style={{ backgroundColor: "var(--color-cloud)" }}>
      <header className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5">
        <Link to="/" className="font-display text-lg font-bold text-moss">
          Onafhankelijke Offerte
        </Link>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-moss">
          <ShieldCheck size={14} style={{ color: "#4f8f62" }} /> Gratis en vrijblijvend
        </span>
      </header>

      <div className="mx-auto max-w-3xl px-5 pb-20">
        <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
          Vraag gratis offertes aan
        </h1>
        <p className="mt-1.5 text-sm text-moss/75">
          Je aanvraag gaat naar maximaal 3 gecontroleerde installateurs. Je zit nergens aan vast.
        </p>

        {form.estimatedSavings > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-semibold text-leaf" style={{ boxShadow: "var(--shadow-panel)" }}>
            Geschat bespaarpotentieel: {formatEuro(form.estimatedSavings)} per jaar
          </p>
        )}

        {/* stappen-indicator */}
        <ol className="mt-6 flex items-center gap-2 text-xs font-medium text-moss/60">
          {["Maatregelen", "Je woning", "Contact"].map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: i <= step ? "#4f8f62" : "#dfe6e0",
                  color: i <= step ? "white" : "#315642",
                }}
              >
                {i < step ? <Check size={13} /> : i + 1}
              </span>
              <span className={i === step ? "text-ink" : undefined}>{label}</span>
              {i < 2 && <span className="h-px w-4 bg-moss/20" />}
            </li>
          ))}
        </ol>

        <form
          onSubmit={handleSubmit}
          className="mt-5 rounded-3xl bg-background p-6 sm:p-8"
          style={{ boxShadow: "var(--shadow-panel-lg)" }}
        >
          {step === 0 && (
            <fieldset>
              <legend className="text-sm font-semibold text-ink">Waarvoor wil je offertes?</legend>
              <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CATEGORY_IDS.map((id) => {
                  const active = form.categories.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleCategory(id)}
                      aria-pressed={active}
                      className="min-h-14 rounded-2xl border p-3 text-left text-sm font-semibold transition-colors"
                      style={{
                        borderColor: active ? "#4f8f62" : "#dfe6e0",
                        backgroundColor: active ? "#eaf3ed" : "transparent",
                        color: "#17211b",
                      }}
                    >
                      {CATEGORY_LABEL[id]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="postcode">Postcode</Label>
                <Input id="postcode" placeholder="1234 AB" value={form.postcode} onChange={(e) => set("postcode", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="huisnr">Huisnummer</Label>
                <Input id="huisnr" value={form.houseNumber} onChange={(e) => set("houseNumber", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Plaats</Label>
                <Input id="city" value={form.city} onChange={(e) => set("city", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="houseType">Woningtype</Label>
                <select id="houseType" className={selectClass} value={form.houseType} onChange={(e) => set("houseType", e.target.value)}>
                  {HOUSE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="heating">Huidige verwarming</Label>
                <select id="heating" className={selectClass} value={form.currentHeating} onChange={(e) => set("currentHeating", e.target.value)}>
                  {HEATING.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="contract">Energiecontract</Label>
                <select id="contract" className={selectClass} value={form.contractType} onChange={(e) => set("contractType", e.target.value)}>
                  {CONTRACTS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buildYear">Bouwjaar</Label>
                <Input id="buildYear" type="number" min={1850} max={2035} value={form.buildYear} onChange={(e) => set("buildYear", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="consumption">Stroomverbruik (kWh/jaar)</Label>
                <Input id="consumption" type="number" min={0} max={30000} value={form.annualConsumptionKwh} onChange={(e) => set("annualConsumptionKwh", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="panels">Aantal zonnepanelen (nu)</Label>
                <Input id="panels" type="number" min={0} max={60} value={form.panelCount} onChange={(e) => set("panelCount", Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="feedin">Teruglevering (kWh/jaar)</Label>
                <Input id="feedin" type="number" min={0} max={30000} value={form.annualFeedInKwh} onChange={(e) => set("annualFeedInKwh", Number(e.target.value))} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Voornaam</Label>
                <Input id="firstName" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Achternaam</Label>
                <Input id="lastName" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mailadres</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefoonnummer</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} required minLength={8} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Toelichting (optioneel)</Label>
                <Textarea id="notes" rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
              <p className="text-xs text-moss/60 sm:col-span-2">
                Door te verzenden mogen maximaal 3 gecontroleerde installateurs contact met je opnemen over
                deze aanvraag. Bedragen zijn indicatief en geen aanbod.
              </p>
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="text-moss"
            >
              <ArrowLeft size={16} className="mr-1.5" /> Terug
            </Button>

            {step < 2 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canContinue}
                style={{ backgroundColor: "#4f8f62", color: "white" }}
              >
                Volgende <ArrowRight size={16} className="ml-1.5" />
              </Button>
            ) : (
              <Button type="submit" disabled={busy} style={{ backgroundColor: "#4f8f62", color: "white" }}>
                {busy ? "Versturen…" : "Verstuur aanvraag"}
              </Button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-moss/70">
          Installateur? <Link to="/auth" className="font-semibold text-leaf hover:underline">Log in op het partnerdashboard</Link>
        </p>
      </div>
    </main>
  );
}
