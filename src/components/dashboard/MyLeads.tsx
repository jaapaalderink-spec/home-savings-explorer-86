import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MapLead } from "@/components/dashboard/PartnerLeadsMap";

const PartnerLeadsMap = lazy(() => import("@/components/dashboard/PartnerLeadsMap"));
import { toast } from "sonner";
import { Mail, Phone, MapPin, UserCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  assignPurchases,
  listAssignableMembers,
  listPurchasedLeads,
  updatePurchase,
} from "@/lib/partner.functions";
import { CATEGORY_LABEL } from "@/lib/lead-pricing";
import { formatEuro } from "@/lib/home-savings";

const STATUSES = [
  { id: "new", label: "Nieuw" },
  { id: "contacted", label: "Gebeld" },
  { id: "quoted", label: "Offerte uit" },
  { id: "won", label: "Gewonnen" },
  { id: "lost", label: "Verloren" },
] as const;

type LeadRow = { categories?: string[] | null } & Record<string, unknown>;

export function MyLeads() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "map">("list");
  const { data, isLoading } = useQuery({
    queryKey: ["my-leads"],
    queryFn: () => listPurchasedLeads(),
  });

  const team = useQuery({
    queryKey: ["assignable-members"],
    queryFn: () => listAssignableMembers(),
  });

  const update = useMutation({
    mutationFn: (vars: { purchaseId: string; status: (typeof STATUSES)[number]["id"] }) =>
      updatePurchase({ data: vars }),
    onSuccess: () => {
      toast.success("Status bijgewerkt");
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assign = useMutation({
    mutationFn: (vars: { purchaseId: string; assignedTo: string | null }) =>
      assignPurchases({ data: { purchaseIds: [vars.purchaseId], assignedTo: vars.assignedTo } }),
    onSuccess: () => {
      toast.success("Lead toegewezen");
      queryClient.invalidateQueries({ queryKey: ["my-leads"] });
      queryClient.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="rounded-2xl bg-background p-6 text-sm text-moss/70" style={{ boxShadow: "var(--shadow-panel)" }}>
        Nog geen leads ingekocht. Ga naar de leadmarkt om je eerste lead te claimen.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex overflow-hidden rounded-full border border-moss/20 bg-background text-sm">
        {(
          [
            ["list", "Lijst"],
            ["map", "Kaart"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            aria-pressed={view === value}
            className={`min-h-9 px-4 py-2 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf ${
              view === value ? "bg-leaf text-background" : "text-moss/80 hover:bg-cloud"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "map" ? (
        <ClientOnly fallback={<Skeleton className="h-[26rem] w-full rounded-2xl" />}>
          <Suspense fallback={<Skeleton className="h-[26rem] w-full rounded-2xl" />}>
            <PartnerLeadsMap leads={data as MapLead[]} />
          </Suspense>
        </ClientOnly>
      ) : (
        <div className="space-y-3">
      {data.map((p) => {
        const lead = (p.lead ?? {}) as LeadRow;

        const categories = (lead["categories"] as string[] | null) ?? [];
        return (
          <article key={p.id} className="rounded-2xl bg-background p-4" style={{ boxShadow: "var(--shadow-panel)" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">
                  {String(lead["first_name"] ?? "")} {String(lead["last_name"] ?? "")}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-moss/75">
                  <span className="inline-flex items-center gap-1"><Mail size={12} /> {String(lead["email"] ?? "")}</span>
                  <span className="inline-flex items-center gap-1"><Phone size={12} /> {String(lead["phone"] ?? "")}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={12} /> {String(lead["postcode"] ?? "")} {String(lead["house_number"] ?? "")}{" "}
                    {String(lead["city"] ?? "")}
                  </span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {categories.map((c) => (
                    <span key={c} className="rounded-full px-2 py-0.5 text-xs font-semibold text-moss" style={{ backgroundColor: "#f7e3bd" }}>
                      {CATEGORY_LABEL[c] ?? c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right text-xs text-moss/70">
                <p className="text-sm font-bold text-leaf">{formatEuro(p.price)}</p>
                <p>{new Date(p.createdAt).toLocaleDateString("nl-NL")}</p>
                <p>door {p.accountManager}</p>
                <p className="mt-1 inline-flex items-center gap-1 font-semibold text-moss">
                  <UserCheck size={12} /> {p.assignedName ?? "Niet toegewezen"}
                </p>
              </div>
            </div>

            {lead["notes"] ? (
              <p className="mt-3 rounded-xl bg-muted p-3 text-xs text-moss/80">{String(lead["notes"])}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {STATUSES.map((s) => {
                const active = p.status === s.id;
                const allowed =
                  active || checkStatusTransition(p.status as LeadStatus, s.id).ok;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!allowed || update.isPending}
                    title={allowed ? undefined : "Deze stap kan niet vanuit de huidige status"}
                    onClick={() => update.mutate({ purchaseId: p.id, status: s.id })}
                    className="min-h-9 rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf disabled:cursor-not-allowed disabled:opacity-40"
                    style={{
                      borderColor: active ? "#4f8f62" : "#dfe6e0",
                      backgroundColor: active ? "#4f8f62" : "transparent",
                      color: active ? "white" : "#315642",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}


              {team.data?.canAssign && (
                <label className="ml-auto flex items-center gap-2 text-xs text-moss/70">
                  Accountmanager
                  <select
                    value={p.assignedTo ?? ""}
                    onChange={(e) => assign.mutate({ purchaseId: p.id, assignedTo: e.target.value || null })}
                    disabled={assign.isPending}
                    className="min-h-9 rounded-full border border-moss/20 bg-background px-3 text-xs font-semibold text-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf"
                  >
                    <option value="">Niet toegewezen</option>
                    {team.data.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

          </article>
        );
      })}
        </div>
      )}
    </div>
  );
}

