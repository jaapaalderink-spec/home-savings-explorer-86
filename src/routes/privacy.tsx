import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";
import { COMPANY } from "@/components/legal/company";

const URL = "https://home-dreams-visualizer.lovable.app/privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacyverklaring, Onafhankelijke Offerte" },
      { name: "description", content: "Hoe Onafhankelijke Offerte omgaat met je persoonsgegevens, energiegegevens en geüploade jaaropgaven." },
      { property: "og:title", content: "Privacyverklaring, Onafhankelijke Offerte" },
      { property: "og:description", content: "Hoe Onafhankelijke Offerte omgaat met je persoonsgegevens, energiegegevens en geüploade jaaropgaven." },
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
    <LegalPage title="Privacyverklaring" updated="16 november 2026">
      <p>
        {c.tradeName} is een handelsnaam van {c.legalName}, gevestigd aan {c.street}, {c.postcode} {c.city},
        ingeschreven bij de KvK onder nummer {c.kvk}. Wij zijn verwerkingsverantwoordelijke voor de gegevens die
        je via deze website aan ons verstrekt.
      </p>
      <h2>Welke gegevens wij verwerken</h2>
      <ul>
        <li>Contactgegevens: naam, adres, postcode, huisnummer, woonplaats, telefoonnummer en e-mailadres.</li>
        <li>Woning- en energiegegevens: verbruik, tarieven, energieleverancier, contracttype en je gekozen maatregelen.</li>
        <li>Technische gegevens die nodig zijn om misbruik te voorkomen, zoals een versleutelde (gehashte) weergave van je IP-adres bij het uitlezen van een jaaropgave.</li>
        <li>Voor partners: bedrijfsgegevens, KvK-nummer, contactpersonen, inloggegevens en factuurgegevens.</li>
      </ul>
      <h2>Waarom wij deze gegevens verwerken</h2>
      <ul>
        <li>Om een indicatieve besparing te berekenen en je offerteaanvraag te koppelen aan installateurs (uitvoering van je verzoek).</li>
        <li>Om je telefoonnummer te verifiëren per sms en misbruik of nepaanvragen te voorkomen (gerechtvaardigd belang).</li>
        <li>Om je per e-mail te informeren over de status van je aanvraag en de installateurs die contact met je opnemen.</li>
        <li>Voor partners: het leveren van aanvragen, facturatie en accountbeheer (uitvoering van de overeenkomst en wettelijke plicht).</li>
      </ul>
      <h2>Jaaropgave uploaden</h2>
      <p>
        Upload je een jaaropgave of energierekening (PDF, JPG of PNG), dan wordt het bestand alleen tijdelijk in het
        werkgeheugen van onze server verwerkt. Een AI-dienst leest de relevante gegevens uit, waarna het bestand direct
        wordt verwijderd. Wij slaan het document niet op en installateurs krijgen het nooit te zien. Je controleert
        de uitgelezen gegevens altijd zelf voordat je verder gaat.
      </p>
      <h2>Met wie wij gegevens delen</h2>
      <ul>
        <li>Met maximaal 3 aangesloten installateurs in jouw regio die jouw aanvraag opvolgen. Zij ontvangen je contact-, woning- en energiegegevens en mogen deze alleen gebruiken voor jouw aanvraag.</li>
        <li>Met dienstverleners die ons helpen de website te laten werken: hosting en database, een AI-dienst voor het uitlezen van jaaropgaven, een sms-dienst voor verificatie, een e-maildienst en Mollie voor betalingen door partners. Met hen zijn verwerkersafspraken gemaakt waar dat nodig is.</li>
      </ul>
      <p>Wij verkopen je gegevens nooit aan derden.</p>
      <h2>Hoe lang wij gegevens bewaren</h2>
      <p>
        Aanvraaggegevens bewaren wij zolang nodig is om je aanvraag af te handelen en klachten te kunnen behandelen,
        maximaal 2 jaar na je aanvraag. Facturen en financiële gegevens van partners bewaren wij 7 jaar vanwege de
        wettelijke bewaarplicht. Gegevens voor misbruikpreventie bij jaaropgaven worden na uiterlijk 2 dagen verwijderd.
      </p>
      <h2>Cookies, opslag en bezoekersstatistieken</h2>
      <p>
        Wij gebruiken bezoekersstatistieken van Lovable. Die gebruiken geen cookies, slaan niets op je apparaat op,
        bewaren geen IP-adressen en herkennen geen bezoekers. Er wordt bijgehouden welke pagina's je bezoekt, waar je
        vandaan kwam, je land, browser, besturingssysteem en type apparaat, hoe lang je blijft, hoe snel pagina's laden,
        foutmeldingen en op welke knoppen en links je klikt. Dit wordt voor elke bezoeker vastgelegd. Gedetailleerde
        gegevens worden 90 dagen bewaard en dagelijkse samenvattingen een jaar. Lovable verzamelt deze gegevens voor
        ons. <a href="https://lovable.dev/privacy" target="_blank" rel="noreferrer">Het privacybeleid van Lovable</a> legt
        uit hoe het daarmee omgaat.
      </p>
      <p>
        Log je in als partner of beheerder, dan wordt je inlogsessie in je browser bewaard zodat je ingelogd blijft.
        Als wij Google Analytics, Google Tag Manager of Google Ads inschakelen, kunnen deze diensten cookies plaatsen en
        gegevens over je bezoek naar Google sturen. Wij vragen daar dan vooraf toestemming voor.
      </p>
      <h2>Je rechten</h2>
      <p>
        Je hebt het recht op inzage, correctie, verwijdering en overdracht van je gegevens, en je kunt bezwaar maken
        tegen of een beperking vragen van de verwerking. Stuur je verzoek naar ons via de contactgegevens hieronder;
        wij reageren binnen 4 weken. Ben je niet tevreden, dan kun je een klacht indienen bij de Autoriteit
        Persoonsgegevens.
      </p>
      <h2>Beveiliging en contact</h2>
      <p>
        Wij beveiligen je gegevens met versleutelde verbindingen, toegangsbeperking per partner en tweestapsverificatie
        voor beheerders. Vragen? Schrijf naar {c.legalName}, {c.street}, {c.postcode} {c.city}.
      </p>
    </LegalPage>
  );
}
