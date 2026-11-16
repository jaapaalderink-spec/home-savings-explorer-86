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
  const mail = "administratie@onafhankelijke-offerte.nl";
  return (
    <LegalPage title="Privacyverklaring" updated="16 november 2026">
      <h2>Wie zijn wij?</h2>
      <p>
        {c.tradeName} is een handelsnaam van {c.legalName}, {c.street}, {c.postcode} {c.city}, KvK-nummer {c.kvk}.{" "}
        {c.legalName} is verantwoordelijk voor de verwerking van persoonsgegevens die in deze verklaring wordt
        beschreven. Je bereikt ons via <a href={`mailto:${mail}`}>{mail}</a>.
      </p>

      <h2>Waarvoor gebruiken wij je gegevens?</h2>
      <ul>
        <li><strong>Een besparing berekenen.</strong> We gebruiken de woning-, installatie- en energiegegevens die je invult, zoals verbruik, contracttype, leverancier, tarieven en gekozen maatregelen, om de door jou gevraagde indicatieve berekening te maken. Je kunt de calculator gebruiken zonder een offerte aan te vragen.</li>
        <li><strong>Een offerteaanvraag verwerken.</strong> We gebruiken je naam, e-mailadres, telefoonnummer, adresgegevens, gekozen maatregelen en relevante aanvraaggegevens om je aanvraag te verwerken, aan installateurs te koppelen en je over de voortgang en de toegewezen installateurs te informeren.</li>
        <li><strong>Aanvragen controleren en misbruik voorkomen.</strong> We verifiëren je telefoonnummer per sms. Bij het uploaden van een jaaropgave gebruiken we een gehashte weergave van je IP-adres om misbruik van die functie tegen te gaan. Ons gerechtvaardigd belang is het beveiligen van het platform en het tegengaan van nepaanvragen en misbruik.</li>
        <li><strong>Een partneraccount beheren.</strong> We verwerken bedrijfsgegevens, KvK-nummer, gegevens van contactpersonen en gebruikers, inlog- en sessiegegevens en factuur- en betaalgegevens voor accountbeheer, het leveren van aanvragen en facturatie. Dit doen we om de partnerovereenkomst uit te voeren. Voor de fiscale administratie verwerken we de noodzakelijke gegevens ook om aan een wettelijke verplichting te voldoen. Voor zakelijke contactpersonen die zelf geen contractspartij zijn, is ons gerechtvaardigd belang het onderhouden van het zakelijke contact en het beheren van de overeenkomst.</li>
      </ul>
      <p>
        Voor de berekening, het optionele uitlezen en de offertebemiddeling, inclusief statusmails, gebruiken we de
        informatie die nodig is om de gevraagde dienst uit te voeren of op jouw verzoek stappen te zetten vóór het
        sluiten van een overeenkomst over die dienst. Zonder de verplichte gegevens in het offerteformulier en zonder
        sms-verificatie kunnen we je aanvraag niet doorzetten. Een jaaropgave uploaden is optioneel: je kunt gegevens
        ook zelf invoeren.
      </p>

      <h2>Een jaaropgave uploaden</h2>
      <p>
        Als je een jaaropgave of energierekening uploadt, gebruiken we een AI-functie via Lovable om relevante
        energiegegevens uit te lezen. Je kunt de uitgelezen waarden controleren en corrigeren. Als je daarna een offerte
        aanvraagt, worden de overgenomen waarden onderdeel van je aanvraag.
      </p>
      <p>
        Wij bewaren het oorspronkelijke bestand niet in ons aanvraagdossier en delen het niet met installateurs. Voor het
        uitlezen wordt het document tijdelijk verwerkt.
      </p>

      <h2>Met wie delen wij je gegevens?</h2>
      <p>
        Pas nadat je zelf een offerteaanvraag hebt verstuurd en je telefoonnummer per sms hebt bevestigd, kunnen wij je
        aanvraag delen met maximaal <strong>drie aangesloten installateurs</strong> die de aanvraag kunnen opvolgen. Bij
        alleen gebruik van de calculator delen we je gegevens niet met installateurs.
      </p>
      <p>
        De installateur kan je naam, e-mailadres, telefoonnummer, postcode, huisnummer en woonplaats zien, samen met de
        aangevraagde maatregelen. Afhankelijk van wat je hebt ingevuld, kan de aanvraag ook het woningtype, bouwjaar,
        type energiecontract, type verwarming, jaarlijks stroom- en gasverbruik, aantal zonnepanelen, informatie over een
        elektrische auto, jaarkilometrage en batterijcapaciteit bevatten.
      </p>
      <p>
        Installateurs betalen ons voor ontvangen offerteaanvragen. We delen de gegevens zodat zij jouw aanvraag kunnen
        opvolgen en een offerte kunnen maken. Voor zover een installateur zelfstandig bepaalt hoe hij contact met je
        opneemt en zijn offerte afhandelt, is die installateur verantwoordelijk voor die verwerking en geldt ook zijn
        eigen privacyverklaring.
      </p>
      <p>
        We maken gebruik van dienstverleners voor hosting en database, het uitlezen van jaaropgaven via Lovable,
        sms-verificatie, e-mail en betalingen door partners via Mollie. Waar een leverancier als verwerker optreedt,
        maken we afspraken over hoe die persoonsgegevens in onze opdracht verwerkt. Wij verkopen je gegevens nooit.
      </p>

      <h2>Hoe lang bewaren wij gegevens?</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-moss/20"><th className="py-2 pr-4 font-semibold text-ink">Gegevens</th><th className="py-2 font-semibold text-ink">Bewaartermijn</th></tr></thead>
          <tbody className="[&_td]:border-b [&_td]:border-moss/10 [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
            <tr><td>Offerteaanvragen, inclusief daarin overgenomen energiegegevens</td><td>Zolang nodig voor afhandeling en klachten, maximaal twee jaar na de aanvraag.</td></tr>
            <tr><td>Gegevens voor misbruikpreventie bij uploads van jaaropgaven</td><td>Uiterlijk twee dagen.</td></tr>
            <tr><td>Partneraccounts met factuurhistorie</td><td>Na beëindiging zeven jaar, voor zover de gegevens nodig zijn voor de financiële administratie en om facturen aan de juiste partner te kunnen koppelen.</td></tr>
            <tr><td>Fiscale basisgegevens, waaronder facturen</td><td>Zeven jaar volgens de fiscale bewaarplicht.</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Cookies en bezoekersstatistieken</h2>
      <p>
        We gebruiken noodzakelijke browseropslag om partners en beheerders ingelogd te houden. Die opslag is bedoeld om
        het account te laten werken.
      </p>
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
        Als wij Google Analytics of Google Ads inschakelen, vragen wij daar vooraf je toestemming voor. Bij weigering
        blijven deze diensten uit. Intrekken van je toestemming verandert niets aan de verwerking die daarvóór
        rechtmatig plaatsvond.
      </p>

      <h2>Je rechten en contact</h2>
      <p>
        Je kunt vragen om inzage, correctie, verwijdering, beperking of overdracht van je persoonsgegevens, voor zover
        dat recht op jouw situatie van toepassing is. Je kunt bezwaar maken tegen verwerking op basis van ons
        gerechtvaardigd belang. Voor verwerking op basis van toestemming kun je die toestemming intrekken.
      </p>
      <p>
        Mail naar <a href={`mailto:${mail}`}>{mail}</a>. We reageren uiterlijk binnen één maand. Bij een ingewikkeld
        verzoek kan de termijn met maximaal twee maanden worden verlengd. Als dat nodig is, laten we je dat binnen de
        eerste maand weten en leggen we uit waarom. Je kunt ook een klacht indienen bij de{" "}
        <a href="https://autoriteitpersoonsgegevens.nl/" target="_blank" rel="noreferrer">Autoriteit Persoonsgegevens</a>.
      </p>
      <p>
        We beschermen persoonsgegevens onder meer met versleutelde verbindingen, toegangsbeperking per partner en
        tweestapsverificatie voor beheerders.
      </p>
    </LegalPage>
  );
}
