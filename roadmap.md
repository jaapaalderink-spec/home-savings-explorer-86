# Roadmap
- [x] Fase 0 — Inventaris (docs/backend-inventaris.md)
- [x] Fase 1 — Rollen, team, uitnodigingen
- [x] Fase 2 — Diensten, werkgebieden, kaart
- [x] Fase 3 — Contracten, quota, nieuwe toewijzing
- [x] Fase 4 — Facturatie, credits, Mollie
- [x] Fase 5 — CRM, statistieken, voorbeeldweergave
- [x] Fase 6 — Achtergrondtaken, beveiliging

## Aanvulling 19 oktober 2026
- [x] Bestaande implementatie onderzoeken en uitvoeringsplan vaststellen
- [ ] Drie registratiestappen met beveiligde concepten en kostenbevestiging
- [x] Leadmarkt uitschakelen met behoud van historische aankopen (scherm, serveracties en database afgesloten; 154 historische marktaankopen behouden)
- [ ] Individuele capaciteit, diensten, regio’s en transactionele overdracht
- [ ] Gedeelde filters, resultaten, taken en toegangscontrole
- [ ] Handmatige voorstellen met regio-/prijsakkoord en veilige levering
- [ ] Achteraf-maandafsluiting, unieke prijsboekingen en overgang zonder dubbeltelling (beoogd 1 november 2026; geen automatische omzetting oude contracten vóór voorschotcontrole)
- [x] Financiële basis — transactionele maandfactuur, Amsterdamse maandgrens, onveranderlijke uitgegeven regels en unieke leveringsboekingen
- [ ] Financiële aansluiting — productuitbreidingen, zichtbare conceptcorrecties, seat-entitlements, kostenteller, documenten en voorschotreconciliatie
- [ ] Regressietests en desktop-/mobiele controle; geen echte SMS/betalingen of ongeaccordeerde testschrijfacties
- [ ] Ingelogde eindcontrole — beschikbare sessie toont geen bestaand partnerdossier; opslag/refresh en concurrency wachten op een veilige testcontext. Geen bestaand bedrijf aangemaakt of gewijzigd tijdens controle.

## Aanvulling 22 oktober 2026 — Partnerportaal en testomgeving
- [x] Bestaande ketens onderzoeken; aanvullend uitvoeringsplan ter beoordeling aangeboden
- [ ] Leadinstellingen: primaire productbudgetten, combinatievoorkeur en serverberekende kosten
  - [x] Tabblad Leadinstellingen: aantallen per ontvanger × dienst, totalen, diensten/gebied/pauze per ontvanger, delegatie, kostenkaart; opslag + herladen gecontroleerd
  - [x] Verdeling in de database: primair product + ontvanger samen gekozen op resterend aandeel, langst niet bediend als tie-breaker, één plaats per aanvraag
  - [ ] Verdeling end-to-end met testlead en meerdere accountmanagers — wacht op veilige testcontext (sandbox mag geen testgebruikers/leads schrijven)
- [ ] Herstelbare productstatussen, afzonderlijke gewonnen bedragen, dossiersamenvatting en concurrencycontrole
  - [x] Atomaire opslag met revision, afzonderlijke winst, productbediening en afgeleide open/afgesloten samenvatting
  - [ ] Volledige controle van verwante rechten, historische samenvattingen en ingelogde opslag/refresh in veilige testcontext
  - [x] Serverinzage en klachten begrensd tot eigenaar/eigen toegewezen dossiers; bedrijfsfacturen en betaalacties eigenaar/beheer
- [ ] Accountmanagerresultaten met gedeelde filters, cohorten en verantwoordelijke perspectieven
- [ ] Beschermde testcontext, deterministisch scenario, testfacturen en afgeschermde providers
- [ ] Admin-testbeheer, dry-run en hervatbare cleanup bouwen; nu geen cleanup uitvoeren
- [ ] Gerichte regressietests, ingelogde controles en korte handleiding; echte providercontrole alleen met testcredentials
  - [x] 194 lokale unit tests geslaagd, integratietests uitgesloten; geen provider- of opruimacties uitgevoerd

## Pakketten, bundels en contractduur (31 oktober 2026)
- [x] Pakketten Start/Groei/Team + facturatiemodus per bedrijf (werkelijke levering / vast pakketbedrag) in contractversie en maandfactuur
- [x] Afkoopberekening vroeg stoppen volgens modus (€99 of volledig pakketbedrag × resterende maanden), met tests
- [x] Eenmalige leadbundels (3/5/10) kopen en verdelen (pas na pakketquotum, één quotabron per aanvraag)
- [x] Opzegwizard in partnerportaal (preview, bevestigen, intrekken) en afkoopregel op laatste maandfactuur
- [ ] Ingelogde controle van tab Abonnement en een testmaandfactuur in pakketmodus

## Google-koppelingen (31 oktober 2026)
- [x] Admin-tab voor Google Analytics, Tag Manager, Ads en Search Console (ID's + verificatietag), automatisch op de website geladen
