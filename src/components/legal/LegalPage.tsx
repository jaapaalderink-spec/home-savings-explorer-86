import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-5 py-12">
      <article className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-moss/70 underline-offset-4 hover:underline">
          Terug naar home
        </Link>
        <h1 className="mt-4 font-display text-3xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-moss/60">Laatst bijgewerkt: {updated}</p>
        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-moss/85 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_a]:underline">
          {children}
        </div>
      </article>
    </main>
  );
}
