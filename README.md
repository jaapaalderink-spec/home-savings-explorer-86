# Home Savings Explorer

Lovable-prompt: visuele homepage "Bespaar op je huis"

Dit document bevat een reeks prompts die je na elkaar in Lovable plakt. Elke fase bouwt voort op de vorige. Plak eerst het Contextblok, daarna Fase 1, wacht tot Lovable klaar is, controleer het resultaat, en ga pas dan door naar de volgende fase. Zo voorkom je dat Lovable in één keer te veel probeert te doen en houd je grip op het eindresultaat.

De bestaande route-/sectiestructuur van het project hoeft hierbij niet gerespecteerd te worden: dit wordt een nieuwe, op zichzelf staande homepage-ervaring.

Contextblok (eenmalig plakken, vóór Fase 1)

Context van het project — lees dit als achtergrondinformatie, bouw er nog niets van:

Ik bouw een platform (Onafhankelijke Offerte) waar particulieren gratis en vrijblijvend
offertes kunnen vergelijken voor duurzame installaties: thuisbatterijen, zonnepanelen,
warmtepompen, airco's en laadpalen. Stack: Next.js, TypeScript, Tailwind CSS, Supabase.

Merkkleuren (Tailwind tokens, gebruik deze exact):
- ink: #17211b (donkere tekst/achtergrond)
- moss: #315642 (primaire donkergroene kleur)
- leaf: #4f8f62 (primaire actiegroene kleur, CTA's)
- sun: #f0b84f (accentkleur, highlights, badges)
- cloud: #f7f8f5 (lichte achtergrond)
- schaduw "panel": 0 12px 40px rgba(23, 33, 27, 0.08) — zachte kaartschaduw

Ik heb al een werkende rekenmodule voor thuisbatterij-advies. Het patroon van die module is
leidend voor hoe we straks per categorie een indicatieve besparing berekenen. Het patroon is:

1. Een object met vaste aannames (bv. actieve zonuren per jaar, efficiëntie, maximale waarden).
2. Kleine pure functies die op basis van input-variabelen een correctie teruggeven
   (bijv. + of - kWh op basis van verbruiksprofiel, toekomstplannen zoals EV/warmtepomp/airco).
3. Een berekening van een praktische waarde (wat past nu al goed) en een bandbreedte
   min–max (praktisch tot toekomstbestendig), met clamp()- en roundToStep()-achtige helpers
   zodat uitkomsten altijd binnen realistische grenzen en op nette stappen vallen.
2. Een self_consumption_before / self_consumption_after achtig voor-en-na-effect: wat is de
   situatie nu, wat verbetert er met deze maatregel.
3. Een confidence-niveau (low/medium/high) afhankelijk van hoe compleet de input is.
4. Een lijst van "explanationReasons": korte, mensvriendelijke zinnen die uitleggen waarom
   dit advies past bij deze specifieke situatie, gebruikt om een lopende adviestekst te bouwen.
5. Badges/labels die tonen voor welke situaties dit advies extra geschikt is (bv. "dynamisch
   energiecontract", "elektrische auto gepland", "noodstroom gewenst").

Dit patroon (aannames → correcties → bandbreedte → voor/na → confidence → uitleg → badges)
moet straks hergebruikt worden voor de andere categorieën op de homepage: zonnepanelen,
warmtepomp, elektrische auto (laadpaal), energy home management system (EHMS) en airco.
Op de homepage hoeft dit geen 100% nauwkeurige berekening te zijn zoals in de volledige
wizard verderop in de site — het is een lichte, visuele, indicatieve versie die nieuwsgierig
maakt en doorverwijst naar de volledige offerteaanvraag-wizard voor een preciezer advies.

Bevestig dat je deze context begrijpt, bouw nog niets.


Fase 1 — Visueel fundament: het huis met hotspots (geen logica, alleen UI)

Bouw een nieuwe homepage-hero met een groot, visueel huis in het midden van het scherm,
met daaromheen (of als hotspots op het huis zelf) 6 klikbare categorieën:

1. Zonnepanelen (dak van het huis)
2. Warmtepomp (buitenunit naast het huis)
3. Thuisbatterij (bijv. in de garage of berging)
4. Elektrische auto / laadpaal (oprit)
5. Energy Home Management System / EHMS (bij de meterkast, subtiel, "brein" van het huis)
6. Airco (aan de gevel of in een raam)

Vereisten:
- Gebruik een custom SVG-illustratie van een vrijstaand/rijtjeshuis in moderne, vriendelijke
  vectorstijl, passend bij de merkkleuren (ink, moss, leaf, sun, cloud). Geen stockfoto's.
- Elke categorie is een interactieve hotspot: een subtiel pulserende marker (sun-kleur) op de
  juiste plek op/naast het huis, met een icoon (gebruik lucide-react iconen waar passend,
  bijv. Sun, Zap, Car, Snowflake, Cpu/Gauge voor EHMS, BatteryCharging).
- Hover op desktop en tap op mobiel toont een klein label met de categorienaam en een kort
  zinnetje ("Zonnepanelen — bespaar tot X% op je energierekening").
- Klikken op een hotspot opent een side panel of modal (bouw de lege/placeholder versie nu al,
  vullen we in Fase 2) met de categorienaam als titel.
- Onder/naast het huis: een aparte, duidelijk onderscheiden kaart of knop "Kies je
  energiecontract" (vast, dynamisch, variabel, onbekend) — dit is geen hotspot op het huis
  zelf maar een zevende, gelijkwaardige keuze in dezelfde visuele stijl.
- Volledig responsive: op mobiel wordt het huis kleiner weergegeven met de hotspots die
  logisch herschikken (evt. het huis boven, de 6 categorieën als tegels/chips eronder, met
  visuele lijn naar het huis).
- Gebruik de panel-schaduw en cloud-achtergrond voor rust; ink en moss voor tekst; leaf voor
  primaire acties; sun uitsluitend als accent (hotspot-pulse, badges, kleine highlights).
- Voeg een korte intro-headline en subheadline toe boven het huis, bijvoorbeeld:
  "Zie in één oogopslag hoeveel je kunt besparen" / "Klik op je huis en ontdek per maatregel
  wat het jou oplevert — vrijblijvend en binnen 2 minuten."

Bouw dit als losstaande homepage, negeer bestaande routes/secties in het project.


Fase 2 — Interactieve invoerpanelen per categorie (nog geen echte berekening)

Vul de 6 hotspot-panelen en het energiecontract-paneel uit Fase 1 met korte invoerformulieren
(2 tot 4 velden per categorie, zo min mogelijk drempel, gebruik sliders, toggles en grote
keuze-tegels in plaats van kale tekstvelden waar mogelijk):

- Zonnepanelen: aantal panelen (slider), jaarlijks stroomverbruik in kWh (slider met
  vriendelijke stappen), heb je al zonnepanelen (ja/nee toggle).
- Warmtepomp: type woning (rijtjeshuis / hoekwoning / vrijstaand / appartement — tegels),
  huidige verwarming (gas / elektrisch / anders), bouwjaar (slider).
- Thuisbatterij: jaarlijks stroomverbruik (kWh), jaarlijkse teruglevering (kWh), belangrijkste
  doel (bespaling / dynamisch handelen / zelfconsumptie / noodstroom — meerdere kiesbaar als
  tegels, exact zoals de bestaande batterijwizard dat al doet).
- Elektrische auto: rijd je al elektrisch of overweeg je het (toggle: nu / binnen 2 jaar /
  nog niet), geschatte jaarkilometrage (slider).
- EHMS: aantal slimme apparaten/systemen in huis dat je wilt combineren (zonnepanelen,
  batterij, laadpaal, warmtepomp — multi-select tegels), heb je een dynamisch contract
  (ja/nee/weet niet).
- Airco: aantal ruimtes dat gekoeld/verwarmd moet worden (slider), type woning (herbruik
  dezelfde tegels als bij warmtepomp indien al ingevuld).
- Energiecontract: 4 grote keuze-tegels (vast, dynamisch, variabel, weet ik niet) met een
  korte uitleg per type.

Sla per categorie de ingevulde waarden op in React state op paginaniveau (nog geen backend,
nog geen echte berekening) zodat waarden bewaard blijven als de gebruiker tussen panelen
wisselt. Toon onderaan elk paneel alvast een placeholder-resultaatkaart met skeleton/loading
stijl en de tekst "Bereken je besparing" als knop — deze knop doet in deze fase nog niets
functioneels, dat bouwen we in Fase 3.

Houd de visuele stijl en merkkleuren aan uit het contextblok.


Fase 3 — De echte rekenlogica: hetzelfde patroon als de batterijmodule

Implementeer nu voor elk van de 6 categorieën een eigen lichte calculatiemodule
(bijv. lib/home-savings/solar.ts, heat-pump.ts, battery.ts, ev.ts, ehms.ts, airco.ts),
gebouwd volgens exact hetzelfde patroon als onze bestaande thuisbatterij-adviesmodule:

1. Een const-object bovenaan het bestand met alle vaste aannames voor die categorie
   (bijv. voor zonnepanelen: gemiddelde opbrengst per paneel per jaar, huidige gemiddelde
   stroomprijs per kWh, terugverdientijd-aannames; voor warmtepomp: gemiddelde
   gasbesparing per type woning en bouwjaar; voor EV: gemiddeld verbruik per km en
   besparing t.o.v. brandstof; voor EHMS: gemiddeld besparingspercentage per gekoppeld
   systeem; voor airco: gemiddeld verbruik per ruimte).
2. Kleine pure helperfuncties (clamp, roundToStep) — identiek qua signatuur aan de
   bestaande battery-capacity module, hergebruik dezelfde helpers waar mogelijk via een
   gedeeld bestand lib/home-savings/shared.ts.
3. Een hoofdfunctie calculate<Categorie>Advice(input) die teruggeeft:
   - een praktische geschatte jaarlijkse besparing in euro's (afgerond op nette stappen),
   - een bandbreedte (min–max) in plaats van één hard getal,
   - een "voor/na"-indicatie waar relevant (bijv. huidig energieverbruik vs. verwacht
     verbruik na de maatregel),
   - een confidence-niveau (low/medium/high) gebaseerd op hoe compleet de invoer is,
   - 2 tot 4 korte explanationReasons-zinnen die het advies toelichten in mensentaal,
   - badges die tonen voor welke situatie dit extra interessant is.
4. Sluit de energiecontract-keuze aan als een correctiefactor die meetelt in de batterij-
   en EHMS-berekening (dynamisch contract verhoogt bijvoorbeeld de geschatte besparing,
   net zoals in de bestaande batterijmodule energyContractType al meeweegt).

Koppel de "Bereken je besparing"-knoppen uit Fase 2 aan deze functies. Toon het resultaat
in de resultaatkaart met:
- het geschatte besparingsbedrag per jaar (bandbreedte, niet één hard getal),
- een korte lopende adviestekst opgebouwd uit de explanationReasons,
- de confidence weergegeven als subtiel label ("indicatie op basis van beperkte gegevens" /
  "goede inschatting" / "sterke inschatting"),
- de badges als kleine pills in sun/moss kleuren.

Voeg duidelijk zichtbaar (maar niet opdringerig) de disclaimer toe: "Dit is een indicatieve
berekening. Voor een preciezer advies op maat, vraag gratis en vrijblijvend offertes aan."


Fase 4 — Totaaloverzicht en doorverwijzing naar de volledige wizard

Voeg onderaan de homepage een samenvattend "Jouw bespaarpotentieel"-blok toe dat automatisch
verschijnt zodra de gebruiker minstens 1 categorie heeft berekend (uit Fase 3):

- Een overzichtskaart per ingevulde categorie met het berekende bespaarbedrag.
- Een opgeteld totaal geschat jaarlijks besparingspotentieel bovenaan dit blok, groot en
  visueel prominent (leaf-kleur, met subtiele animatie die het bedrag laat "optellen").
- Eén duidelijke primaire call-to-action-knop: "Vraag gratis offertes aan voor jouw situatie"
  die doorlinkt naar de bestaande offerteaanvraag-wizard, met de al ingevulde gegevens
  (woningtype, verbruik, gekozen categorieën, energiecontract) meegegeven als query params of
  via gedeelde state, zodat de gebruiker in de wizard niet alles opnieuw hoeft in te vullen.
- Een secundaire, minder prominente link "Nog niets ingevuld? Begin direct met de volledige
  wizard" voor gebruikers die de homepage-verkenning willen overslaan.

Zorg dat dit blok subtiel binnenschuift/fade-in doet zodra er data is, in plaats van meteen
zichtbaar te zijn — dit houdt de eerste indruk van de homepage rustig en visueel gefocust op
het huis.


Fase 5 — Afwerking, animatie en performance

Poets de homepage af:

- Voeg zachte micro-animaties toe: hotspots pulseren subtiel (sun-kleur, lage frequentie,
  niet afleidend), panelen openen met een soepele slide/scale-transitie, resultaatkaarten
  tellen bedragen op met een korte tel-animatie.
- Zorg voor toegankelijkheid: elke hotspot is ook via toetsenbord bereikbaar (tab-volgorde,
  focus-states in sun/leaf), voldoende kleurcontrast op cloud-achtergrond, alt-teksten op de
  SVG-onderdelen.
- Controleer dat de hele flow ook zonder JavaScript-animaties (prefers-reduced-motion)
  prettig werkt.
- Optimaliseer voor mobiel: test dat alle 7 keuzes (6 categorieën + energiecontract) prettig
  bedienbaar zijn met duim-bereik op een telefoonscherm.
- Voeg lichte social proof toe boven de fold of net onder de hero (bijv. "Vergelijk gratis en
  vrijblijvend offertes van gecontroleerde installateurs"), zonder de visuele rust van het
  huis te verstoren.


Tip voor gebruik

Werk de fasen één voor één af en vraag Lovable na elke fase expliciet om een korte samenvatting van wat er gebouwd is, voordat je de volgende fase plakt. Wil je liever alles in één keer laten bouwen, dan kun je Contextblok + Fase 1 t/m 5 ook achter elkaar in één prompt plakken — het risico is dan wel dat Lovable minder precies is per onderdeel.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ce8873fc-1f49-4391-90b1-2662ce557dd0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
