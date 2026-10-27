export function BlogMedia({
  type,
  url,
  alt,
  controls = false,
  className = "",
}: {
  type: string | null;
  url: string | null;
  alt: string;
  controls?: boolean;
  className?: string;
}) {
  if (!url) return <div className={`bg-moss/10 ${className}`} aria-hidden />;
  if (type === "video")
    return controls ? (
      <video src={url} controls playsInline className={`bg-ink object-cover ${className}`} />
    ) : (
      <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className={`object-cover ${className}`} />
    );
  return <img src={url} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}

export function formatDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "";
}
