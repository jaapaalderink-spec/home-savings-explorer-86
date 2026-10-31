import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PACKAGE_EXTRA_PRODUCT_PRICE, PACKAGE_LEAD_PRICE, PACKAGE_PLATFORM_FEE, SEAT_FEE } from "@/lib/package-policy";

export type PricingState = {
  enabled: boolean;
  platformFee: number;
  seatFee: number;
  leadPrice: number;
  extraProductPrice: number;
  reviewDate: string;
  reviewNote: string;
};

export const defaultPricing = (): PricingState => ({
  enabled: false,
  platformFee: PACKAGE_PLATFORM_FEE,
  seatFee: SEAT_FEE,
  leadPrice: PACKAGE_LEAD_PRICE,
  extraProductPrice: PACKAGE_EXTRA_PRODUCT_PRICE,
  reviewDate: "",
  reviewNote: "",
});

const inMonths = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

/** Payload-deel voor contractversies; leeg als er geen maatwerk is. */
export function pricingPayload(p: PricingState) {
  if (!p.enabled) return {};
  return {
    customPrices: {
      platformFee: p.platformFee,
      seatFee: p.seatFee,
      leadPrice: p.leadPrice,
      extraProductPrice: p.extraProductPrice,
    },
    ...(p.reviewDate ? { reviewDate: p.reviewDate } : {}),
    ...(p.reviewNote ? { reviewNote: p.reviewNote } : {}),
  };
}

export function CustomPricingFields({ value, onChange }: { value: PricingState; onChange: (v: PricingState) => void }) {
  const set = (patch: Partial<PricingState>) => onChange({ ...value, ...patch });
  const num = (k: "platformFee" | "seatFee" | "leadPrice" | "extraProductPrice", label: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`cp-${k}`}>{label}</Label>
      <Input id={`cp-${k}`} type="number" min={0} step="0.01" value={value[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} />
    </div>
  );
  return (
    <div className="mt-4 rounded-xl border border-moss/15 p-4">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink">
        <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Aangepaste tarieven (maatwerk)
      </label>
      {value.enabled && (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {num("platformFee", "Abonnement p/m (€)")}
            {num("seatFee", "Extra accountmanager p/m (€)")}
            {num("leadPrice", "Leadprijs 1e product (€)")}
            {num("extraProductPrice", "Extra product (€)")}
          </div>
          <p className="mt-2 text-xs text-moss/60">Bedragen excl. btw. Vul in de notitie in waarom en met wie dit is afgesproken (verplicht).</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div className="space-y-1.5">
              <Label htmlFor="cp-review">Tarief herbeoordelen op</Label>
              <Input id="cp-review" type="date" value={value.reviewDate} onChange={(e) => set({ reviewDate: e.target.value })} />
              <div className="flex gap-1 text-xs">
                {[3, 6, 12].map((m) => (
                  <button key={m} type="button" className="rounded-full bg-muted px-2 py-0.5" onClick={() => set({ reviewDate: inMonths(m) })}>
                    over {m} mnd
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-rnote">Gespreksonderwerp review (optioneel)</Label>
              <Input id="cp-rnote" value={value.reviewNote} onChange={(e) => set({ reviewNote: e.target.value })} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
