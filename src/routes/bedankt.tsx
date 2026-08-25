import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/bedankt")({
  head: () => ({
    meta: [
      { title: "Aanvraag ontvangen — Onafhankelijke Offerte" },
      {
        name: "description",
        content:
          "Bedankt voor je aanvraag. Maximaal 3 gecontroleerde installateurs nemen binnen enkele werkdagen contact met je op.",
      },
      { property: "og:title", content: "Aanvraag ontvangen — Onafhankelijke Offerte" },
      {
        property: "og:description",
        content: "Je aanvraag staat klaar voor maximaal 3 gecontroleerde installateurs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BedanktPage,
});

function BedanktPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-16" style={{ backgroundColor: "var(--color-cloud)" }}>
      <div className="w-full max-w-lg rounded-3xl bg-background p-8 text-center" style={{ boxShadow: "var(--shadow-panel-lg)" }}>
        <CheckCircle2 size={44} className="mx-auto" style={{ color: "#4f8f62" }} />
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Je aanvraag is ontvangen</h1>
        <p className="mt-2 text-sm text-moss/75">
          Maximaal 3 gecontroleerde installateurs bekijken je situatie en nemen binnen enkele
          werkdagen contact met je op. Je zit nergens aan vast.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md px-5 py-2.5 text-sm font-semibold text-white"
          style={{ backgroundColor: "#4f8f62" }}
        >
          Terug naar de homepage
        </Link>
      </div>
    </main>
  );
}
