import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCrmStats } from "@/lib/crm.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";
import type { ProductStats } from "@/lib/crm-policy";

export const PERIODS = [30, 90, 365] as const;

/** Tabel met resultaten per product; ook gebruikt in de beheer-voorbeeldweergave. */
export function StatsTable({ products }: { products: ProductStats[] }) {
  if (products.length === 0) return <p className="text-sm text-moss/70">Geen aanvragen in deze periode.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-moss/70">
          <tr>
            {["Product", "Ontvangen", "Gebeld", "Offerte", "Gewonnen", "Verloren", "Open", "Conversie", "Slagingskans", "Gewonnen waarde"].map((h) => (
              <th key={h} className="px-2 py-1 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.category} className="border-t border-moss/10">
              <td className="px-2 py-1.5 font-semibold text-ink">{CATEGORY_LABEL[p.category] ?? p.category}</td>
              <td className="px-2">{p.received}</td>
              <td className="px-2">{p.contacted}</td>
              <td className="px-2">{p.quoted}</td>
              <td className="px-2">{p.won}</td>
              <td className="px-2">{p.lost}</td>
              <td className="px-2">{p.open}</td>
              <td className="px-2 font-bold text-leaf">{p.conversion}%</td>
              <td className="px-2">{p.winRate}%</td>
              <td className="px-2">{formatEuro(p.wonValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const CONVERSION_NOTE =
  "Productconversie = gewonnen ÷ ontvangen productonderdelen in het instroomcohort. Sluitingspercentage = gewonnen ÷ (gewonnen + verloren). Gewonnen waarde = geregistreerde actuele winst, excl. btw; historische onbekende bedragen tellen niet mee.";

export function CrmStats({ members, fixedMember }: { members?: { id: string; name: string }[] | undefined; fixedMember?: string | null | undefined } = {}) {
  const [days, setDays] = useState<number>(90);
  const [category, setCategory] = useState("");
  const [picked, setPicked] = useState("");
  const memberId = fixedMember ?? picked;
  const { data, isLoading } = useQuery({
    queryKey: ["crm-stats", days, category, memberId],
    queryFn: () => getCrmStats({ data: { days, ...(category ? { category } : {}), ...(memberId ? { memberId } : {}) } }),
  });

  return (
    <section className="rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold text-ink">Resultaten per product</h2>
        <div className="flex flex-wrap gap-2">
          {members && members.length > 1 && !fixedMember && (
            <select aria-label="Medewerker" value={picked} onChange={(e) => setPicked(e.target.value)} className="min-h-9 rounded-full border border-moss/20 bg-background px-3 text-xs font-semibold text-moss">
              <option value="">Heel het bedrijf</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="min-h-9 rounded-full border border-moss/20 bg-background px-3 text-xs font-semibold text-moss">
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                Laatste {d} dagen
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="min-h-9 rounded-full border border-moss/20 bg-background px-3 text-xs font-semibold text-moss">
            <option value="">Alle producten</option>
            {["solar", "heatpump", "battery", "ev", "airco"].map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3">{isLoading ? <p className="text-sm text-moss/60">Laden…</p> : <StatsTable products={data?.products ?? []} />}</div>
      <p className="mt-3 text-xs text-moss/60">{CONVERSION_NOTE}</p>
    </section>
  );
}
