# Partnerportaal afronden en veilig testbaar maken

## Doel en behoud
Realiseer de vier verbeteringen uit de nieuwe opdracht: leadinstellingen met transparante kosten, herstelbare productuitkomsten, accountmanagerresultaten en veilig testbeheer. Breid het bestaande portaal uit; behoud calculator, dossiers, historische contracten, automatische verdeling, werkgebieden, audit en Mollie. Geen tweede CRM, financiële administratie of authenticatielaag. De gesloten leadmarkt blijft gesloten. Geen cleanup of publicatie uitvoeren tijdens deze opdracht.

## Vastgestelde uitgangssituatie
- Productdiensten en maxima bestaan, maar een bereikbaar scherm voor leadinstellingen ontbreekt. Nieuwe contracten negeren momenteel productmaxima; oude toewijzingen tellen oorspronkelijke aanvraagcategorieën mee. Een opgeslagen primair product en combinatievoorkeur ontbreken.
- Dashboardlimiet en gebruikte teller komen uit oude bedrijfsvelden en kunnen afwijken van de effectieve contractlimiet. €249 is een opgeslagen historisch bedrijfsbedrag, geen nieuwe algemene prijsregel; de geldigheid van individuele afspraken moet behouden en gecontroleerd worden.
- Algemene status en productstatus kunnen elkaar tegenspreken. Gewonnen is voor partners geblokkeerd voor herstel; gewonnen waarde wordt uit de laatste offerte afgeleid. Opslaan, audit en samenvatting zijn niet één gezamenlijke transactie.
- Productrapportage bestaat, maar accountmanagerattributie en begrensde dossierinzage ontbreken in de onderzochte CRM-keten.
- Maandfacturen en unieke leveringsboekingen bestaan. PDF-aansluiting, beschermde testherkomst, testnummering, providerafscherming en hervatbare cleanup ontbreken. Bestaande fictieve records zijn niet betrouwbaar technisch gemarkeerd.

## Uitvoering in volgorde

### 1. Leadinstellingen en kosten
- Voeg Leadinstellingen toe voor eigenaar of expliciet gemachtigde, met de vijf gevraagde diensten, aan/uit, gehele primaire maandbudgetten, geleverd/resterend, pauze en link naar bestaand werkgebied.
- Bewaar instellingen, combinatievoorkeur, effectieve datum en audit server-side. Toon bij opslaan wijzigingen en geldende kostenafspraken; controleer fouten en laad na refresh opnieuw.
- Bedrijfstotaal wordt de som van primaire productbudgetten. Individuele maxima verdelen dit totaal met expliciete eigenaarspool; een onpassende verdeling geeft een begrijpelijke melding. Houd operationele instellingen gescheiden van historische commerciële contractversies.
- Kies en bewaar vóór levering één primair product met beschikbare capaciteit; extra ingeschakelde, gebiedspassende producten verbruiken geen tweede bedrijfs- of individuele plaats. Bij geen combinatieakkoord lever alleen het primaire onderdeel. Nul kan geen primair slot leveren; extra onderdelen volgen uitsluitend expliciet combinatieakkoord en actieve diensten.
- Pas deze controles toe in automatische, retry- en handmatige levering, transactioneel in dezelfde allocator. Geen wijziging van historische leveringsprijzen of verzonnen historische primair-productkeuze.
- Gebruik één serverprijsbron in eurocenten voor registratie, kostenkaart en facturatie. Toon contractspecifieke vaste kosten, raming, btw, combinatievoorbeeld en werkelijk opgebouwde kosten apart. Behoud de verplichte achteraftekst en noem de raming geen vast bedrag of plafond.
- Verbind betaalde seat-entitlements aan bestaande uitnodigingen/contractregels; tel uitnodigingen niet ongemerkt anders in raming dan in facturatie.

### 2. Statusherstel en samenhangende dossiers
- Gebruik productuitkomsten als bron, één actuele statusbediening en aparte open/afgesloten dossierstaat. Ondersteun gedeeltelijk gewonnen zonder een tegensprekende onafhankelijke algemene status.
- Een algemene actie toont en laat kiezen welke producten wijzigen; een enkelproductactie past direct dat product aan.
- Alle statussen zijn herstelbaar binnen rechten. Heropenen vanuit Gewonnen/Verloren vraagt bevestiging en verplichte reden. Leg gewonnen bedrag excl. btw afzonderlijk per product vast; Offerte vereist bestaande geldige offertewaarde.
- Sla productwijziging, winstvervanging, audit met correlatie-ID en samenvatting atomair op met verwacht versienummer. Een conflict vraagt herladen; dubbel opslaan telt niet dubbel.
- Bewaar offerteversies en historische uitkomsten. Heropening verwijdert oude winst uitsluitend uit actuele rapportage, niet uit historie of financiële leveringskosten. Herbereken taken en ververs alle betrokken schermen na commit.

### 3. Accountmanagerresultaten en toegang
- Voeg Resultaten per accountmanager naast productresultaten toe, inclusief eigenaarspool/niet toegewezen en historische gedeactiveerde medewerkers.
- Deel periode-, product-, medewerker- en statusfilters tussen tabellen, totalen en export. Hoofdaccount ziet eigen team; accountmanager alleen eigen dossiers/resultaten tenzij expliciet extra leesrecht. Valideer dit ook bij rechtstreekse serveraanroepen.
- Toon unieke leads, productonderdelen, actuele statussen, open dossiers, offertesom, geregistreerde winst, conversie, sluitingspercentage en alleen aantoonbare eerste reactietijd.
- Gebruik standaard instroomcohort met actuele uitkomsten; bied omzet op winstdatum apart. Maak ontvangstverantwoordelijke, actuele opvolger en resultaatverantwoordelijke zichtbaar als verschillende perspectieven en tel ieder productresultaat eenmaal.
- Voeg ontbrekende taken en gecontroleerde overdracht toe aan het bestaande product-CRM. Ontbrekende gegevens krijgen geen verzonnen score.

### 4. Testscheiding vóór fixtures
- Gebruik een geïsoleerde ontwikkel-/testcontext indien beschikbaar, zonder het bestaande Cloud-backend te vervangen. Een Git-branch alleen is geen bewezen gegevensisolatie. Ook in een gedeelde omgeving eerst alle herkomst-, relatie- en providercontroles bouwen; nog geen scenario laden voordat die controles slagen.
- Voeg beschermde run-identiteit en synthetische herkomst toe aan de volledige relatieketen, met gesloten/gewiste-runregister. Weiger gemengde relaties en sluit testdata uit normale plannerkandidaten, financiële totalen, exports en consumentendossiers.
- Alle testbeheeracties vereisen bestaande adminrechten én tweestapsverificatie. Fixtureladen in productie standaard uitgeschakeld.
- Laat jobs/webhooks testcontext erven; blokkeer inactieve/gewiste runs. Test-Mollie kan uitsluitend testcredentials gebruiken; SMS en app-/authmails blijven in sink/sandbox. Zonder testcredentials uitsluitend zichtbaar gelabelde simulatie, geen claim van geteste providerintegratie.
- Onderzoek eerdere fictieve records op exacte herkomst en relaties; onzekere records blijven ongemarkeerd en zijn een expliciete cleanupblokkade. Geen classificatie op naam/notitie/e-mailpatroon.

### 5. Deterministisch scenario en financiële documenten
- Bouw idempotent laden/resetten voor één run met twee bedrijven, eigenaar plus twee accountmanagers bij het primaire bedrijf, vijf producten, combinaties, alle statussen, gedeeltelijke winst en heropening.
- Voeg offerteversies met afwijkende winst, bijna volle capaciteit, nulbudget, onderlevering, buitengebied en taken vandaag/achterstallig/later toe. Bouw ontbrekende handmatige voorstellen via bestaande levering met akkoord/weigering en overeengekomen totaalprijs.
- Gebruik relatieve taakdatums en vaste afgesloten factuurmaand september 2026. Leg exacte fixtureverwachtingen vast; nooit willekeurige actuele kalendermaanden of productiegegevens gebruiken.
- Genereer concept/open/betaald/verlopen/gedeeltelijk gecrediteerd en gekoppelde creditnota via dezelfde domeinlogica. Bouw de ontbrekende PDF-downloads met TEST-watermerk en aparte testnummerreeksen; behoud productieboeken en nummering.
- Controleer €355 raming, €280 bij 15 enkelproductleads, €340 bij 15 leads en zes extra onderdelen, steeds twee extra seats. Vijf niet-geleverde plaatsen zijn uitsluitend informatie. Leg betalingen, broncredit, verrekening, openstaand bedrag en tegoed sluitend vast.
- Gebruik bestaande veilige testauthenticatie/uitnodigingen; geen gedeelde hardcoded wachtwoorden of automatische adminrechten.

### 6. Eén beheeractie voor cleanup en livegangcontrole
- Bouw Testscenario laden, Tests uitvoeren, Testgegevens resetten en Testgegevens verwijderen voor livegang.
- Cleanup toont eerst een dry-run met geselecteerde runs, aantallen, gebruikers, documenten, jobs en blokkades. Bevestiging bindt aan de concrete gecontroleerde scope; geen opruiming nu.
- Stop/invalideer testjobs en callbacks, verwijder in afhankelijkheidsvolgorde uitsluitend aantoonbare synthetische records, documenten en exclusief synthetische gebruikers. Weiger echte afhankelijkheden en bescherm echte/gemengde memberships, eigenaar/adminaccounts en echte financiële/audithistorie.
- Gebruik hervatbare idempotente stappen voor gegevens, Auth, storage en externe testobjecten. Houd inhoudsvrij opschoonrapport en callbackblokkade buiten de verwijderde run. Verander financiële immutable-guards nooit globaal; alleen strikt gevalideerde synthetische cleanup mag uitzonderingen krijgen.
- Toon livegangcontrole voor jobs, resterende testdata, gescheiden credentials en fixtureladen. Dit publiceert niets automatisch.

## Technische aansluiting
Hergebruik `company_products`, `service_areas`, `subscription_versions`, `allocate_lead_bundle`, `lead_purchases`, product-CRM, offertes, uitnodigingen, audit, maandfactuur/creditfuncties en Mollie. Alleen additieve migrations met expliciete grants/RLS; bestaande data en documenten behouden. Auth en rechten op iedere servergrens, geen vertrouwen op UI of browseropslag. Schrijf structurele keuzes in AGENTS.md en houd roadmap bijgewerkt.

## Acceptatie en levering
- Behoud bestaande unit tests; voeg gerichte tests toe voor alle vijftien acceptatiepunten, inclusief nul/negatief/decimaal, multi-productquota, bedragen, heropening, onafhankelijke winst/offerte, concurrency, filters/rechten, fixture-idempotentie en cleanup/callbackveiligheid.
- Lokale unit tests zonder bestaande integratietests tegen het gedeelde backend. Financiële, provider- en cleanupintegraties alleen in aantoonbaar afgeschermde synthetische context; nooit echte betalingen, SMS of smoke-testwrites naar bestaande klanten.
- Controleer opslag/refresh en centrale gebruikersstromen ingelogd; controleer desktop en mobiel. Rapporteer afzonderlijk wat werkelijk getest is en wat op credentials of geschikte isolatie wacht.
- Lever een korte handleiding voor leadinstellingen, statusherstel, teamresultaten, testfacturen en cleanup. Ontbrekende externe testcredentials kunnen echte provideracceptatie blokkeren, niet de duidelijk gelabelde lokale simulatie.
- De eerdere registratieopdracht blijft op de roadmap; werk benodigde capaciteit, taken, voorstellen, seats en documentaansluiting mee in bovenstaande stappen. Geen automatische overgang van historische contracten op 1 november zonder voorschotreconciliatie.