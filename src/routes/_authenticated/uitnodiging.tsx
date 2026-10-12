import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acceptInvitation, previewInvitation } from "@/lib/team.functions";
import { PENDING_INVITE_KEY, teamResultMessage } from "@/lib/team-policy";

export const Route = createFileRoute("/_authenticated/uitnodiging")({
  validateSearch: z.object({ token: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Uitnodiging accepteren — Onafhankelijke Offerte" },
      { name: "description", content: "Sluit je aan bij het team van je bedrijf." },
      { property: "og:title", content: "Uitnodiging accepteren — Onafhankelijke Offerte" },
      { property: "og:description", content: "Sluit je aan bij het team van je bedrijf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvitePage,
});

const ROLE: Record<string, string> = { owner: "eigenaar", account_manager: "accountmanager" };

function InvitePage() {
  const { token = "" } = Route.useSearch();
  const navigate = useNavigate();
  useEffect(() => {
    localStorage.removeItem(PENDING_INVITE_KEY);
  }, []);
  const valid = /^[0-9a-f]{64}$/.test(token);
  const { data, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => previewInvitation({ data: { token } }),
    enabled: valid,
  });
  const accept = useMutation({
    mutationFn: () => acceptInvitation({ data: { token } }),
    onSuccess: () => {
      toast.success("Je bent toegevoegd aan het team.");
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main
      className="grid min-h-dvh place-items-center px-5"
      style={{ backgroundColor: "var(--color-cloud)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-background p-7"
        style={{ boxShadow: "var(--shadow-panel-lg)" }}
      >
        <h1 className="font-display text-xl font-bold text-ink">Uitnodiging</h1>
        {!valid ? (
          <p className="mt-2 text-sm text-moss/70">{teamResultMessage("NOT_FOUND")}</p>
        ) : isLoading || !data ? (
          <p className="mt-2 text-sm text-moss/70">Laden…</p>
        ) : data.status !== "OPEN" ? (
          <p className="mt-2 text-sm text-moss/70">{teamResultMessage(data.status)}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-moss/80">
              Je bent uitgenodigd als <strong>{ROLE[data.role] ?? data.role}</strong> bij{" "}
              <strong>{data.companyName}</strong>. De uitnodiging is voor {data.email}.
            </p>
            <Button
              className="mt-5 w-full"
              onClick={() => accept.mutate()}
              disabled={accept.isPending}
            >
              Uitnodiging accepteren
            </Button>
          </>
        )}
        <Link to="/dashboard" className="mt-4 block text-sm font-semibold text-leaf">
          Naar het dashboard
        </Link>
      </div>
    </main>
  );
}
