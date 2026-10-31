export type PerfPurchase = {
  id: string;
  company_id: string;
  products: string[];
  contacted_within_48h: boolean | null;
};
export type PerfCrm = { purchase_id: string; category: string; status: string; won_amount_ex_vat: number | null };
export type PerfQuote = { purchase_id: string; category: string; amount_ex_vat: number; version: number };
export type PerfAppt = { purchase_id: string; category: string | null; status: string };

export type PerfRow = {
  company_id: string;
  leads: number;
  won: number;
  conversion: number;
  revenue: number;
  quotes: number;
  quoteValue: number;
  appointments: number;
  response48h: number;
};

/** Aggregates per company; `product` limits to that service ("all" = alles). */
export function aggregatePerformance(
  purchases: PerfPurchase[],
  crm: PerfCrm[],
  quotes: PerfQuote[],
  appts: PerfAppt[],
  product: string,
): PerfRow[] {
  const matchCat = (c: string | null) => product === "all" || c === product || c === null;
  const pList = purchases.filter((p) => product === "all" || p.products.includes(product));
  const byId = new Map(pList.map((p) => [p.id, p]));
  const rows = new Map<string, PerfRow & { _won: Set<string>; _contacted: number }>();
  for (const p of pList) {
    const r = rows.get(p.company_id) ?? {
      company_id: p.company_id, leads: 0, won: 0, conversion: 0, revenue: 0, quotes: 0,
      quoteValue: 0, appointments: 0, response48h: 0, _won: new Set<string>(), _contacted: 0,
    };
    r.leads++;
    if (p.contacted_within_48h) r._contacted++;
    rows.set(p.company_id, r);
  }
  for (const c of crm) {
    const p = byId.get(c.purchase_id);
    if (!p || c.status !== "won" || !(product === "all" || c.category === product)) continue;
    const r = rows.get(p.company_id)!;
    r._won.add(c.purchase_id);
    r.revenue += Number(c.won_amount_ex_vat ?? 0);
  }
  // latest quote version per purchase+category
  const latest = new Map<string, PerfQuote>();
  for (const q of quotes) {
    if (!byId.has(q.purchase_id) || !(product === "all" || q.category === product)) continue;
    const k = `${q.purchase_id}:${q.category}`;
    const cur = latest.get(k);
    if (!cur || q.version > cur.version) latest.set(k, q);
  }
  for (const q of latest.values()) {
    const r = rows.get(byId.get(q.purchase_id)!.company_id)!;
    r.quotes++;
    r.quoteValue += Number(q.amount_ex_vat);
  }
  for (const a of appts) {
    const p = byId.get(a.purchase_id);
    if (!p || a.status === "cancelled" || !matchCat(a.category)) continue;
    rows.get(p.company_id)!.appointments++;
  }
  return [...rows.values()].map(({ _won, _contacted, ...r }) => ({
    ...r,
    won: _won.size,
    conversion: r.leads ? Math.round((_won.size / r.leads) * 1000) / 10 : 0,
    response48h: r.leads ? Math.round((_contacted / r.leads) * 1000) / 10 : 0,
  }));
}
