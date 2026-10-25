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
- [ ] Ingelogde eindcontrole — previewsessie is ongeldig; opnieuw inloggen nodig. Maandafsluiting/concurrency alleen in afgesproken geïsoleerde testomgeving.

## Aanvulling 22 oktober 2026 — Partnerportaal en testomgeving
- [x] Bestaande ketens onderzoeken; aanvullend uitvoeringsplan ter beoordeling aangeboden
- [ ] Leadinstellingen: primaire productbudgetten, combinatievoorkeur en serverberekende kosten
- [ ] Herstelbare productstatussen, afzonderlijke gewonnen bedragen, dossiersamenvatting en concurrencycontrole
- [ ] Accountmanagerresultaten met gedeelde filters, cohorten en verantwoordelijke perspectieven
- [ ] Beschermde testcontext, deterministisch scenario, testfacturen en afgeschermde providers
- [ ] Admin-testbeheer, dry-run en hervatbare cleanup bouwen; nu geen cleanup uitvoeren
- [ ] Gerichte regressietests, ingelogde controles en korte handleiding; echte providercontrole alleen met testcredentials
