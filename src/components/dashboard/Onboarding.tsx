import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCompany, joinCompany } from "@/lib/partner.functions";
import { CATEGORY_LABEL, PLANS } from "@/lib/lead-pricing";

const CATEGORY_IDS = ["solar", "heatpump", "battery", "ev", "airco", "boiler"];

export function Onboarding() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [kvk, setKvk] = useState("");
  const kvkClean = kvk.replace(/\s/g, "");
  const kvkValid = /^\d{8}$/.test(kvkClean);
  const [street, setStreet] = useState("");
  const [postcode, setPostcode] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const postcodeClean = postcode.replace(/\s/g, "").toUpperCase();
  const postcodeValid = /^\d{4}[A-Z]{2}$/.test(postcodeClean);
  const phoneValid = /^[+0-9][0-9 ()-]{8,18}$/.test(phone.trim());
  const addressValid = street.trim().length >= 3 && postcodeValid && city.trim().length >= 2;
  const [categories, setCategories] = useState<string[]>([]);
  const [plan, setPlan] = useState<"starter" | "groei" | "premium">("starter");
  const [code, setCode] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["partner-context"] });

  const create = useMutation({
    mutationFn: () => createCompany({ data: { name, kvkNumber: kvkClean, street, postcode: postcodeClean, city, phone, categories, plan } }),
    onSuccess: () => {
      toast.success("Bedrijf aangemaakt. Je bent nu eigenaar.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const join = useMutation({
    mutationFn: () => joinCompany({ data: { code } }),
    onSuccess: (res) => {
      toast.success(`Je bent toegevoegd aan ${res.companyName}.`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div
      className="mx-auto max-w-xl rounded-3xl bg-background p-7"
      style={{ boxShadow: "var(--shadow-panel-lg)" }}
    >
      <h2 className="font-display text-xl font-bold text-ink">Aan de slag als partner</h2>
      <p className="mt-1 text-sm text-moss/70">
        Maak je bedrijf aan als eigenaar. Werk je bij een bestaand bedrijf? Vraag de eigenaar dan om
        een persoonlijke uitnodiging per e-mail.
      </p>

      <div className="mt-5 flex gap-2 rounded-full bg-muted p-1 text-sm font-semibold">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 rounded-full px-3 py-1.5"
            style={{
              backgroundColor: tab === t ? "#4f8f62" : "transparent",
              color: tab === t ? "white" : "#315642",
            }}
          >
            {t === "create" ? "Bedrijf aanmaken" : "Aansluiten met code"}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company">Bedrijfsnaam</Label>
            <Input id="company" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kvk">KvK-nummer</Label>
            <Input
              id="kvk"
              inputMode="numeric"
              maxLength={10}
              placeholder="8 cijfers"
              value={kvk}
              onChange={(e) => setKvk(e.target.value)}
              aria-invalid={kvk.length > 0 && !kvkValid}
            />
            {kvk.length > 0 && !kvkValid ? (
              <p className="text-xs text-destructive">Een KvK-nummer bestaat uit 8 cijfers.</p>
            ) : (
              <p className="text-xs text-moss/60">We controleren dit nummer in het handelsregister voordat je account wordt goedgekeurd.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="street">Straat en huisnummer</Label>
            <Input id="street" autoComplete="street-address" value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div className="space-y-1.5">
              <Label htmlFor="postcode">Postcode</Label>
              <Input id="postcode" autoComplete="postal-code" placeholder="1234 AB" maxLength={7} value={postcode} onChange={(e) => setPostcode(e.target.value)} aria-invalid={postcode.length > 0 && !postcodeValid} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">Plaats</Label>
              <Input id="city" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          {postcode.length > 0 && !postcodeValid && (
            <p className="text-xs text-destructive">Vul een postcode in als 1234 AB.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="phone">Telefoonnummer</Label>
            <Input id="phone" type="tel" autoComplete="tel" placeholder="06 12345678" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={phone.length > 0 && !phoneValid} />
            {phone.length > 0 && !phoneValid && (
              <p className="text-xs text-destructive">Vul een geldig telefoonnummer in.</p>
            )}
          </div>

          <div>
            <Label>Waarin ben je actief?</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORY_IDS.map((id) => {
                const active = categories.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setCategories((prev) =>
                        active ? prev.filter((c) => c !== id) : [...prev, id],
                      )
                    }
                    className="rounded-full border px-3 py-1.5 text-sm font-medium"
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
          </div>

          <div>
            <Label>Abonnement</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {PLANS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlan(p.id)}
                  className="rounded-2xl border p-3 text-left"
                  style={{
                    borderColor: plan === p.id ? "#4f8f62" : "#dfe6e0",
                    backgroundColor: plan === p.id ? "#eaf3ed" : "transparent",
                  }}
                >
                  <span className="block text-sm font-bold text-ink">{p.name}</span>
                  <span className="block text-xs text-moss/70">{p.leads} leads p/m</span>
                  <span className="block text-sm font-semibold text-leaf">€ {p.price}/mnd</span>
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || name.trim().length < 2 || categories.length === 0 || !kvkValid || !addressValid || !phoneValid}
            className="w-full"
            style={{ backgroundColor: "#4f8f62", color: "white" }}
          >
            Bedrijf aanmaken
          </Button>
        </div>
      ) : (
        <p className="mt-5 rounded-xl bg-muted p-4 text-sm text-moss/80">
          Aansluiten bij een bestaand bedrijf gaat via een persoonlijke uitnodiging. Vraag de
          eigenaar om je uit te nodigen via Team in het dashboard en open daarna de link die je
          krijgt.
        </p>
      )}
    </div>
  );
}
