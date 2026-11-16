import { Link } from "@tanstack/react-router";
import { COMPANY } from "./company";
import { openCookieSettings } from "./CookieBanner";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-5 py-8 text-sm text-moss/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-ink">{COMPANY.tradeName}</p>
          <p>{COMPANY.street}, {COMPANY.postcode} {COMPANY.city}</p>
          <p>KvK {COMPANY.kvk}</p>
          <p><a href={`mailto:${COMPANY.email}`} className="hover:underline">{COMPANY.email}</a></p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link to="/privacy" className="hover:underline">Privacyverklaring</Link>
          <Link to="/voorwaarden" className="hover:underline">Algemene voorwaarden</Link>
          <Link to="/partnervoorwaarden" className="hover:underline">Partnervoorwaarden</Link>
          <button type="button" onClick={openCookieSettings} className="hover:underline">Cookie-instellingen</button>
        </nav>
      </div>
    </footer>
  );
}
