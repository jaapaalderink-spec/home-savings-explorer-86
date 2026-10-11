# Slimme geïntegreerde bespaarcalculator

## Fase 1 — Analyse: wat er al is

Er bestaat al een centrale rekenmodule (versie 1) die de basis goed neerzet:

- **Eén gedeeld woningprofiel** voor alle vijf maatregelen, met validatie en standaardwaarden. Het reist mee naar de offerteaanvraag en wordt bij het insturen op de server opnieuw doorgerekend.
- **Bestaande installaties zitten in de uitgangssituatie** (panelen, batterij, warmtepomp, laadpaal, airco) en tellen niet als nieuwe besparing.
- **Besparing = kosten vóór − kosten ná**, uit één simulatie van het hele pakket.
- **Volgorde-onafhankelijke verdeling per maatregel** (Shapley over alle combinaties).
- Regels tegen dubbeltelling: de airco vervangt alleen gasverwarming die nog over is, de laadpaal vergelijkt dezelfde auto (thuis- of openbaar laden), en elektrische verwarming die al aanwezig is wordt eruit gehaald.
- Saldering kan aan of uit; negatieve uitkomsten blijven zichtbaar; 16 tests.

**Wat ontbreekt ten opzichte van de opdracht:**

1. Het rekent per **maand**, niet per uur. Dag/nacht wordt benaderd met één percentage. Een batterij kan daardoor een maand aan overschot "verplaatsen".
2. **Geen losse besparing per maatregel**, alleen de toegerekende bijdrage. Er is geen samenwerkingsverschil en er zijn geen adviesteksten over combinaties.
3. **Tarieven en aannames staan door de code verspreid**, zonder centraal instellingenbestand en zonder geldigheidsdatum. Kalenderjaar 2026/2027 is een vinkje in plaats van een jaarkeuze. Terugleverkosten worden niet apart gerekend.
4. **De invoerpanelen tonen alle technische velden tegelijk.** Er is geen "Weet ik niet" en niet zichtbaar wat geschat en wat opgegeven is. Er staan geen knoppen "Bekijk mijn totale voordeel" / "Vraag offertes aan" in elk paneel.
5. **Airco**: geen keuze tussen alleen koelen of ook verwarmen, en geen aantal ruimtes. Koelkosten worden nu als lagere besparing getoond in plaats van als comfortkosten.
6. **Warmtepomp**: isolatieniveau en "Laat adviseren" ontbreken. Vaste gaskosten worden niet behandeld.
7. **Batterij en paneelaantal**: geen keuzes 5/10/15 kWh of "Laat adviseren".
8. **Terugverdientijd** ontbreekt. Dat is terecht, want er zijn nog geen betrouwbare investeringsbedragen.
9. Er is geen apart resultatenscherm.

**Wat blijft:** de woningafbeelding, de huisstijl, de navigatie, het offerteformulier, de leadflow en de SMS-verificatie. De koppeling via de offertelink blijft ook, zodat oude links blijven werken. Er komt geen databasewijziging: het profiel gaat zoals nu als leesbare tekst in het notitieveld van de aanvraag.

## Fase 2 — Ontwerp

**Woningprofiel (uitbreiding, achterwaarts compatibel):** bestaande velden blijven. Nieuw:
- contracttype (vast/variabel/dynamisch/onbekend)
- terugleverkosten per kWh
- kalenderjaar (2026/2027+)
- isolatie (goed/gemiddeld/matig/onbekend)
- airco: aantal ruimtes, alleen koelen of ook verwarmen, aantal bestaande units, verwarmt de bestaande airco
- type bestaande warmtepomp
- laadlocatie nu (publiek/thuis/gemengd)
- "Laat adviseren" voor panelen, batterij en warmtepomptype

Elk veld krijgt een herkomstlabel: *opgegeven*, *afgeleid* of *geschat*. Oude links worden met standaardwaarden aangevuld.

**Centraal instellingenbestand** met tarieven, terugleverkosten, publiek laadtarief, rendementen, SCOP-tabel, profielen en de geldigheidsdatum. Alle waarden worden gemarkeerd als aanname. Er komen geen verzonnen actuele tarieven of subsidies in. Investeringskosten blijven leeg, dus er wordt geen terugverdientijd getoond tot ze zijn ingevuld.

**Rekenmodel: uurmodel met representatieve dagen.** Elke maand krijgt één werkdag van 24 uur, met een zonprofiel, een huishoudprofiel, een warmtevraag naar buitentemperatuur, laadmomenten (avond of slim overdag) en koeling 's middags. Per uur geldt de volgorde: zonnestroom gaat eerst naar direct verbruik, dan naar de batterij en de rest wordt teruggeleverd. De batterij houdt rekening met capaciteit, laadvermogen en rendement, laadt en ontlaadt nooit tegelijk en start elke dag opnieuw, dus er gaat geen overschot van zomer naar winter. Per uur wordt de energiebalans gecontroleerd. Saldering rekent per jaar (2026) en geldt niet vanaf 2027.

**Drie uitkomsten:**
- **los**: de maatregel apart ten opzichte van de huidige woning
- **pakket**: één simulatie van het geheel
- **bijdrage**: de Shapley-verdeling

Daarbij komt het samenwerkingsverschil, het pakket min de som van de losse besparingen. Koelkosten worden apart getoond als comfortkosten.

**Advies-generator:** eerlijke teksten op basis van berekende stromen. Bijvoorbeeld: zon + laadpaal met het aandeel zonnestroom in het laden, of een batterij met lage of negatieve opbrengst. Er komen geen percentages die niet uit de berekening volgen. Sturing die een energiemanagementsysteem of compatibele apparatuur vereist, wordt apart gemarkeerd.

## Fase 3 — Rekenmodule en tests
Splitsen in losse modules: profiel, instellingen, profielen, warmte, laden, batterij/net, kosten, scenario's en advies. Alle 24 testscenario's uit de opdracht komen erbij, plus tests voor onvolledige en onrealistische invoer. De bestaande 16 tests blijven en worden waar nodig aangepast aan het uurmodel.

## Fase 4 — Panelen koppelen
Per paneel komen er een korte intro, maximaal drie hoofdvragen met "Weet ik niet", vervolgvragen alleen als ze relevant zijn, een direct bijgewerkte indicatie en de twee knoppen. Wat al bekend is, wordt niet opnieuw gevraagd. Gekozen maatregelen krijgen een vinkje op de woning. "Mijn energiegegevens" opent alle velden, met het herkomstlabel erbij.

## Fase 5 — Resultaatoverzicht
Het compacte overzicht onder de woning wordt uitgebreid. Daarnaast komt een resultaatscherm, "Dit kunnen jouw energiemaatregelen opleveren", met:
- kosten vóór en na
- voordeel per jaar en per maand, met bandbreedte
- kaarten per maatregel (los en bijdrage, aanwezig of toevoegen)
- het samenwerkingsverschil met uitleg
- extra kosten
- de gebruikte aannames
- de knoppen "Vraag gratis offertes aan", "Pas mijn gegevens aan" en "Bekijk andere maatregelen"

De offerteknop gebruikt de bestaande leadflow.

## Fase 6 — Testen
Testen op desktop, tablet en mobiel, en de offerteaanvraag doorlopen tot vlak vóór het versturen. Er wordt geen echte lead verstuurd en er gaat geen SMS uit.

## Technische details
- `src/lib/home-savings/engine/`: `profile.ts` (zod-schema + herkomst), `config.ts`, `profiles.ts`, `heat.ts`, `ev.ts`, `grid.ts` (uurloop + batterij), `costs.ts`, `scenarios.ts` (32 combinaties gecachet, los/pakket/Shapley), `advice.ts`.
- `scenario.ts` blijft als façade (`calculateScenario`, `profileFromSearch`, `energyProfileSchema`), zodat `leads.functions.ts`, `offerte.tsx` en `offerte-params.ts` blijven werken.
- Profielstatus in `index.tsx` blijft de gedeelde status. Nieuwe route `src/routes/resultaat.tsx` leest het profiel uit de URL, net als `/offerte`.
- `docs/energy-calculator.md` wordt bijgewerkt naar versie 2.
