/** Regels voor openstaande facturen: herinnering na 14 dagen, pauze bij 2 vervallen facturen. */
export const REMINDER_AFTER_DAYS = 14;
export const SUSPEND_AT_OVERDUE_INVOICES = 2;

const DAY = 86_400_000;
const dayStart = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");

export interface InvoiceAge {
  daysOpen: number;
  daysOverdue: number;
  reminderAllowed: boolean;
}

/** Leeftijd vanaf factuurdatum; herinnering mag zodra 14 dagen verstreken zijn en de factuur onbetaald is. */
export function invoiceAge(issuedAt: string, dueDate: string, today: string, paid: boolean): InvoiceAge {
  const t = dayStart(today);
  const daysOpen = Math.max(0, Math.round((t - dayStart(issuedAt)) / DAY));
  const daysOverdue = Math.max(0, Math.round((t - dayStart(dueDate)) / DAY));
  return { daysOpen, daysOverdue, reminderAllowed: !paid && daysOpen >= REMINDER_AFTER_DAYS };
}

export const shouldSuspend = (overdueUnpaid: number) => overdueUnpaid >= SUSPEND_AT_OVERDUE_INVOICES;
