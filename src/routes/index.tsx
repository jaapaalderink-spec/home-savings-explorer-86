import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Home, PiggyBank, TrendingUp, CalendarClock } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { berekenScenario, defaults, euro, looptijdLabel, type Inputs } from "@/lib/mortgage";

const title = "Home Savings Explorer — hypotheek & spaardoel calculator";
const description =
  "Bereken je maximale hypotheek, benodigde eigen geld en hoe lang je moet sparen voor je droomhuis. Realistisch scenario op basis van inkomen, rente en spaargedrag.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Veld({
  label,
  waarde,
  onChange,
  min,
  max,
  step,
  suffix,
  hint,
}: {
  label: string;
  waarde: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={waarde}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
            className="h-8 w-28 text-right tabular-nums"
          />
          {suffix ? <span className="text-xs text-muted-foreground w-8">{suffix}</span> : null}
        </div>
      </div>
      <Slider
        value={[waarde]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  waarde,
  sub,
}: {
  icon: typeof Home;
  label: string;
  waarde: string;
  sub?: string;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-start gap-3 p-4">
        <span className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-xl font-semibold tabular-nums">{waarde}</p>
          {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Index() {
  const [inp, setInp] = useState<Inputs>(defaults);
  const set = <K extends keyof Inputs>(k: K) => (v: Inputs[K]) => setInp((s) => ({ ...s, [k]: v }));
  const r = useMemo(() => berekenScenario(inp), [inp]);

  const voortgang = Math.min(100, (inp.eigenGeld / Math.max(1, r.benodigdEigenGeld)) * 100);

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <Badge variant="secondary" className="mb-3">Nederlandse woningmarkt · indicatief</Badge>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Home Savings Explorer</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Speel met je inkomen, rente en spaargedrag en zie meteen wat je kunt lenen, hoeveel eigen geld je
            nodig hebt en wanneer je droomhuis binnen bereik komt.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Jouw uitgangspunten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <Veld label="Huisprijs" waarde={inp.huisprijs} onChange={set("huisprijs")} min={100000} max={1200000} step={5000} suffix="€" />
            <Veld label="Bruto jaarinkomen (huishouden)" waarde={inp.brutoInkomen} onChange={set("brutoInkomen")} min={20000} max={250000} step={1000} suffix="€" />
            <Veld label="Huidig eigen geld" waarde={inp.eigenGeld} onChange={set("eigenGeld")} min={0} max={300000} step={1000} suffix="€" />
            <Veld label="Sparen per maand" waarde={inp.maandSparen} onChange={set("maandSparen")} min={0} max={4000} step={25} suffix="€" />
            <Veld label="Hypotheekrente" waarde={inp.rente} onChange={set("rente")} min={0.5} max={9} step={0.1} suffix="%" hint="Rentevast; beïnvloedt zowel maandlast als leencapaciteit." />
            <Veld label="Spaarrente" waarde={inp.spaarrente} onChange={set("spaarrente")} min={0} max={6} step={0.1} suffix="%" />
            <Veld label="Looptijd" waarde={inp.looptijdJaren} onChange={set("looptijdJaren")} min={10} max={30} step={1} suffix="jr" />
            <Veld label="Kosten koper" waarde={inp.kostenKoperPct} onChange={set("kostenKoperPct")} min={0} max={10} step={0.5} suffix="%" hint="Overdrachtsbelasting, notaris, taxatie en advies." />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Home} label="Max hypotheek" waarde={euro(r.hypotheek)} sub={`Max huisprijs ${euro(r.maxHuisprijs)}`} />
            <Kpi icon={TrendingUp} label="Bruto maandlast" waarde={euro(r.maandlast)} sub={`Netto ± ${euro(r.nettoMaandlast)}`} />
            <Kpi icon={PiggyBank} label="Eigen geld nodig" waarde={euro(r.benodigdEigenGeld)} sub={`waarvan ${euro(r.kostenKoper)} kosten koper`} />
            <Kpi icon={CalendarClock} label="Spaardoel bereikt" waarde={r.haalbaar ? looptijdLabel(r.maanden) : "> 40 jaar"} sub={r.tekort > 0 ? `Tekort ${euro(r.tekort)}` : "Je hebt genoeg eigen geld"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Spaarscenario tot je eigen inbreng rond is</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Voortgang eigen geld</span>
                  <span className="font-medium tabular-nums">{Math.round(voortgang)}%</span>
                </div>
                <Progress value={voortgang} />
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={r.reeks} margin={{ left: 8, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="saldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="maand"
                      tickFormatter={(m: number) => (m % 12 === 0 ? `${m / 12}jr` : "")}
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      width={44}
                    />
                    <Tooltip
                      formatter={(v: number, n: string) => [euro(v), n === "saldo" ? "Spaarsaldo" : "Doel"]}
                      labelFormatter={(m: number) => `Maand ${m}`}
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                        color: "var(--color-card-foreground)",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="saldo"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      fill="url(#saldo)"
                    />
                    <Line type="monotone" dataKey="doel" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Financieringsopbouw</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Regel label="Huisprijs" waarde={euro(inp.huisprijs)} />
                <Regel label="Hypotheek" waarde={euro(r.hypotheek)} />
                <Regel label="Eigen inbreng in de woning" waarde={euro(Math.max(0, inp.huisprijs - r.hypotheek))} />
                <Regel label="Kosten koper" waarde={euro(r.kostenKoper)} />
                <Regel label="Totaal eigen geld nodig" waarde={euro(r.benodigdEigenGeld)} sterk />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Lasten & haalbaarheid</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Regel label="Bruto maandlast" waarde={euro(r.maandlast)} />
                <Regel label="Netto maandlast (indicatie)" waarde={euro(r.nettoMaandlast)} />
                <Regel label="Woonquote" waarde={`${(r.woonquote * 100).toFixed(1)}% van bruto inkomen`} />
                <Regel label="Totale rente over looptijd" waarde={euro(r.totaleRente)} />
                <Regel
                  label="Conclusie"
                  waarde={
                    r.tekort === 0
                      ? "Je kunt nu kopen"
                      : r.haalbaar
                        ? `Sparen tot ${looptijdLabel(r.maanden)}`
                        : "Doel te ver weg — pas prijs of sparen aan"
                  }
                  sterk
                />
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Indicatieve berekening op basis van vereenvoudigde NHG-achtige leennormen en annuïtaire aflossing.
            Geen financieel advies.
          </p>
        </div>
      </div>
    </main>
  );
}

function Regel({ label, waarde, sterk }: { label: string; waarde: string; sterk?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-border/60 py-1.5 last:border-0 ${
        sterk ? "font-semibold text-foreground" : "text-muted-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{waarde}</span>
    </div>
  );
}
