import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { needsAnswer, onConsentChange, readChoice, saveChoices, type Purpose } from "@/lib/consent";

const PURPOSES: Purpose[] = ["analytics", "advertising"];
const OPEN_EVENT = "open-cookie-settings";

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [gpc, setGpc] = useState(false);
  const [sw, setSw] = useState<Record<Purpose, boolean>>({ analytics: false, advertising: false });
  const ref = useRef<HTMLDivElement>(null);

  const syncSwitches = () =>
    setSw({ analytics: readChoice("analytics") === "granted", advertising: readChoice("advertising") === "granted" });

  useEffect(() => {
    setGpc((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true);
    void needsAnswer(PURPOSES).then((n) => n && setOpen(true));
    const onOpen = () => {
      syncSwitches();
      setSettings(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    const off = onConsentChange(syncSwitches);
    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      off();
    };
  }, []);

  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open, settings]);

  if (!open) return null;

  const all = (choice: "granted" | "denied") => {
    saveChoices({ analytics: choice, advertising: choice });
    setOpen(false);
    setSettings(false);
  };
  const save = () => {
    saveChoices({
      analytics: sw.analytics ? "granted" : "denied",
      advertising: sw.advertising ? "granted" : "denied",
    });
    setOpen(false);
    setSettings(false);
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="region"
      aria-label="Cookiemelding"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-border bg-background p-5 text-sm shadow-lg outline-none sm:inset-x-auto sm:right-4"
    >
      <p className="font-display text-base font-bold text-ink">Jouw privacy</p>
      <p className="mt-1 text-moss/80">
        We tellen bezoeken zonder cookies. Als je accepteert, meten we ook klikken en zetten we cookies voor statistieken
        en advertenties. Lees meer in onze{" "}
        <Link to="/privacy" className="underline">privacyverklaring</Link>.
      </p>

      {settings && (
        <div className="mt-4 space-y-3">
          {gpc && (
            <p className="rounded-lg bg-muted p-2 text-xs text-moss/80">
              Je browser stuurt een privacysignaal (Global Privacy Control). Daarom staan statistieken en advertenties uit.
            </p>
          )}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-ink">Noodzakelijk</p>
              <p className="text-xs text-moss/70">Nodig om de site en het inloggen te laten werken. Altijd aan.</p>
            </div>
          </div>
          {([
            ["analytics", "Statistieken, geleverd door Lovable en Google", "Inzicht in hoe de site wordt gebruikt."],
            ["advertising", "Advertenties, geleverd door Google", "Meten van advertentieresultaten."],
          ] as const).map(([p, title, desc]) => (
            <label key={p} className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-semibold text-ink">{title}</span>
                <span className="block text-xs text-moss/70">{desc}</span>
              </span>
              <Switch
                checked={!gpc && sw[p]}
                disabled={gpc}
                onCheckedChange={(v) => setSw((s) => ({ ...s, [p]: v }))}
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="flex-1" onClick={() => all("granted")}>Alles accepteren</Button>
        <Button className="flex-1" onClick={() => all("denied")}>Alles weigeren</Button>
        {settings ? (
          <Button variant="outline" className="w-full" onClick={save}>Keuze opslaan</Button>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => { syncSwitches(); setSettings(true); }}>
            Cookie-instellingen
          </Button>
        )}
      </div>
    </div>
  );
}
