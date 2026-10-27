import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicDb() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type BlogCard = {
  slug: string;
  title: string;
  excerpt: string;
  media_type: string | null;
  media_url: string | null;
  published_at: string | null;
};

export const listPublishedPosts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicDb()
    .from("blog_posts")
    .select("slug, title, excerpt, media_type, media_url, published_at")
    .eq("published", true)
    .order("published_at", { ascending: false });
  if (error) throw new Error("Het nieuws kon niet worden geladen.");
  return (data ?? []) as BlogCard[];
});

export const getPublishedPost = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => ({ slug: String(d.slug).slice(0, 200) }))
  .handler(async ({ data }) => {
    const { data: post, error } = await publicDb()
      .from("blog_posts")
      .select("slug, title, excerpt, body, media_type, media_url, published_at")
      .eq("published", true)
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error("Het artikel kon niet worden geladen.");
    return post;
  });
