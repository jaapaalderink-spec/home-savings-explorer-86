/** Kalendermaanden sluiten uitsluitend volgens de Nederlandse tijdzone. */
export function amsterdamMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export function isBillingMonthClosed(year: number, month: number, now = new Date()) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 2025 || year > 2100 || month < 1 || month > 12) return false;
  const current = amsterdamMonth(now);
  return year * 12 + month < current.year * 12 + current.month;
}

export function lastClosedBillingMonth(now = new Date()) {
  const current = amsterdamMonth(now);
  return current.month === 1
    ? { year: current.year - 1, month: 12 }
    : { year: current.year, month: current.month - 1 };
}