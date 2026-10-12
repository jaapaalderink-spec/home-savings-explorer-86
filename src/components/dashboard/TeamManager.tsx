import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createInvitation,
  getTeamSettings,
  revokeInvitation,
  updateTeamMember,
} from "@/lib/team.functions";
import { formatEuro } from "@/lib/home-savings";
import type { TeamAction } from "@/lib/team-policy";

const ROLE = { owner: "Eigenaar", account_manager: "Accountmanager" } as const;
const panel = { boxShadow: "var(--shadow-panel)" };

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function TeamManager() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["team-settings"],
    queryFn: () => getTeamSettings({ data: {} }),
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"account_manager" | "owner">("account_manager");
  const [confirm, setConfirm] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["team-settings"] });
    qc.invalidateQueries({ queryKey: ["team"] });
  };

  const invite = useMutation({
    mutationFn: () => createInvitation({ data: { email, role, confirmSeat: true } }),
    onSuccess: (res) => {
      setLink(`${window.location.origin}/uitnodiging?token=${res.token}`);
      setEmail("");
      setConfirm(false);
      toast.success("Uitnodiging aangemaakt.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvitation({ data: { id } }),
    onSuccess: () => {
      toast.success("Uitnodiging ingetrokken.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: (v: { userId: string; action: TeamAction }) => updateTeamMember({ data: v }),
    onSuccess: () => {
      toast.success("Team bijgewerkt.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (error || !data) return null;
  const q = data.quote;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-background p-5" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">Teamlid uitnodigen</h3>
        <p className="mt-1 text-sm text-moss/70">
          De uitnodiging is eenmalig, geldt 7 dagen en werkt alleen voor het opgegeven e-mailadres.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">E-mailadres</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="collega@bedrijf.nl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Rol</Label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="account_manager">Accountmanager</option>
              <option value="owner">Eigenaar</option>
            </select>
          </div>
        </div>

        <div className="mt-4 rounded-xl bg-muted p-4 text-sm">
          <p className="font-semibold text-ink">Wat dit kost</p>
          <ul className="mt-1 space-y-0.5 text-moss/80">
            <li>Extra plek: {formatEuro(q.seatFee)} per maand, excl. btw</li>
            <li>Ingangsdatum: {fmtDate(q.startDate)}</li>
            <li>
              Maandbedrag: {formatEuro(q.currentTotal)} → <strong>{formatEuro(q.newTotal)}</strong>{" "}
              excl. btw
            </li>
          </ul>
          <label className="mt-3 flex items-start gap-2">
            <Checkbox checked={confirm} onCheckedChange={(v) => setConfirm(v === true)} />
            <span>Ik ga akkoord met deze extra plek en het nieuwe maandbedrag.</span>
          </label>
        </div>

        <Button
          className="mt-4"
          onClick={() => invite.mutate()}
          disabled={!confirm || invite.isPending || !email.includes("@")}
        >
          Uitnodiging aanmaken
        </Button>

        {link && (
          <div className="mt-4 rounded-xl border border-leaf/30 p-4 text-sm">
            <p className="font-semibold text-ink">Stuur deze link naar je collega</p>
            <p className="mt-1 break-all font-mono text-xs text-moss/80">{link}</p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                navigator.clipboard.writeText(link);
                toast.success("Link gekopieerd.");
              }}
            >
              Kopieer link
            </Button>
            <p className="mt-2 text-xs text-moss/60">Deze link wordt maar één keer getoond.</p>
          </div>
        )}
      </section>

      {data.invitations.length > 0 && (
        <section className="rounded-2xl bg-background p-5" style={panel}>
          <h3 className="font-display text-lg font-bold text-ink">Openstaande uitnodigingen</h3>
          <ul className="mt-3 divide-y divide-moss/10 text-sm">
            {data.invitations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold text-ink">{i.email}</span>{" "}
                  <span className="text-moss/70">
                    · {ROLE[i.role as keyof typeof ROLE]} · verloopt {fmtDate(i.expires_at)}
                  </span>
                </span>
                <Button size="sm" variant="outline" onClick={() => revoke.mutate(i.id)}>
                  Intrekken
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl bg-background p-5" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">Teamleden en rollen</h3>
        <ul className="mt-3 divide-y divide-moss/10 text-sm">
          {data.members.map((m) => {
            const self = m.id === data.me;
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold text-ink">{m.name}</span>{" "}
                  <span className="text-moss/70">
                    · {ROLE[m.role]}
                    {self ? " (jij)" : ""}
                  </span>
                </span>
                {!self && (
                  <span className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() =>
                        update.mutate({
                          userId: m.id,
                          action: m.role === "owner" ? "make_account_manager" : "make_owner",
                        })
                      }
                    >
                      {m.role === "owner" ? "Maak accountmanager" : "Maak eigenaar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={update.isPending}
                      onClick={() => {
                        if (window.confirm(`${m.name} uit het team verwijderen?`))
                          update.mutate({ userId: m.id, action: "remove" });
                      }}
                    >
                      Verwijderen
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-moss/60">
          Je kunt je eigen rol niet wijzigen. Er blijft altijd minstens één eigenaar.
        </p>
      </section>
    </div>
  );
}
