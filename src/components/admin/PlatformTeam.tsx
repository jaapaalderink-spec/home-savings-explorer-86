import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { listPlatformTeam, setPlatformMember } from "@/lib/team.functions";
import { STAFF_PERMISSIONS } from "@/lib/team-policy";

const panel = { boxShadow: "var(--shadow-panel)" };
const LABEL = Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.id, p.label]));

export function PlatformTeam() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["platform-team"], queryFn: () => listPlatformTeam() });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"platform_staff" | "admin" | "none">("platform_staff");
  const [perms, setPerms] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: (v: { email: string; role: typeof role; permissions: string[] }) =>
      setPlatformMember({ data: v as never }),
    onSuccess: () => {
      toast.success("Platformteam bijgewerkt.");
      setEmail("");
      setPerms([]);
      qc.invalidateQueries({ queryKey: ["platform-team"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-background p-5" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">Rechten toekennen</h3>
        <p className="mt-1 text-sm text-moss/70">
          De persoon moet al een account hebben. Je kunt je eigen rechten niet wijzigen.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">E-mailadres</Label>
            <Input id="staff-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-role">Rol</Label>
            <select
              id="staff-role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="platform_staff">Platformmedewerker</option>
              <option value="admin">Platformbeheerder (alle rechten)</option>
              <option value="none">Geen platformrol</option>
            </select>
          </div>
        </div>
        {role === "platform_staff" && (
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {STAFF_PERMISSIONS.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={perms.includes(p.id)}
                  onCheckedChange={(v) =>
                    setPerms((cur) => (v ? [...cur, p.id] : cur.filter((x) => x !== p.id)))
                  }
                />
                {p.label}
              </label>
            ))}
          </div>
        )}
        <Button
          className="mt-4"
          disabled={save.isPending || !email.includes("@")}
          onClick={() =>
            save.mutate({ email, role, permissions: role === "platform_staff" ? perms : [] })
          }
        >
          Opslaan
        </Button>
      </section>

      <section className="rounded-2xl bg-background p-5" style={panel}>
        <h3 className="font-display text-lg font-bold text-ink">Platformteam</h3>
        <ul className="mt-3 divide-y divide-moss/10 text-sm">
          {(data?.members ?? []).map((m) => (
            <li key={m.id} className="py-2">
              <span className="font-semibold text-ink">{m.name}</span>{" "}
              <span className="text-moss/70">
                · {m.role === "admin" ? "Platformbeheerder" : "Platformmedewerker"}
                {m.id === data?.me ? " (jij)" : ""}
              </span>
              {m.role === "platform_staff" && (
                <span className="block text-xs text-moss/60">
                  {m.permissions.map((p) => LABEL[p] ?? p).join(", ") || "Nog geen rechten"}
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
