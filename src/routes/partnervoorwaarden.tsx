import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { COMPANY } from "@/components/legal/company";

const URL = "https://home-dreams-visualizer.lovable.app/partnervoorwaarden";

export const Route = createFileRoute("/partnervoorwaarden")({
  head: () => ({
    meta: [
      { title: "Partnervoorwaarden, Onafhankelijke Offerte" },
      { name: "description", content: "Voorwaarden voor installateurs die aanvragen ontvangen via Onafhankelijke Offerte: levering, tarieven, facturatie en opzegging." },
      { property: "og:title", content: "Partnervoorwaarden, Onafhankelijke Offerte" },
      { property: "og:description", content: "Voorwaarden voor installateurs die aanvragen ontvangen via Onafhankelijke Offerte: levering, tarieven, facturatie en opzegging." },
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
    <LegalPage title="Partnervoorwaarden" updated="16 november 2026">
      <p>
        Deze voorwaarden gelden voor elk installatiebedrijf (de partner) dat via {c.tradeName} aanvragen ontvangt.
        {" "}{c.tradeName} ({c.street}, {c.postcode} {c.city}, KvK {c.kvk}) biedt dit platform aan.
        Afspraken in een individuele contractversie gaan voor deze voorwaarden.
      </p>
      <h2>1. Aanmelding en goedkeuring</h2>
      <p>
        Een partner meldt zich aan met een geldig KvK-nummer. Wij beoordelen elke aanmelding en kunnen deze zonder
        opgaaf van reden weigeren. Pas na goedkeuring en vastlegging van het abonnement ontvangt de partner aanvragen.
      </p>
      <h2>2. Levering van aanvragen</h2>
      <ul>
        <li>Een aanvraag wordt aan maximaal 3 installateurs geleverd. Aanvragen zijn dus niet exclusief.</li>
        <li>Levering vindt plaats binnen het ingestelde werkgebied, de diensten en de capaciteit van de partner.</li>
        <li>Wij streven naar een eerlijke verdeling, maar garanderen geen minimum aantal aanvragen.</li>
      </ul>
      <h2>3. Tarieven</h2>
      <p>
        De partner betaalt een vaste maandelijkse bijdrage, eventuele extra accountmanagerplekken en een vergoeding
        per geleverde aanvraag, met een toeslag per extra product in dezelfde aanvraag. De geldende bedragen staan in
        de contractversie van de partner. Alle bedragen zijn exclusief btw.
      </p>
      <h2>4. Facturatie en betaling</h2>
      <ul>
        <li>Wij factureren maandelijks achteraf, op basis van de facturatievorm in het contract: werkelijk geleverde aanvragen of een vast pakket.</li>
        <li>De betaaltermijn is 14 dagen. Betalen kan via iDEAL (Mollie) of bankoverschrijving.</li>
        <li>Na het verstrijken van de termijn sturen wij een herinnering.</li>
        <li>Bij 2 of meer vervallen, onbetaalde facturen pauzeren wij de levering van nieuwe aanvragen. Na betaling wordt de levering automatisch hervat. De vaste kosten blijven tijdens een pauze gelden.</li>
      </ul>
      <h2>5. Gebruik van gegevens</h2>
      <p>
        De partner gebruikt de gegevens van consumenten uitsluitend om de betreffende aanvraag op te volgen. Doorverkopen,
        delen met derden of gebruiken voor andere marketing is niet toegestaan. De partner handelt volgens de AVG en
        neemt binnen redelijke termijn contact op met de consument.
      </p>
      <h2>6. Kwaliteit</h2>
      <p>
        Wij meten reactiesnelheid en behandelen klachten van consumenten. Bij herhaalde klachten of misbruik mogen wij
        de levering beperken, pauzeren of het account sluiten.
      </p>
      <h2>7. Looptijd en opzegging</h2>
      <p>
        Een nieuw contract heeft een minimale looptijd van 6 maanden en loopt daarna voor onbepaalde tijd door, met een
        opzegtermijn van 1 maand. Bij beëindiging vóór het einde van de minimale looptijd blijven de resterende vaste
        kosten verschuldigd volgens de facturatievorm in het contract, plus alle geleverde aanvragen.
      </p>
      <h2>8. Aansprakelijkheid en recht</h2>
      <p>
        Onze aansprakelijkheid is beperkt tot het bedrag dat de partner in de 3 maanden voor de schade aan ons heeft
        betaald, behalve bij opzet of grove nalatigheid. Op deze voorwaarden is Nederlands recht van toepassing.
        Geschillen worden voorgelegd aan de bevoegde rechter in Noord-Nederland.
      </p>
    </LegalPage>
  );
}
