# Complete backend Onafhankelijke Offerte — gefaseerd plan

De opdracht is te groot voor één stap en raakt bijna alles wat er al staat (prijzen, leadverdeling, facturen, rollen). Daarom in zes fases, elk apart te testen en goed te keuren. Bestaande aanvragen, betalingen, facturen en de calculator blijven ongewijzigd; nieuwe regels gelden alleen voor nieuwe contracten en periodes.

## Fase 0 — Inventaris (geen wijzigingen)
Overzicht van alle tabellen, pagina's, rollen, huidige prijsregels (€50/€40, eerste 10 gratis, max 2 of 4 partners) en koppelingen. Per eis uit de opdracht: hergebruiken, uitbreiden of migreren. Opgeleverd als document ter goedkeuring.

## Fase 1 — Rollen, team en uitnodigingen
- Platformbeheerder en platformmedewerker met losse rechten; eigenaar en accountmanager per bedrijf met begrensde rechten.
- Eenmalige, verlopende uitnodigingen; laatste eigenaar beschermd; niemand maakt zichzelf eigenaar of beheerder.
- Bevestiging vóór een betaalde plek: €15 p/m excl. btw, ingangsdatum, nieuw maandtotaal.
- Beheerdersaccount aanmaken om alles te kunnen testen.

## Fase 2 — Diensten, werkgebieden en kaart
- Per dienst: straal rond een plaats (1–250 km), provincies of heel Nederland.
- Afstand berekend in de database, plaats gekozen uit zoekresultaten.
- Dekkaart per product: dekking, capaciteit, vraag en tekortreden, met tabel ernaast.

## Fase 3 — Contracten, quota en nieuwe toewijzing
- Contractversies met quotum, plekken, basisprijs (€15) en toeslag per extra product (€10), ingang volgende maandgrens.
- Nieuwe planner: max. 4 bedrijven per aanvraag (ook na credit), één toewijzing per bedrijf met gebundelde producten, eerst maximale productdekking, daarna eerlijk op resterend quotum.
- Wachtrij met status volledig/gedeeltelijk/wachtend/niet leverbaar en herpoging tot 30 dagen.
- De leadmarkt stopt voor nieuwe aanvragen; handmatige toewijzing gebruikt exact dezelfde controles.

## Fase 4 — Facturatie, credits en Mollie
- Startfactuur (€25 platform + plekken × €15 + leadplaatsen × basisprijs), afsluiting met capaciteitscredit en aanvullende factuur voor extra producten.
- Bedragen in centen, debiteurenoverzicht, klanttegoed, idempotente maandafsluiting, PDF en verzending via wachtrij.
- Betaaltermijn 14 dagen, blokkade 14 dagen na vervaldatum (beide instelbaar).

## Fase 5 — CRM, statistieken en voorbeeldweergave
- Statussen Nieuw/Gebeld/Offerte/Gewonnen/Verloren per product, offerteversies, bedragen, vervolgdatum, verliesreden.
- Statistieken met filters en heldere conversiedefinitie.
- Alleen-lezen voorbeeldweergave voor beheer, gelogd, zonder in te loggen als installateur.

## Fase 6 — Achtergrondtaken en beveiliging
Takenwachtrij met herhaalpogingen en herstelscherm, tweestapsverificatie voor beheerders, beveiligingscontrole en tests per fase.

## Technische details
- Uitbreiden van bestaande tabellen (companies, profiles/user_roles, lead_purchases, invoices, credit_notes, payments, audit_events) in plaats van parallelle systemen; nieuwe tabellen voor memberships, permissions, invitations, service_areas, subscription_versions, quota_ledger, request_products, recipient_registry, allocation_products, outbox.
- Toewijzing, quota-afboeking, prijssnapshot, audit en outbox in één databasetransactie (uitbreiding van allocate_lead_to_company).
- PostGIS voor werkgebieden; bestaande Mapbox-koppeling voor geocoding.
- E-mail vereist een geverifieerd e-maildomein (nog niet ingesteld).

Na goedkeuring start ik met fase 0 en fase 1.
