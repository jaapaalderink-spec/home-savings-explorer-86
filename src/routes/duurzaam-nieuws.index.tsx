import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { PlayCircle } from "lucide-react";
import { listPublishedPosts } from "@/lib/blog.functions";
import { BlogMedia, formatDate } from "@/components/blog/BlogMedia";

const postsQuery = queryOptions({ queryKey: ["blog", "list"], queryFn: () => listPublishedPosts() });

export const Route = createFileRoute("/duurzaam-nieuws/")({
  head: () => ({
    meta: [
      { title: "Duurzaam nieuws — Onafhankelijke Offerte" },
      { name: "description", content: "Het laatste nieuws en praktische tips over zonnepanelen, warmtepompen, thuisbatterijen, laadpalen en airco." },
      { property: "og:title", content: "Duurzaam nieuws — Onafhankelijke Offerte" },
      { property: "og:description", content: "Nieuws en tips om slim te besparen met duurzame maatregelen in huis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(postsQuery),
  component: NewsIndex,
});

function NewsIndex() {
  const { data: posts } = useSuspenseQuery(postsQuery);
  return (
    <main className="min-h-dvh" style={{ backgroundColor: "var(--color-cloud)" }}>
      <header className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-5">
        <Link to="/" className="font-display text-lg font-bold text-moss">Onafhankelijke Offerte</Link>
        <Link to="/" className="text-xs font-semibold text-moss/80 hover:underline">Naar de bespaarcalculator</Link>
      </header>
      <section className="mx-auto max-w-5xl px-5 pb-20">
        <h1 className="font-display text-3xl font-bold text-ink sm:text-5xl">Duurzaam nieuws</h1>
        <p className="mt-2 max-w-2xl text-moss/80">Nieuws en praktische tips om slim te besparen in en om je huis.</p>
        {posts.length === 0 ? (
          <p className="mt-10 rounded-2xl bg-background p-8 text-center text-moss/70">Er zijn nog geen artikelen. Kom snel terug!</p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <Link
                key={p.slug}
                to="/duurzaam-nieuws/$slug"
                params={{ slug: p.slug }}
                className="group overflow-hidden rounded-2xl bg-background transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf"
                style={{ boxShadow: "var(--shadow-panel)" }}
              >
                <div className="relative">
                  <BlogMedia type={p.media_type} url={p.media_url} alt={p.title} className="aspect-[16/10] w-full" />
                  {p.media_type === "video" && (
                    <PlayCircle className="absolute inset-0 m-auto text-background drop-shadow" size={48} />
                  )}
                </div>
                <div className="p-5">
                  <p className="text-xs text-moss/60">{formatDate(p.published_at)}</p>
                  <h2 className="mt-1 font-display text-lg font-bold text-ink group-hover:text-leaf">{p.title}</h2>
                  <p className="mt-2 line-clamp-3 text-sm text-moss/80">{p.excerpt}</p>
                  <span className="mt-3 inline-block text-sm font-semibold text-leaf">Lees verder →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
