import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { COMPANY } from "@/components/legal/company";

const URL = "https://onafhankelijke-offerte.nl/voorwaarden";

export const Route = createFileRoute("/voorwaarden")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Algemene voorwaarden, Onafhankelijke Offerte" },
      { name: "description", content: "De voorwaarden voor het gebruik van de calculator en het gratis aanvragen van offertes via Onafhankelijke Offerte." },
      { property: "og:title", content: "Algemene voorwaarden, Onafhankelijke Offerte" },
      { property: "og:description", content: "De voorwaarden voor het gebruik van de calculator en het gratis aanvragen van offertes via Onafhankelijke Offerte." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Page,
});

function Page() {
  const c = COMPANY;
  return (
    <LegalPage title="Algemene voorwaarden" updated="16 november 2026">
      <p>
        Deze voorwaarden gelden voor het gebruik van de website van {c.tradeName}
        ({c.street}, {c.postcode} {c.city}, KvK {c.kvk}).
      </p>
      <h2>1. Onze dienst</h2>
      <p>
        {c.tradeName} is een onafhankelijk vergelijkingsplatform. Wij brengen huiseigenaren in contact met installateurs
        voor onder meer zonnepanelen, warmtepompen, thuisbatterijen, airco's en laadpalen. Wij voeren zelf geen
        installaties uit en verkopen geen producten.
      </p>
      <h2>2. Gratis en vrijblijvend</h2>
      <p>
        Het gebruik van de calculator en het aanvragen van offertes is voor jou gratis. Je zit nergens aan vast. Wij
        worden betaald door de aangesloten installateurs.
      </p>
      <h2>3. Je aanvraag</h2>
      <ul>
        <li>Je aanvraag wordt doorgestuurd naar maximaal 3 installateurs in jouw regio.</li>
        <li>Je zorgt dat de gegevens die je invult juist en volledig zijn. Wij verifiëren je telefoonnummer per sms.</li>
        <li>Wij mogen aanvragen weigeren die onjuist, dubbel of misbruikend lijken.</li>
      </ul>
      <h2>4. Overeenkomst met de installateur</h2>
      <p>
        Een offerte, koop- of installatieovereenkomst komt rechtstreeks tot stand tussen jou en de installateur.
        {" "}{c.tradeName} is daarbij geen partij en is niet verantwoordelijk voor prijzen, levering, uitvoering of
        garantie van de installateur.
      </p>
      <h2>5. Berekeningen zijn indicatief</h2>
      <p>
        De besparingen die de calculator toont zijn schattingen op basis van jouw invoer, gemiddelde tarieven en
        aannames over regelgeving. De werkelijke besparing kan afwijken. Aan de uitkomsten kun je geen rechten ontlenen.
      </p>
      <h2>6. Aansprakelijkheid</h2>
      <p>
        Wij zijn niet aansprakelijk voor schade door het gebruik van de website of door handelen van installateurs,
        behalve bij opzet of grove nalatigheid van onze kant. Wettelijke rechten die je als consument hebt blijven
        onverminderd gelden.
      </p>
      <h2>7. Klachten en toepasselijk recht</h2>
      <p>
        Heb je een klacht over een installateur of over onze dienst, laat het ons weten. Wij nemen klachten mee in de
        beoordeling van installateurs. Op deze voorwaarden is Nederlands recht van toepassing. Hoe wij met je gegevens
        omgaan lees je in onze <a href="/privacy">privacyverklaring</a>.
      </p>
    </LegalPage>
  );
}
