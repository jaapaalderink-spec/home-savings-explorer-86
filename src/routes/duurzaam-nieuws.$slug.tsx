import { BlogBody } from "@/components/blog/BlogBody";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getPublishedPost } from "@/lib/blog.functions";
import { BlogMedia, formatDate } from "@/components/blog/BlogMedia";

const postQuery = (slug: string) =>
  queryOptions({ queryKey: ["blog", "post", slug], queryFn: () => getPublishedPost({ data: { slug } }) });

export const Route = createFileRoute("/duurzaam-nieuws/$slug")({
  loader: async ({ context, params }) => {
    const post = await context.queryClient.ensureQueryData(postQuery(params.slug));
    if (!post) throw notFound();
    return { title: post.title, excerpt: post.excerpt, image: post.media_type === "image" ? post.media_url : null };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Artikel niet gevonden — Duurzaam nieuws" }, { name: "robots", content: "noindex" }] };
    const t = `${loaderData.title} — Duurzaam nieuws`;
    const meta = [
      { title: t },
      { name: "description", content: loaderData.excerpt },
      { property: "og:title", content: t },
      { property: "og:description", content: loaderData.excerpt },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (loaderData.image?.startsWith("https://"))
      meta.push({ property: "og:image", content: loaderData.image }, { name: "twitter:image", content: loaderData.image });
    return { meta };
  },
  notFoundComponent: () => (
    <main className="mx-auto max-w-2xl px-5 py-20 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">Artikel niet gevonden</h1>
      <Link to="/duurzaam-nieuws" className="mt-4 inline-block font-semibold text-leaf">← Terug naar Duurzaam nieuws</Link>
    </main>
  ),
  component: Article,
});

function Article() {
  const { slug } = Route.useParams();
  const { data: post } = useSuspenseQuery(postQuery(slug));
  if (!post) return null;
  return (
    <main className="min-h-dvh" style={{ backgroundColor: "var(--color-cloud)" }}>
      <article className="mx-auto max-w-3xl px-5 py-8 pb-20">
        <Link to="/duurzaam-nieuws" className="text-sm font-semibold text-leaf hover:underline">← Duurzaam nieuws</Link>
        <p className="mt-6 text-sm text-moss/60">{formatDate(post.published_at)}</p>
        <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">{post.title}</h1>
        {post.excerpt && <p className="mt-3 text-lg text-moss/80">{post.excerpt}</p>}
        {post.media_url && (
          <BlogMedia type={post.media_type} url={post.media_url} alt={post.title} controls className="mt-6 aspect-video w-full rounded-2xl" />
        )}
        <div className="mt-8"><BlogBody body={post.body} /></div>
      </article>
    </main>
  );
}
