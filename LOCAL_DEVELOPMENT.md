# Lokaal ontwikkelen met Lovable Cloud

## Bestaande omgeving behouden

Lovable synchroniseert `main` van `jaapaalderink-spec/home-savings-explorer-86`.
Het bestaande Supabase-project-ID is `pektxnjzyhsscxikksqq`.
Database, gebruikers en connectors blijven bij de bestaande Lovable Cloud-omgeving.

Frontend en servercode kunnen allebei lokaal worden bewerkt. Volgens het door
de gebruiker gedeelde Lovable-antwoord zijn `SUPABASE_SERVICE_ROLE_KEY`,
`LOVABLE_API_KEY` en de connectorwaarde `MAPBOX_API_KEY` niet beschikbaar voor
ondersteund lokaal gebruik. Serverfuncties die deze vereisen worden in Lovable
getest. Probeer deze waarden niet uit de runtime te halen.

## Installeren en starten

Gebruik Bun met het bestaande lockbestand:

```sh
bun install --frozen-lockfile
bun run dev -- --host 127.0.0.1 --port 8080
```

`npm ci` faalt momenteel doordat `package-lock.json` achterloopt op
`package.json`. De gecontroleerde Bun-installatie slaagde met Bun 1.4.2.
Wijzig geen pakketversies of lockbestanden alleen om npm te laten installeren.

De getrackte `.env` bevat de publieke Supabase-instellingen en de browsertoken
voor Mapbox. Lokale overrides mogen in `.env.local`, dat door Git wordt genegeerd.
Het bestand `.env.local.example` bevat uitsluitend uitleg en een optioneel voorbeeld.
Voeg nooit serversleutels toe aan `.env` of andere getrackte bestanden.

## Controles

```sh
npm run build
npm run test -- --exclude '**/*.integration.test.ts'
```

Deze npm-scripts kunnen na installatie met Bun worden gebruikt: ze voeren de
lokaal geïnstalleerde tools uit. Een geslaagde build bevestigt geen werkende
backendverbinding. Inloggen, rechten, kaarten en serveracties moeten afzonderlijk
worden getest. Privileged serveracties en gateway-geocoding vereisen Lovable.
Integratietests vereisen aanvullende databasecredentials en kunnen gegevens wijzigen;
voer die niet als lokale smoke test tegen de bestaande database uit.

## Wijzigingen terug naar Lovable

1. Werk op een aparte branch, bijvoorbeeld `codex/local-setup`.
2. Controleer diff, build en unit tests. Controleer dat er geen secrets meegaan.
3. Push de werkbranch en maak een pull request naar `main` voor beoordeling.
4. Voeg de goedgekeurde wijzigingen samen zonder bestaande gepushte geschiedenis
   te herschrijven. Gebruik geen force push.
5. Controleer in Lovable dat de synchronisatie voltooid is en test de preview.
   Een GitHub-werkbranch wordt niet automatisch de Lovable-preview: Lovable blijft
   verbonden met `main`.
6. Publiceer pas na de functionele controle en de beslissing van de gebruiker.

Previewtests kunnen echte gegevens wijzigen. Spreek concrete testgevallen af voor
offertes, facturatie, SMS en andere schrijfacties voordat die worden uitgevoerd.
Git synchroniseert code; het kopieert geen beheerde credentials of connectoraccounts.
