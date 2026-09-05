import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Store, Inbox, Users, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { getPartnerContext } from "@/lib/partner.functions";
import { Onboarding } from "@/components/dashboard/Onboarding";
import { Marketplace } from "@/components/dashboard/Marketplace";
import { MyLeads } from "@/components/dashboard/MyLeads";
import { TeamOverview } from "@/components/dashboard/TeamOverview";
import { AdminOverview } from "@/components/dashboard/AdminOverview";
import { TRIAL_LEAD_ALLOWANCE, planByName } from "@/lib/lead-pricing";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Partnerdashboard — Onafhankelijke Offerte" },
      {
        name: "description",
        content:
          "Koop leads in, volg je pipeline en beheer je account managers in het partnerdashboard.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DashboardPage,
});

type TabId = "market" | "leads" | "team" | "admin";

function DashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("market");

  const { data, isLoading } = useQuery({
    queryKey: ["partner-context"],
    queryFn: () => getPartnerContext(),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isOwner = data?.roles.includes("owner") ?? false;
  const isAdmin = data?.roles.includes("admin") ?? false;
  const limit = data?.limit ?? 0;
  const used = data?.usedThisMonth ?? 0;
  const remaining = Math.max(limit - used, 0);
  const trialUsed = data?.trialUsed ?? 0;
  const trialRemaining = data?.trialRemaining ?? 0;
  const trialActive = data?.trialActive ?? false;

  const tabs: Array<{ id: TabId; label: string; icon: typeof Store; show: boolean }> = [
    { id: "market", label: "Leadmarkt", icon: Store, show: true },
    { id: "leads", label: "Mijn leads", icon: Inbox, show: true },
    { id: "team", label: "Team", icon: Users, show: isOwner || isAdmin },
    { id: "admin", label: "Platform", icon: ShieldCheck, show: isAdmin },
  ];

  return (
    <main className="min-h-dvh" style={{ backgroundColor: "var(--color-cloud)" }}>
      <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-5">
        <Link to="/" className="font-display text-lg font-bold text-moss">
          Onafhankelijke Offerte
        </Link>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              to="/admin"
              className="text-sm font-semibold text-leaf underline-offset-4 hover:underline"
            >
              Platformbeheer
            </Link>
          )}
          <Link
            to="/facturen"
            className="text-sm font-semibold text-leaf underline-offset-4 hover:underline"
          >
            Facturen
          </Link>
          <span className="text-sm text-moss/70">{data?.profile?.email}</span>

          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut size={14} className="mr-1.5" /> Uitloggen
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 pb-20">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-3xl" />
        ) : !data?.company ? (
          <Onboarding />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
                  {data.company.name}
                </h1>
                <p className="mt-1 text-sm text-moss/70">
                  Abonnement {planByName(data.company.plan_name).name} ·{" "}
                  {isOwner ? "eigenaar" : "account manager"}
                </p>
              </div>
              <div
                className="w-full max-w-xs rounded-2xl bg-background p-4"
                style={{ boxShadow: "var(--shadow-panel)" }}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-moss/60">
                  Leads deze maand
                </p>
                <p className="mt-1 text-lg font-bold text-ink">
                  {used} <span className="text-sm font-normal text-moss/70">van {limit}</span>
                </p>
                <Progress
                  value={limit === 0 ? 0 : Math.min((used / limit) * 100, 100)}
                  className="mt-2 h-2"
                />
                <p className="mt-1.5 text-xs text-moss/70">Nog {remaining} leads beschikbaar</p>
                {trialActive ? (
                  <p className="mt-2 border-t border-moss/10 pt-2 text-xs font-semibold text-leaf">
                    Startaanbod: nog {trialRemaining} van {TRIAL_LEAD_ALLOWANCE} gratis leads
                  </p>
                ) : (
                  <p className="mt-2 border-t border-moss/10 pt-2 text-xs text-moss/60">
                    Startaanbod gebruikt ({trialUsed} gratis leads)
                  </p>
                )}
              </div>
            </div>

            <nav className="mt-6 flex flex-wrap gap-2">
              {tabs
                .filter((t) => t.show)
                .map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
                      style={{
                        backgroundColor: active ? "#4f8f62" : "var(--color-background)",
                        color: active ? "white" : "#315642",
                        boxShadow: "var(--shadow-panel)",
                      }}
                    >
                      <Icon size={15} /> {t.label}
                    </button>
                  );
                })}
            </nav>

            <section className="mt-5">
              {tab === "market" && <Marketplace remaining={remaining} />}
              {tab === "leads" && <MyLeads />}
              {tab === "team" && (
                <TeamOverview joinCode={isOwner ? data.company.join_code : null} />
              )}
              {tab === "admin" && <AdminOverview />}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
