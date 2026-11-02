/** Browserzijde: opent een afdrukbare factuur (Opslaan als PDF via het printvenster). */
type Line = { description: string; quantity: number; unit_price_ex_vat: number; amount_ex_vat: number };

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const eur = (n: unknown) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(Number(n ?? 0));
const date = (d: unknown) => (d ? new Date(String(d)).toLocaleDateString("nl-NL") : "…");

export function printInvoice(i: Record<string, unknown>) {
  const company = (i["company"] ?? {}) as { name?: string; address?: string | null; vat_number?: string | null };
  const lines = ((i["lines"] ?? []) as Line[])
    .map(
      (l) =>
        `<tr><td>${esc(l.description)}</td><td class="r">${Number(l.quantity)}</td><td class="r">${eur(l.unit_price_ex_vat)}</td><td class="r">${eur(l.amount_ex_vat)}</td></tr>`,
    )
    .join("");
  const credit = Number(i["credit_applied_inc_vat"] ?? 0);
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Factuur ${esc(i["invoice_number"])}</title>
<style>
@page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#1e293b;font-size:13px}
h1{font-size:22px;margin:0 0 4px}.muted{color:#64748b}.grid{display:flex;justify-content:space-between;margin:24px 0}
table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:left}
th{font-size:11px;text-transform:uppercase;color:#64748b}.r{text-align:right}.tot td{border:none;padding:4px 6px}
.big td{font-weight:bold;font-size:15px}tr{break-inside:avoid}
</style></head><body>
<h1>Factuur ${esc(i["invoice_number"])}</h1><div class="muted">Onafhankelijke Offerte</div>
<div class="grid"><div><strong>Aan</strong><br>${esc(company.name)}<br>${esc(company.address ?? "")}${company.vat_number ? `<br>Btw: ${esc(company.vat_number)}` : ""}</div>
<div class="r">Periode: ${date(i["period_start"])} tot ${date(i["period_end"])}<br>Vervaldatum: ${date(i["due_date"])}<br>Status: ${esc(i["payment_status"] ?? "open")}</div></div>
<table><thead><tr><th>Omschrijving</th><th class="r">Aantal</th><th class="r">Prijs</th><th class="r">Bedrag</th></tr></thead><tbody>${lines}</tbody></table>
<table class="tot"><tr><td class="r">Subtotaal excl. btw</td><td class="r" style="width:120px">${eur(i["subtotal_ex_vat"])}</td></tr>
<tr><td class="r">Btw 21%</td><td class="r">${eur(i["vat_amount"])}</td></tr>
<tr><td class="r">Totaal incl. btw</td><td class="r">${eur(i["total_inc_vat"])}</td></tr>
${credit > 0 ? `<tr><td class="r">Verrekend tegoed</td><td class="r">−${eur(credit)}</td></tr>` : ""}
<tr class="big"><td class="r">Te betalen</td><td class="r">${eur(i["amount_due_inc_vat"] ?? i["total_inc_vat"])}</td></tr></table>
<script>window.onload=()=>window.print()</script></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
