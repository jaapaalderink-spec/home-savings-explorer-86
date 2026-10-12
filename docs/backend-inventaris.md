# Fase 0 — Inventaris backend (12-10-2026)

## Huidige situatie
- **Bedrijven:** 545 (`companies`), met `company_products` (diensten + monthly_max) en `company_regions` (postcodegebied 2 cijfers).
- **Rollen:** `user_roles` met admin / owner / account_manager; bedrijf via `profiles.company_id`. 1 eigenaar, 1 beheerder.
- **Aanvragen:** 151 (`leads`), producten als array `categories`, telefoonverificatie, fraude-/duplicaatcontrole.
- **Toewijzing:** `allocate_lead_to_company` (transactioneel), max 2 of 4 partners (`lead_type`), kwaliteitsranking.
- **Prijzen nu:** €50 (2 partners) / €40 (4 partners), eerste 10 leads gratis, bundeltegoed via `monthly_lead_limit`, `monthly_fee_ex_vat`.
- **Facturatie:** 45 facturen, `invoice_lines`, creditnota's CN-JJJJ-NNNNNN, `financial_events`, Mollie-betalingen met webhook.
- **Audit:** `audit_events`, `lead_purchase_status_history` (append-only).
- **Pagina's:** /, /offerte, /resultaat, /bedankt, /auth, /dashboard (leads, markt, team, prestaties), /facturen, /admin.
- **Koppelingen:** Mollie, Twilio (SMS), Mapbox (geocoding/kaart), Lovable AI.

## Koppeling eisen → aanpak
| Eis | Aanpak |
|---|---|
| Rollen platform/bedrijf | Uitbreiden: `user_roles` blijft platformrol; nieuw `memberships` + `member_permissions` |
| Uitnodigingen | Nieuw: `invitations` (tokenhash, verloop, eenmalig) |
| Werkgebieden straal/provincie/NL | Migreren: `company_regions` blijft voor oude data; nieuw `service_areas` met PostGIS |
| Contract/quotum/prijzen | Nieuw: `subscription_versions`, `quota_ledger`; oude velden blijven voor lopende contracten |
| Max 4 ontvangers ooit | Nieuw: `request_recipient_registry` |
| Deeltoewijzing per product | Nieuw: `allocation_products` naast `lead_purchases` |
| Planner | Vervangt ranking alleen voor nieuwe contracten |
| Leadmarkt | Uitgeschakeld voor nieuwe aanvragen |
| Facturen centen, ledger | Uitbreiden: bestaande facturen/creditnota's + `debtor_ledger` |
| CRM per product | Uitbreiden `lead_purchases` + `quotes`, `crm_events` |
| Voorbeeldweergave | Nieuwe read-only serverroute |
| Outbox/jobs | Nieuw: `outbox` |

## Overgang
Lopende bedrijven houden €50/€40 en de gratis-leadactie tot een expliciete overgangsdatum per contractversie. Nieuwe regels (€25 platform, €15 per accountmanagerplek, €15 lead + €10 per extra product, max 4 bedrijven) gelden voor nieuwe contracten.
