import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, MapPin, Users, Filter, X, Search, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { listMarketplace, purchaseLead } from "@/lib/partner.functions";
import { CATEGORY_LABEL, CATEGORIES } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";

const SORTS = [
  { id: "recent", label: "Nieuwste" },
  { id: "savings", label: "Bespaarpotentieel" },
  { id: "price", label: "Prijs" },
  { id: "slots", label: "Meeste plekken" },
] as const;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={
        active
          ? { backgroundColor: "#315642", borderColor: "#315642", color: "white" }
          : { backgroundColor: "transparent", borderColor: "#dfe6e0", color: "#315642" }
      }
    >
      {children}
    </button>
  );
}

export function Marketplace({ remaining }: { remaining: number }) {
  const queryClient = useQueryClient();
  const [regions, setRegions] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [includeOutsideArea, setIncludeOutsideArea] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<string>("recent");
  const [view, setView] = useState<"cards" | "list">("list");

  const filters = { regions, categories, includeOutsideArea, query, sort };
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace", filters],
    queryFn: () => listMarketplace({ data: filters }),
  });

  const leads = data?.leads ?? [];
  const myRegions = useMemo(() => data?.myRegions ?? [], [data]);
  const activeFilterCount =
    regions.length + categories.length + (includeOutsideArea ? 1 : 0) + (query.trim() ? 1 : 0);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const resetFilters = () => {
    setRegions([]);
    setCategories([]);
    setIncludeOutsideArea(false);
    setQuery("");
    setSort("recent");
  };

  const filterBar = (
    <section
      className="rounded-2xl bg-background p-4"
      style={{ boxShadow: "var(--shadow-panel)" }}
      aria-label="Leads filteren"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Filter size={14} className="text-moss/60" /> Filter leads
          {activeFilterCount > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-bold text-moss" style={{ backgroundColor: "#f7e3bd" }}>
              {activeFilterCount}
            </span>
          )}
        </p>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 text-xs text-moss">
            <X size={13} /> Filters wissen
          </Button>
        )}
      </div>

      <div className="relative mt-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-moss/50" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek op postcode, plaats of regio"
          className="pl-9"
          aria-label="Zoek op postcode, plaats of regio"
        />
      </div>

      {myRegions.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-moss/60">
            Jouw werkgebieden {regions.length === 0 && "(alle actief)"}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myRegions.map((r) => (
              <Chip
                key={r.code}
                active={regions.includes(r.code)}
                onClick={() => toggle(regions, setRegions, r.code)}
              >
                {r.code} · {r.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss/60">
          Categorie {categories.length === 0 && "(jouw actieve categorieën)"}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={categories.includes(c)}
              onClick={() => toggle(categories, setCategories, c)}
            >
              {CATEGORY_LABEL[c] ?? c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-moss/60">Sorteren</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <Chip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ backgroundColor: "#f7f8f5" }}>
        <Label htmlFor="outside-area" className="text-xs text-moss">
          Ook leads buiten mijn werkgebied tonen
          {!includeOutsideArea && (data?.hiddenByArea ?? 0) > 0 && (
            <span className="ml-1 text-moss/60">({data?.hiddenByArea} verborgen)</span>
          )}
        </Label>
        <Switch id="outside-area" checked={includeOutsideArea} onCheckedChange={setIncludeOutsideArea} />
      </div>
    </section>
  );

  const viewToggle = (
    <div
      className="inline-flex items-center gap-1 rounded-full bg-background p-1"
      style={{ boxShadow: "var(--shadow-panel)" }}
      role="group"
      aria-label="Weergave kiezen"
    >
      {([
        { id: "list", label: "Lijst", icon: List },
        { id: "cards", label: "Kaarten", icon: LayoutGrid },
      ] as const).map((v) => {
        const Icon = v.icon;
        const active = view === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => setView(v.id)}
            aria-pressed={active}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={active ? { backgroundColor: "#315642", color: "white" } : { color: "#315642" }}
          >
            <Icon size={13} /> {v.label}
          </button>
        );
      })}
    </div>
  );

  const buy = useMutation({
    mutationFn: (leadId: string) => purchaseLead({ data: { leadId } }),
    onSuccess: () => {
      toast.success("Lead gekocht — contactgegevens staan nu bij 'Mijn leads'.");
      queryClient.invalidateQueries({ queryKey: ["marketplace"] });
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["partner-context"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="space-y-3">
        {filterBar}
        <p className="rounded-2xl bg-background p-6 text-sm text-moss/70" style={{ boxShadow: "var(--shadow-panel)" }}>
          {activeFilterCount > 0 || (data?.hiddenByArea ?? 0) > 0
            ? "Geen leads die aan deze filters voldoen. Verruim je werkgebied of categorieën, of zet 'buiten mijn werkgebied' aan."
            : "Er staan nu geen nieuwe leads open. Zodra een consument een aanvraag doet, verschijnt die hier."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterBar}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-moss/70">
          {leads.length} {leads.length === 1 ? "lead" : "leads"} gevonden
          {myRegions.length > 0 && !includeOutsideArea && " in jouw werkgebied"}
        </p>
        {viewToggle}
      </div>

      {view === "list" ? (
        <div className="overflow-hidden rounded-2xl bg-background" style={{ boxShadow: "var(--shadow-panel)" }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Openstaande leads in de leadmarkt</caption>
              <thead>
                <tr style={{ backgroundColor: "#f7f8f5" }} className="text-left text-xs uppercase tracking-wide text-moss/70">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Regio</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Categorieën</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Woning</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Bespaarpotentieel</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Plekken</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Datum</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Prijs</th>
                  <th scope="col" className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-t" style={{ borderColor: "#eef1ec" }}>
                    <td className="px-4 py-3">
                      <span className="font-semibold text-ink">{lead.region || "Onbekend"}</span>
                      {lead.regionName && <span className="block text-xs text-moss/60">{lead.regionName}</span>}
                      {!lead.inMyArea && (
                        <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-moss" style={{ backgroundColor: "#f7e3bd" }}>
                          buiten werkgebied
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-moss">
                      {lead.categories.map((c) => CATEGORY_LABEL[c] ?? c).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-xs text-moss/70">
                      {lead.houseType ?? "onbekend"}
                      <span className="block">{lead.consumption ?? "?"} kWh/jaar</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-moss">
                      {formatEuro(lead.estimatedSavings)}/jr
                    </td>
                    <td className="px-4 py-3 text-xs text-moss/70">{lead.slotsLeft} van 3</td>
                    <td className="px-4 py-3 text-xs text-moss/70">
                      {new Date(lead.createdAt).toLocaleDateString("nl-NL")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-leaf">{formatEuro(lead.price)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        disabled={buy.isPending || remaining <= 0}
                        onClick={() => buy.mutate(lead.id)}
                        style={{ backgroundColor: "#4f8f62", color: "white" }}
                      >
                        {remaining <= 0 ? "Limiet bereikt" : "Inkopen"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        leads.map((lead) => (
        <article
          key={lead.id}
          className="rounded-2xl bg-background p-4 sm:flex sm:items-center sm:gap-4"
          style={{ boxShadow: "var(--shadow-panel)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {lead.categories.map((c) => (
                <span key={c} className="rounded-full px-2 py-0.5 text-xs font-semibold text-moss" style={{ backgroundColor: "#f7e3bd" }}>
                  {CATEGORY_LABEL[c] ?? c}
                </span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-ink">
              <MapPin size={14} className="text-moss/60" /> {lead.region || "Regio onbekend"}
              {lead.regionName && <span className="text-xs font-normal text-moss/60">{lead.regionName}</span>}
              {!lead.inMyArea && (
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-moss" style={{ backgroundColor: "#f7e3bd" }}>
                  buiten werkgebied
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-moss/70">
              {lead.houseType ?? "woning onbekend"} · {lead.consumption ?? "?"} kWh/jaar · contract{" "}
              {lead.contractType ?? "onbekend"} · {new Date(lead.createdAt).toLocaleDateString("nl-NL")}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-moss/70">
              <Sparkles size={13} style={{ color: "#f0b84f" }} /> bespaarpotentieel{" "}
              {formatEuro(lead.estimatedSavings)}/jr
              <Users size={13} className="ml-2 text-moss/60" /> nog {lead.slotsLeft} van 3 plekken
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 sm:mt-0 sm:flex-col sm:items-end">
            <span className="text-sm font-bold text-leaf">{formatEuro(lead.price)}</span>
            <Button
              size="sm"
              disabled={buy.isPending || remaining <= 0}
              onClick={() => buy.mutate(lead.id)}
              style={{ backgroundColor: "#4f8f62", color: "white" }}
            >
              {remaining <= 0 ? "Limiet bereikt" : "Lead inkopen"}
            </Button>
          </div>
        </article>
        ))
      )}
    </div>
  );
}
