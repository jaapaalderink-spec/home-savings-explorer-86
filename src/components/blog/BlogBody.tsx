import ReactMarkdown from "react-markdown";

export function BlogBody({ body }: { body: string }) {
  return (
    <div className="space-y-4 leading-relaxed text-ink">
      <ReactMarkdown
        skipHtml
        components={{
          h1: ({ children }) => <h2 className="pt-4 font-display text-2xl font-bold text-ink">{children}</h2>,
          h2: ({ children }) => <h2 className="pt-4 font-display text-2xl font-bold text-ink">{children}</h2>,
          h3: ({ children }) => <h3 className="pt-2 font-display text-xl font-bold text-ink">{children}</h3>,
          p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ href, children }) => href ? (
            <a href={href} className="break-words text-leaf underline underline-offset-4 hover:text-moss">{children}</a>
          ) : <>{children}</>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
