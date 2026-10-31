export type SiteTags = {
  ga_measurement_id: string | null;
  gtm_container_id: string | null;
  ads_conversion_id: string | null;
  search_console_token: string | null;
};

export const TAG_PATTERNS = {
  ga_measurement_id: /^G-[A-Z0-9]{4,20}$/,
  gtm_container_id: /^GTM-[A-Z0-9]{4,12}$/,
  ads_conversion_id: /^AW-[0-9]{6,15}$/,
  search_console_token: /^[A-Za-z0-9_-]{10,100}$/,
} as const;

/** Accepts a raw ID or a pasted Search Console meta tag; returns null for empty. */
export function normalizeTag(key: keyof SiteTags, raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (key === "search_console_token") {
    const m = v.match(/content=["']([^"']+)["']/);
    if (m) v = m[1];
  } else {
    v = v.toUpperCase();
  }
  if (!TAG_PATTERNS[key].test(v)) throw new Error(`Ongeldige waarde voor ${key}.`);
  return v;
}

/** Inline bootstrap for GA4 + Ads via gtag.js; IDs are pattern-validated so safe to embed. */
export function gtagBootstrap(ids: string[]): string {
  return [
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}",
    "gtag('js',new Date());",
    ...ids.map((id) => `gtag('config','${id}');`),
  ].join("");
}

export function gtmBootstrap(id: string): string {
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
}
