import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, FileText, Gauge, Map, Table } from "lucide-react";
import { PlatformStats } from "@/components/admin/PlatformStats";
import { AdminLeadsTable } from "@/components/admin/AdminLeadsTable";
import { RegionMapPanel } from "@/components/admin/RegionMapPanel";
import { CoverageGaps } from "@/components/admin/CoverageGaps";
import { BillingAdmin } from "@/components/admin/BillingAdmin";
import { QualityScores } from "@/components/admin/QualityScores";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { FilterBar } from "@/components/admin/FilterBar";
import type { LeadFilters } from "@/components/admin/filters";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Platformbeheer — Onafhankelijke Offerte" },
      {
        name: "description",
        content: "Overzicht van alle aanvragen, regio's, partners, dekkingsgaten en facturatie op het platform.",
      },
      { property: "og:title", content: "Platformbeheer — Onafhankelijke Offerte" },
      { property: "og:description", content: "Alle aanvragen, regio's, partners en facturatie in één beheerdashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type TabId = "overview" | "leads" | "map" | "quality" | "billing";

function AdminPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const [filters, setFilters] = useState<LeadFilters>({ days: 30 });

  const tabs: Array<{ id: TabId; label: string; icon: typeof BarChart3 }> = [
    { id: "overview", label: "Overzicht", icon: BarChart3 },
    { id: "leads", label: "Aanvragen", icon: Table },
    { id: "map", label: "Kaart & regio's", icon: Map },
    { id: "quality", label: "Kwaliteit", icon: Gauge },
    { id: "billing", label: "Facturatie", icon: FileText },
  ];

  return (
    <main className="min-h-dvh" style={{ backgroundColor: "var(--color-cloud)" }}>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Platformbeheer</h1>
          <p className="text-sm text-moss/70">Alle aanvragen, regio's, partners en facturatie.</p>
        </div>
        <Link to="/dashboard" className="text-sm font-semibold text-leaf underline-offset-4 hover:underline">
          Naar partnerdashboard
        </Link>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-5 pb-20">
        <nav className="flex flex-wrap gap-2" aria-label="Beheersecties">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf ${
                tab === t.id ? "bg-moss text-cloud" : "bg-background text-moss hover:bg-moss/10"
              }`}
            >
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </nav>

        {(tab === "leads" || tab === "map") && <FilterBar value={filters} onChange={setFilters} />}

        {tab === "overview" && (
          <div className="space-y-4">
            <PlatformStats />
            <CoverageGaps />
            <AdminOverview />
          </div>
        )}
        {tab === "leads" && <AdminLeadsTable filters={filters} />}
        {tab === "map" && <RegionMapPanel filters={filters} />}
        {tab === "quality" && <QualityScores />}
        {tab === "billing" && <BillingAdmin />}
      </div>
    </main>
  );
}
