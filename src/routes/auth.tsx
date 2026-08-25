import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Partner inloggen — Onafhankelijke Offerte" },
      {
        name: "description",
        content:
          "Log in op het partnerdashboard van Onafhankelijke Offerte om leads in te kopen en je team te beheren.",
      },
      { property: "og:title", content: "Partner inloggen — Onafhankelijke Offerte" },
      {
        property: "og:description",
        content: "Toegang tot de leadmarkt, je eigen leads en het teamoverzicht.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("Check je e-mail om je account te bevestigen.");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Inloggen mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google inloggen is niet gelukt.");
      return;
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12" style={{ backgroundColor: "var(--color-cloud)" }}>
      <div className="w-full max-w-md rounded-3xl bg-background p-7" style={{ boxShadow: "var(--shadow-panel-lg)" }}>
        <Link to="/" className="font-display text-lg font-bold text-moss">
          Onafhankelijke Offerte
        </Link>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">
          {mode === "login" ? "Inloggen als partner" : "Partneraccount aanmaken"}
        </h1>
        <p className="mt-1 text-sm text-moss/70">
          Koop leads in, volg je pipeline en beheer je account managers.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Naam</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mailadres</Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Wachtwoord</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full" style={{ backgroundColor: "#4f8f62", color: "white" }}>
            {mode === "login" ? "Inloggen" : "Account aanmaken"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-moss/50">
          <span className="h-px flex-1 bg-moss/15" /> of <span className="h-px flex-1 bg-moss/15" />
        </div>

        <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
          Verder met Google
        </Button>

        <p className="mt-5 text-center text-sm text-moss/70">
          {mode === "login" ? "Nog geen account?" : "Heb je al een account?"}{" "}
          <button
            type="button"
            className="font-semibold text-leaf underline-offset-2 hover:underline"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Registreren" : "Inloggen"}
          </button>
        </p>
      </div>
    </main>
  );
}
