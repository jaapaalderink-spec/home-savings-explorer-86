import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Stage = "loading" | "enroll" | "verify" | "ok";

/** Platformbeheer is alleen bereikbaar na tweestapsverificatie (authenticator-app). */
export function AdminMfaGate({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");

  async function switchAccount() {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return void (window.location.href = "/auth");
      setEmail(u.user.email ?? "");
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id);
      if (!rErr && !(roles ?? []).some((r) => r.role === "admin")) {
        return void (window.location.href = "/dashboard");
      }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return setStage("ok");
      const { data: f } = await supabase.auth.mfa.listFactors();
      const verified = f?.totp?.find((x) => x.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        return setStage("verify");
      }
      for (const x of f?.all ?? []) {
        if (x.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: x.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error || !data) return setError("Tweestapsverificatie kon niet worden gestart.");
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStage("enroll");
    })();
  }, []);

  async function submit() {
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) return setError("Onjuiste code. Probeer het opnieuw.");
    window.location.reload();
  }

  if (stage === "ok") return <>{children}</>;
  return (
    <main className="grid min-h-dvh place-items-center px-5" style={{ backgroundColor: "var(--color-cloud)" }}>
      <section className="w-full max-w-sm space-y-4 rounded-2xl bg-background p-6" style={{ boxShadow: "var(--shadow-panel)" }}>
        <h1 className="font-display text-xl font-bold text-ink">Tweestapsverificatie</h1>
        {email && (
          <div className="rounded-lg border border-border p-3 text-sm">
            <p className="text-moss/70">Ingelogd als</p>
            <p className="break-all font-semibold text-ink">{email}</p>
            <button type="button" onClick={switchAccount} className="mt-1 text-xs underline text-moss/70">
              Ander account gebruiken
            </button>
          </div>
        )}
        {stage === "loading" && <p className="text-sm text-moss/70">Controleren…</p>}
        {stage === "enroll" && (
          <>
            <p className="text-sm text-moss/70">
              Scan deze code met een authenticator-app (bijv. Google Authenticator) en vul de 6 cijfers in.
            </p>
            {qr && <img src={qr} alt="QR-code voor authenticator-app" className="mx-auto h-44 w-44" />}
            <p className="break-all text-center text-xs text-moss/60">{secret}</p>
          </>
        )}
        {stage === "verify" && (
          <p className="text-sm text-moss/70">Vul de code uit je authenticator-app in.</p>
        )}
        {(stage === "enroll" || stage === "verify") && (
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Code</Label>
            <Input id="mfa-code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
            <Button className="w-full" disabled={busy || code.trim().length !== 6} onClick={submit}>
              Bevestigen
            </Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>
    </main>
  );
}
