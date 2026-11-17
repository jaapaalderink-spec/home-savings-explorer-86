/** Kalendermaand en contractdatum volgens de Nederlandse facturatieperiode. */
export function leadOverviewPeriod(now = new Date()) {
  const today = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const start = `${today.slice(0, 7)}-01`;
  const next = new Date(`${start}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { today, start, end: next.toISOString().slice(0, 10) };
}

/** Bundels vergroten alleen het overzicht van hun eigen kalendermaand. */
export function monthLeadLimit(
  base: number,
  bundles: ReadonlyArray<{ size: number; period_start: string }>,
  month: string,
) {
  return Math.max(base, 0) + bundles
    .filter((bundle) => bundle.period_start === month)
    .reduce((total, bundle) => total + bundle.size, 0);
}