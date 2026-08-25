import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCompany, joinCompany } from "@/lib/partner.functions";
import { CATEGORY_LABEL, PLANS } from "@/lib/lead-pricing";

const CATEGORY_IDS = ["solar", "heatpump", "battery", "ev", "ehms", "airco", "boiler"];

export function Onboarding() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"create" | "join">("create");
  const [name, setName] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [plan, setPlan] = useState<"starter" | "groei" | "premium">("starter");
  const [code, setCode] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["partner-context"] });

  const create = useMutation({
    mutationFn: () => createCompany({ data: { name, categories, plan } }),
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
    <div className="mx-auto max-w-xl rounded-3xl bg-background p-7" style={{ boxShadow: "var(--shadow-panel-lg)" }}>
      <h2 className="font-display text-xl font-bold text-ink">Aan de slag als partner</h2>
      <p className="mt-1 text-sm text-moss/70">
        Maak je bedrijf aan als eigenaar, of sluit je aan bij een bestaand bedrijf met de code van je
        eigenaar.
      </p>

      <div className="mt-5 flex gap-2 rounded-full bg-muted p-1 text-sm font-semibold">
        {(["create", "join"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 rounded-full px-3 py-1.5"
            style={{ backgroundColor: tab === t ? "#4f8f62" : "transparent", color: tab === t ? "white" : "#315642" }}
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
                      setCategories((prev) => (active ? prev.filter((c) => c !== id) : [...prev, id]))
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
            disabled={create.isPending || name.trim().length < 2 || categories.length === 0}
            className="w-full"
            style={{ backgroundColor: "#4f8f62", color: "white" }}
          >
            Bedrijf aanmaken
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Bedrijfscode</Label>
            <Input id="code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" />
          </div>
          <Button
            onClick={() => join.mutate()}
            disabled={join.isPending || code.trim().length < 4}
            className="w-full"
            style={{ backgroundColor: "#4f8f62", color: "white" }}
          >
            Aansluiten
          </Button>
        </div>
      )}
    </div>
  );
}
