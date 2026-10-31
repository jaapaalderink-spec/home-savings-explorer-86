import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readEnergyBill, type EnergyBillData } from "@/lib/energy-bill.functions";
import type { EnergyProfile } from "@/lib/home-savings/scenario";

const MAX = 10 * 1024 * 1024;
const TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

const ok = (n: number | null, max: number) => (n !== null && Number.isFinite(n) && n >= 0 && n <= max ? n : null);

/** Neemt alleen energievelden over in het profiel (geen persoonsgegevens). */
export function applyBillToProfile(p: EnergyProfile, d: EnergyBillData): EnergyProfile {
  const next: EnergyProfile = { ...p };
  const provided = new Set(p.provided);
  const put = <K extends keyof EnergyProfile>(k: K, v: EnergyProfile[K] | null) => {
    if (v === null) return;
    next[k] = v;
    provided.add(k);
  };
  put("consumption", ok(d.consumptionKwh, 100000));
  put("gas", ok(d.gasM3, 20000));
  put("electricityPrice", ok(d.electricityPricePerKwh, 2));
  put("gasPrice", ok(d.gasPricePerM3, 10));
  if (d.contractType) put("contractType", d.contractType);
  if (d.supplier) put("supplier", d.supplier.slice(0, 80));
  next.provided = [...provided];
  return next;
}

export function EnergyBillUpload({ onRead }: { onRead: (d: EnergyBillData) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const read = useServerFn(readEnergyBill);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handle = async (file: File | undefined) => {
    if (!file) return;
    setMsg(null);
    if (!(TYPES as readonly string[]).includes(file.type))
      return setMsg({ ok: false, text: "Kies een PDF, JPG of PNG." });
    if (file.size > MAX) return setMsg({ ok: false, text: "Het bestand is groter dan 10 MB." });
    setBusy(true);
    try {
      const base64 = await toBase64(file);
      const res = await read({
        data: { filename: file.name.slice(0, 200), mimeType: file.type as (typeof TYPES)[number], base64 },
      });
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      onRead(res.data);
      setMsg({ ok: true, text: "Gegevens overgenomen. Controleer ze hieronder en pas aan waar nodig." });
    } catch {
      setMsg({ ok: false, text: "Uploaden mislukt. Probeer het opnieuw of vul de gegevens zelf in." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-dashed border-border bg-muted/40 p-4">
      <p className="text-sm font-medium">Snel invullen met je jaaropgave</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Upload je jaarafrekening (PDF, JPG of PNG). We lezen je verbruik uit en verwijderen het bestand direct daarna.
      </p>
      <input
        ref={input}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <Button type="button" variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
        {busy ? "Bezig met uitlezen…" : "Jaaropgave uploaden"}
      </Button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
    </div>
  );
}
