import { useRef, useState } from "react";
import { Bold, Heading2, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BlogBody } from "./BlogBody";
import { htmlToBody } from "./html-to-body";

export function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const apply = (kind: "h" | "b" | "ul") => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = value.slice(s, e);
    let out: string;
    if (kind === "b") out = `**${sel || "vetgedrukte tekst"}**`;
    else if (kind === "h") out = `\n\n## ${sel || "Tussenkop"}\n\n`;
    else out = "\n\n" + (sel || "Punt").split("\n").map((l) => `- ${l.replace(/^[-*] /, "")}`).join("\n") + "\n\n";
    const next = (value.slice(0, s) + out + value.slice(e)).replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
    onChange(next);
    requestAnimationFrame(() => el.focus());
  };

  return (
    <div className="mt-1 rounded-md border border-input">
      <div className="flex flex-wrap items-center gap-1 border-b border-input p-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => apply("h")} disabled={preview} title="Tussenkop"><Heading2 className="size-4" /> Kop</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => apply("b")} disabled={preview} title="Vetgedrukt"><Bold className="size-4" /> Vet</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => apply("ul")} disabled={preview} title="Opsomming"><List className="size-4" /> Opsomming</Button>
        <Button type="button" variant={preview ? "secondary" : "ghost"} size="sm" className="ml-auto" onClick={() => setPreview(!preview)}>
          {preview ? "Bewerken" : "Voorbeeld"}
        </Button>
      </div>
      {preview ? (
        <div className="min-h-64 p-3 text-sm font-normal"><BlogBody body={value} /></div>
      ) : (
        <Textarea
          ref={ref}
          rows={14}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            const html = e.clipboardData.getData("text/html");
            if (!html) return;
            const text = htmlToBody(html);
            if (!text) return;
            e.preventDefault();
            const el = e.currentTarget;
            const s = el.selectionStart, end = el.selectionEnd;
            onChange(value.slice(0, s) + text + value.slice(end));
          }}
          className="rounded-none border-0 font-normal focus-visible:ring-0"
        />
      )}
    </div>
  );
}
