import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Mail, Phone, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { listAllLeads } from "@/lib/admin.functions";
import { CATEGORIES, CATEGORY_LABEL, LEAD_TYPE_LABEL } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";
import type { LeadFilters } from "@/components/admin/filters";
import { RISK_LABEL, RISK_SIGNAL_LABEL, STATE_LABEL } from "@/components/admin/filters";

export function AdminLeadsTable({ filters }: { filters: LeadFilters }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-leads", filters, search],
    queryFn: () =>
      listAllLeads({
        data: {
          ...(filters.category ? { category: filters.category } : {}),
          ...(filters.state ? { state: filters.state } : {}),
          ...(filters.days ? { days: filters.days } : {}),
          ...(filters.risk ? { risk: filters.risk } : {}),
          ...(search.trim().length > 1 ? { search: search.trim() } : {}),
          limit: 150,
        },
      }),
  });

  return (
    <div className="space-y-3">
      <label
        className="flex items-center gap-2 rounded-2xl bg-background px-4"
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <Search size={15} className="text-moss/60" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op postcode, plaats, e-mail of achternaam"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
      </label>

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : error ? (
        <p
          className="rounded-2xl bg-background p-6 text-sm text-moss/70"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          Alleen platformbeheerders zien alle aanvragen.
        </p>
      ) : !data || data.length === 0 ? (
        <p
          className="rounded-2xl bg-background p-6 text-sm text-moss/70"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          Geen aanvragen gevonden met deze filters.
        </p>
      ) : (
        <div
          className="overflow-x-auto rounded-2xl bg-background"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-moss/60">
              <tr>
                <th className="p-4">Datum</th>
                <th className="p-4">Regio</th>
                <th className="p-4">Categorieën</th>
                <th className="p-4">Type</th>
                <th className="p-4">Status</th>
                <th className="p-4">Partners</th>
                <th className="p-4">Potentieel</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <Fragment key={l.id}>
                  <tr key={l.id} className="border-t border-moss/10">
                    <td className="p-4 whitespace-nowrap text-moss/80">
                      {new Date(l.createdAt).toLocaleDateString("nl-NL")}
                    </td>
                    <td className="p-4">
                      <span className="font-semibold text-ink">{l.postcode}</span>
                      <span className="block text-xs text-moss/60">
                        {l.city || l.region || "—"}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="flex flex-wrap gap-1">
                        {l.categories.map((c) => (
                          <span
                            key={c}
                            className="rounded-full px-2 py-0.5 text-xs font-semibold text-moss"
                            style={{ backgroundColor: "#f7e3bd" }}
                          >
                            {CATEGORY_LABEL[c] ?? c}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-moss/80">
                      {LEAD_TYPE_LABEL[l.leadType as "shared_2"] ?? l.leadType}
                    </td>
                    <td
                      className="p-4 text-xs font-semibold"
                      style={{ color: l.state === "underfilled" ? "#b4720f" : "#315642" }}
                    >
                      {STATE_LABEL[l.state] ?? l.state}
                    </td>
                    <td className="p-4 text-moss/80">
                      {l.partners.length}/{l.maxPartners}
                    </td>
                    <td className="p-4 font-semibold text-leaf">
                      {formatEuro(l.savings)}/jr
                      {l.fraudStatus !== "clean" || l.duplicateOfLeadId ? (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: l.fraudStatus === "blocked" ? "#f8d7d7" : "#f7e3bd",
                            color: l.fraudStatus === "blocked" ? "#8d2020" : "#7a5410",
                          }}
                        >
                          {l.duplicateOfLeadId
                            ? RISK_LABEL["duplicate"]
                            : (RISK_LABEL[l.fraudStatus] ?? RISK_LABEL["review"])}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        aria-label="Details tonen"
                        onClick={() => setOpen(open === l.id ? null : l.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
                      >
                        <ChevronDown
                          size={16}
                          className="text-moss transition-transform"
                          style={{ transform: open === l.id ? "rotate(180deg)" : "none" }}
                        />
                      </button>
                    </td>
                  </tr>
                  {open === l.id && (
                    <tr key={`${l.id}-detail`} className="border-t border-moss/10 bg-muted/40">
                      <td colSpan={8} className="p-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1 text-xs text-moss/80">
                            <p className="text-sm font-bold text-ink">{l.name}</p>
                            <p className="inline-flex items-center gap-1.5">
                              <Mail size={12} /> {l.email}
                            </p>
                            <p className="inline-flex items-center gap-1.5">
                              <Phone size={12} /> {l.phone}
                            </p>
                            <p>
                              {l.houseType ?? "woning onbekend"} · {l.consumption ?? "?"} kWh/jaar ·
                              contract {l.contractType ?? "onbekend"}
                            </p>
                          </div>
                          <div className="space-y-1 text-xs text-moss/80">
                            <p className="font-semibold text-ink">Kwaliteitscontrole</p>
                            <p>
                              Status {RISK_LABEL[l.fraudStatus] ?? "Schoon"} · risicoscore{" "}
                              {l.fraudScore}/100
                              {l.reviewRequired ? " · handmatig bekijken" : ""}
                            </p>
                            {l.duplicateOfLeadId ? (
                              <p>Dubbel van aanvraag {l.duplicateOfLeadId.slice(0, 8)}</p>
                            ) : null}
                            {l.riskReasons.length > 0 ? (
                              <p>
                                Signalen:{" "}
                                {l.riskReasons.map((r) => RISK_SIGNAL_LABEL[r] ?? r).join(", ")}
                              </p>
                            ) : null}
                            <p className="pt-2 font-semibold text-ink">Verdeeld naar</p>
                            {l.partners.length === 0 ? (
                              <p className="mt-1">Nog geen partner — staat in de leadmarkt.</p>
                            ) : (
                              <ul className="mt-1 space-y-0.5">
                                {l.partners.map((p, i) => (
                                  <li key={`${p.company}-${i}`}>
                                    {p.company} — {p.status}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-moss/60">
        Categorieën: {CATEGORIES.map((c) => CATEGORY_LABEL[c]).join(" · ")}. Contactgegevens zijn
        alleen zichtbaar voor platformbeheerders.
      </p>
    </div>
  );
}
