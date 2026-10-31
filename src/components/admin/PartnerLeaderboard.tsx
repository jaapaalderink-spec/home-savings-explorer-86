/** Ranglijst best presterende partners met filters — alleen beheer. */
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDown, Trophy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getPartnerPerformanceLeaderboard } from "@/lib/partner-performance.functions";

type Period = "month" | "30d" | "90d" | "ytd" | "all";
type Product = "all" | "solar" | "heatpump" | "battery" | "ev" | "airco";
type SortKey = "conversion" | "revenue" | "quotes" | "appointments" | "response48h" | "leads" | "quality";

const eur = (v: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

const COLS: { key: SortKey; label: string }[] = [
  { key: "conversion", label: "Conversie" },
  { key: "revenue", label: "Omzet" },
  { key: "quotes", label: "Offertes" },
  { key: "appointments", label: "Afspraken" },
  { key: "response48h", label: "Binnen 48u" },
  { key: "leads", label: "Leads" },
  { key: "quality", label: "Kwaliteit" },
];

export function PartnerLeaderboard() {
  const [period, setPeriod] = useState<Period>("month");
  const [product, setProduct] = useState<Product>("all");
  const [minLeads, setMinLeads] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("conversion");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["partner-leaderboard", period, product],
    queryFn: () => getPartnerPerformanceLeaderboard({ data: { period, product } }),
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (data ?? [])
      .filter((r) => r.leads >= minLeads && (!s || r.name.toLowerCase().includes(s)))
      .sort((a, b) => (Number(b[sort] ?? -1) - Number(a[sort] ?? -1)) || b.leads - a.leads);
  }, [data, minLeads, search, sort]);

  const top = (k: SortKey) => [...rows].sort((a, b) => Number(b[k] ?? 0) - Number(a[k] ?? 0))[0]!;
  const highlights = rows.length
    ? [
        { label: "Beste conversie", r: top("conversion"), v: (r: (typeof rows)[0]) => `${r.conversion}%` },
        { label: "Meeste omzet", r: top("revenue"), v: (r: (typeof rows)[0]) => eur(r.revenue) },
        { label: "Snelste opvolger", r: top("response48h"), v: (r: (typeof rows)[0]) => `${r.response48h}% binnen 48u` },
      ]
    : [];

  return (
    <section className="rounded-3xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
      <h2 className="font-display text-lg font-bold text-ink">Best presterende partners</h2>
      <p className="text-sm text-moss/70">Filter op periode, dienst en volume; klik op een kolom om te sorteren.</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <select className={sel} value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          <option value="month">Deze maand</option>
          <option value="30d">Afgelopen 30 dagen</option>
          <option value="90d">Afgelopen 90 dagen</option>
          <option value="ytd">Dit jaar</option>
          <option value="all">Alles</option>
        </select>
        <select className={sel} value={product} onChange={(e) => setProduct(e.target.value as Product)}>
          <option value="all">Alle diensten</option>
          <option value="solar">Zonnepanelen</option>
          <option value="heatpump">Warmtepomp</option>
          <option value="battery">Thuisbatterij</option>
          <option value="ev">Laadpaal</option>
          <option value="airco">Airco</option>
        </select>
        <select className={sel} value={minLeads} onChange={(e) => setMinLeads(Number(e.target.value))}>
          <option value={1}>Alle partners</option>
          <option value={3}>Min. 3 leads</option>
          <option value={5}>Min. 5 leads</option>
          <option value={10}>Min. 10 leads</option>
        </select>
        <Input className="h-9 w-56" placeholder="Zoek bedrijf…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {highlights.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {highlights.map((h) => (
            <div key={h.label} className="rounded-2xl border border-moss/10 p-3">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-moss/60">
                <Trophy size={12} /> {h.label}
              </div>
              <div className="mt-1 font-semibold text-ink">{h.r.name}</div>
              <div className="text-sm text-moss">{h.v(h.r)}</div>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
      ) : isError ? (
        <p className="mt-4 text-sm text-destructive">Prestaties konden niet worden geladen.</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-moss/70">Geen partners met leads in deze selectie.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-moss/60">
                <th className="py-2">#</th>
                <th className="py-2">Partner</th>
                {COLS.map((c) => (
                  <th key={c.key} className="py-2">
                    <button type="button" onClick={() => setSort(c.key)} className={`inline-flex items-center gap-1 uppercase ${sort === c.key ? "font-bold text-ink" : ""}`}>
                      {c.label} {sort === c.key && <ArrowDown size={12} />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.company_id} className="border-t border-moss/10">
                  <td className="py-2 text-moss/60">{i + 1}</td>
                  <td className="py-2 pr-3 font-medium text-ink">{r.name}</td>
                  <td className="py-2 font-semibold text-ink">{r.conversion}% <span className="font-normal text-moss/60">({r.won})</span></td>
                  <td className="py-2 text-moss">{eur(r.revenue)}</td>
                  <td className="py-2 text-moss">{r.quotes} <span className="text-moss/60">· {eur(r.quoteValue)}</span></td>
                  <td className="py-2 text-moss">{r.appointments}</td>
                  <td className="py-2 text-moss">{r.response48h}%</td>
                  <td className="py-2 text-moss">{r.leads}</td>
                  <td className="py-2 text-moss">{r.quality ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
