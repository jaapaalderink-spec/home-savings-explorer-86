import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { CookieBanner } from "@/components/legal/CookieBanner";
import { CONSENT_DEFAULTS } from "@/lib/consent-defaults";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { getSiteTags } from "@/lib/site-tags.functions";
import { gtagBootstrap, gtmBootstrap, type SiteTags } from "@/lib/site-tags";

function siteTagScripts(t: SiteTags | undefined) {
  if (!t) return [];
  const out: Array<{ src?: string; async?: boolean; children?: string }> = [];
  if (t.gtm_container_id) out.push({ children: gtmBootstrap(t.gtm_container_id) });
  const gtagIds = [t.ga_measurement_id, t.ads_conversion_id].filter((x): x is string => !!x);
  if (gtagIds.length) {
    out.push({ src: `https://www.googletagmanager.com/gtag/js?id=${gtagIds[0]}`, async: true });
    out.push({ children: gtagBootstrap(gtagIds) });
  }
  return out;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  staticData: { sitemap: false },
  loader: () => getSiteTags(),
  staleTime: 5 * 60_000,
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Onafhankelijke Offerte, vergelijk gratis offertes" },
      { name: "description", content: "Vergelijk gratis en vrijblijvend offertes voor zonnepanelen, warmtepompen, thuisbatterijen, airco's en laadpalen." },
      { name: "author", content: "Onafhankelijke Offerte" },
      { property: "og:title", content: "Onafhankelijke Offerte" },
      { property: "og:description", content: "Vergelijk gratis offertes van gecontroleerde installateurs." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Onafhankelijke Offerte" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "google-site-verification", content: "k-qb943p-lAE_YwuQ0H3SJm7qgFEZzRAVMwuw3ES3b0" },
      ...(loaderData?.search_console_token
        ? [{ name: "google-site-verification", content: loaderData.search_console_token }]
        : []),
    ],
    scripts: [{ children: CONSENT_DEFAULTS }, ...siteTagScripts(loaderData)],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <SiteFooter />
      <CookieBanner />
      <Toaster />
    </QueryClientProvider>
  );
}
