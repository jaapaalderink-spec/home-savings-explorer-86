import { Fragment, type ReactNode } from "react";

// Eenvoudige opmaak: "## " = tussenkop, "**tekst**" = vet, "- " = opsomming, witregel = nieuwe alinea.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function BlogBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n{2,}/).filter((b) => b.trim());
  return (
    <div className="space-y-4 leading-relaxed text-ink">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ""))}</li>)}
            </ul>
          );
        }
        if (lines.length === 1 && /^#{2,3} /.test(lines[0])) {
          const h3 = lines[0].startsWith("### ");
          const text = inline(lines[0].replace(/^#{2,3} /, ""));
          return h3 ? (
            <h3 key={i} className="pt-2 font-display text-xl font-bold text-ink">{text}</h3>
          ) : (
            <h2 key={i} className="pt-4 font-display text-2xl font-bold text-ink">{text}</h2>
          );
        }
        return <p key={i} className="whitespace-pre-line">{inline(block)}</p>;
      })}
    </div>
  );
}
