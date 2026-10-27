import { BodyEditor } from "@/components/blog/BodyEditor";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BlogMedia } from "@/components/blog/BlogMedia";

type Draft = {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  media_type: string | null;
  media_url: string | null;
  published: boolean;
  published_at?: string | null;
};
const empty: Draft = { title: "", slug: "", excerpt: "", body: "", media_type: null, media_url: null, published: false };

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function BlogAdmin() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const posts = useQuery({
    queryKey: ["admin", "blog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("blog_posts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const slug = slugify(d.slug || d.title);
      if (!d.title.trim() || !slug) throw new Error("Vul een titel in.");
      const row = {
        title: d.title.trim(),
        slug,
        excerpt: d.excerpt.trim(),
        body: d.body,
        media_type: d.media_type,
        media_url: d.media_url,
        published: d.published,
        published_at: d.published ? (d.published_at ?? new Date().toISOString()) : null,
      };
      const { error } = d.id
        ? await supabase.from("blog_posts").update(row).eq("id", d.id)
        : await supabase.from("blog_posts").insert(row);
      if (error) throw new Error(error.code === "23505" ? "Deze webadres-naam bestaat al, kies een andere." : "Opslaan mislukt.");
    },
    onSuccess: () => {
      setDraft(null);
      setMsg("Opgeslagen.");
      qc.invalidateQueries({ queryKey: ["admin", "blog"] });
      qc.invalidateQueries({ queryKey: ["blog"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("blog_posts").delete().eq("id", id);
      if (error) throw new Error("Verwijderen mislukt.");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "blog"] }),
  });

  async function upload(file: File) {
    if (!draft) return;
    const isVideo = file.type.startsWith("video/");
    if (!isVideo && !file.type.startsWith("image/")) return setMsg("Kies een foto of video.");
    if (file.size > 50 * 1024 * 1024) return setMsg("Bestand is groter dan 50 MB.");
    setUploading(true);
    setMsg(null);
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, "-")}`;
    const up = await supabase.storage.from("blog-media").upload(path, file, { contentType: file.type });
    const signed = up.error
      ? null
      : await supabase.storage.from("blog-media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    setUploading(false);
    if (!signed?.data?.signedUrl) return setMsg("Uploaden mislukt.");
    setDraft({ ...draft, media_type: isVideo ? "video" : "image", media_url: signed.data.signedUrl });
  }

  if (draft)
    return (
      <section className="space-y-4 rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
        <h2 className="font-display text-xl font-bold text-ink">{draft.id ? "Artikel bewerken" : "Nieuw artikel"}</h2>
        <label className="block text-sm font-semibold text-moss">
          Titel
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="mt-1" />
        </label>
        <label className="block text-sm font-semibold text-moss">
          Webadres-naam (laat leeg voor automatisch)
          <Input value={draft.slug} placeholder={slugify(draft.title)} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} className="mt-1" />
        </label>
        <label className="block text-sm font-semibold text-moss">
          Korte samenvatting (zichtbaar in het overzicht)
          <Textarea rows={2} value={draft.excerpt} onChange={(e) => setDraft({ ...draft, excerpt: e.target.value })} className="mt-1" />
        </label>
        <div className="text-sm font-semibold text-moss">
          Foto of video
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <input type="file" accept="image/*,video/*" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            {uploading && <span className="font-normal">Bezig met uploaden…</span>}
            {draft.media_url && (
              <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, media_url: null, media_type: null })}>
                Verwijder media
              </Button>
            )}
          </div>
          {draft.media_url && (
            <BlogMedia type={draft.media_type} url={draft.media_url} alt="" controls className="mt-3 aspect-video w-full max-w-md rounded-xl" />
          )}
        </div>
        <div className="block text-sm font-semibold text-moss">
          Artikeltekst (witregel = nieuwe alinea; selecteer tekst en kies een opmaakknop)
          <BodyEditor value={draft.body} onChange={(body) => setDraft({ ...draft, body })} />
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-moss">
          <input type="checkbox" checked={draft.published} onChange={(e) => setDraft({ ...draft, published: e.target.checked })} />
          Gepubliceerd op Duurzaam nieuws
        </label>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <div className="flex gap-2">
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending || uploading}>Opslaan</Button>
          <Button variant="outline" onClick={() => { setDraft(null); setMsg(null); }}>Annuleren</Button>
        </div>
      </section>
    );

  return (
    <section className="space-y-4 rounded-2xl bg-background p-5" style={{ boxShadow: "var(--shadow-panel)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Duurzaam nieuws</h2>
          <Link to="/duurzaam-nieuws" target="_blank" className="text-sm text-leaf hover:underline">Bekijk de openbare pagina</Link>
        </div>
        <Button onClick={() => { setMsg(null); setDraft(empty); }}>Nieuw artikel</Button>
      </div>
      {msg && <p className="text-sm text-moss">{msg}</p>}
      {posts.isError && <p className="text-sm text-destructive">Artikelen konden niet worden geladen.</p>}
      {posts.data?.length === 0 && <p className="text-sm text-moss/70">Nog geen artikelen.</p>}
      <ul className="divide-y divide-border">
        {posts.data?.map((p) => (
          <li key={p.id} className="flex items-center gap-4 py-3">
            <BlogMedia type={p.media_type} url={p.media_url} alt="" className="h-14 w-20 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{p.title}</p>
              <p className="text-xs text-moss/70">{p.published ? "Gepubliceerd" : "Concept"}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setMsg(null); setDraft({ ...p }); }}>Bewerken</Button>
            <Button size="sm" variant="ghost" onClick={() => confirm(`"${p.title}" verwijderen?`) && remove.mutate(p.id)}>Verwijderen</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
