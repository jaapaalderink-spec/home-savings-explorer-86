# Aanvulling registratie en partnerbeheer

Behoud accounts, aanvragen, contracthistorie, facturen, calculator en bestaande Lovable Cloud.

## Uitvoering
1. Sluit de leadmarkt op schermen, serveracties en database; bewaar historische aankopen.
2. Bescherm facturen: afgesloten maanden in Europe/Amsterdam, onveranderlijke uitgegeven regels, één transactie per bedrijfsmaand en unieke prijsboekingen op basis van opgeslagen leveringsprijzen. Geen herberekening van oude documenten.
3. Bouw drie registratiestappen met beveiligde concepten, bestaande e-mailverificatie, kaart, kostenbevestiging en eenmalige activering; uitnodigingen pas na akkoord.
4. Voeg individuele capaciteit en primaire/productverantwoordelijkheid toe aan de bestaande toewijzing; borg toegang, passende diensten/regio, eigenaarspool en gecontroleerde overdracht.
5. Gebruik één gevalideerde selectie voor resultaten, totalen, taken en exports; bewaar filters zonder consumentgegevens in de URL.
6. Voeg handmatige voorstellen toe met afzonderlijke rechten, grove locatie, 48 uur geldigheid, partnerakkoord en transactionele levering tegen de overeengekomen bundelprijs.
7. Werk kostenteller, maandafsluiting, documenten en communicatie bij; controleer voorschotten vóór overgang van oude contracten. Beoogde overgangsdatum: 1 november 2026, geen automatische of retroactieve omzetting.

## Controles
Behoud bestaande tests en voeg concrete commerciële en toegangsregels toe. Voer lokale unit tests uit zonder integratietests. Controleer schermen op desktop en mobiel. Geen echte betalingen, SMS, e-mails of testschrijfacties naar bestaande klantgegevens.

## Technische aansluiting
Hergebruik `allocate_lead_bundle`, `subscription_versions`, `lead_purchases`, product-CRM, uitnodigingen, audit en Mollie. Alleen noodzakelijke additieve wijzigingen; geen nieuw backend of parallel financieel systeem. Houd GitHub-synchronisatie en publicatie gescheiden; geen publicatie tijdens deze opdracht.