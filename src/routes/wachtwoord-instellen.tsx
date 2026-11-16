import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/wachtwoord-instellen")({
  head: () => ({
    meta: [
      { title: "Wachtwoord instellen, Onafhankelijke Offerte" },
      { name: "description", content: "Stel je wachtwoord in voor het partnerportaal van Onafhankelijke Offerte." },
      { property: "og:title", content: "Wachtwoord instellen, Onafhankelijke Offerte" },
      { property: "og:description", content: "Activeer je partneraccount met een eigen wachtwoord." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    const t = setTimeout(check, 800);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 10) return toast.error("Kies een wachtwoord van minimaal 10 tekens.");
    if (pw !== pw2) return toast.error("De wachtwoorden komen niet overeen.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast.error("Wachtwoord instellen is mislukt. Kies een sterker wachtwoord.");
    toast.success("Je wachtwoord is ingesteld.");
    navigate({ to: "/dashboard" });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-display text-2xl font-bold text-ink">Wachtwoord instellen</h1>
      {ready === null ? (
        <p className="mt-4 text-sm text-moss/70">Even geduld…</p>
      ) : !ready ? (
        <p className="mt-4 text-sm text-moss/70">Deze link is verlopen of al gebruikt. Vraag een nieuwe uitnodiging aan.</p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pw">Nieuw wachtwoord</Label>
            <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw2">Herhaal wachtwoord</Label>
            <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy} className="w-full">Opslaan en naar mijn dashboard</Button>
        </form>
      )}
    </main>
  );
}
