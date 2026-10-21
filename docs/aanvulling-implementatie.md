# Aanvulling registratie en partnerbeheer — gedeeltelijke uitvoering

## Uitgevoerd
- Leadmarkt verwijderd uit het dashboard; Mijn leads is het standaardoverzicht.
- Oude marktacties weigeren verzoeken; de gedeelde allocator weigert marktbron en een insertguard voorkomt omzeiling. 154 historische marktaankopen blijven bewaard.
- 170 bestaande factureerbare leveringsprijzen als onveranderlijke bronboekingen overgenomen; bestaande factuurverwijzingen behouden. Geen historische facturen herberekend of oude contracten omgezet.
- Eén service-only transactie per bedrijfsmaand vergrendelt bedrijf, leveringsboekingen en klachtstatus vóór de berekening, maakt regels, koppelt bronnen, verrekent bestaande open credits en geeft de factuur uit. Herhalen retourneert het bestaande document ongewijzigd.
- Alleen afgesloten kalendermaanden in Europe/Amsterdam zijn toegestaan. Beheer kiest standaard de vorige maand.
- Uitgegeven factuurbedragen, periode, nummer en regels zijn beschermd tegen wijzigingen; betaal- en creditstatus blijven via de bestaande financiële functies lopen.
- Factuurregels gebruiken opgeslagen leveringsprijzen in plaats van actuele contracttarieven. Voorlopige aanpassing van de zuivere rekenhelper ondersteunt vastgelegde custom bundelprijzen zonder toeslag; dit is nog geen werkende handmatige voorstel-flow.

## Migrations
- `0011_close_market_and_transactional_month_invoices.sql`
- `0012_lock_month_sources_before_totals.sql`

## Overgang
Beoogd 1 november 2026. Oude contracten zijn niet automatisch overgezet. Eerst voorschotten, reeds gefactureerde leveringen en historische capaciteitscredits reconciliëren. Bestaande documenten, ook eventuele oude concepten, worden niet automatisch herschreven.

## Controles
- 183 lokale unit tests geslaagd, integratietests uitgesloten.
- Nieuwe tests controleren Nederlandse maandgrenzen incl. zomertijd, €340 bij 15 leveringen/zes extra producten/twee seats, €280 bij 15 enkelproductleveringen/twee seats, €55 bij nul leveringen en custom €12 zonder toeslag.
- Previewcompilatie geslaagd. Alle contentpagina’s hebben eigen titel en social metadata.
- Read-only databasecontrole bevestigt afgesloten markt en bronvergrendeling vóór factuurtotalen.
- Browsercontrole kwam op /auth uit: ingelogd dashboard en financiële eindflow zijn niet geverifieerd. Geen facturen gegenereerd, betalingen gestart, aanvragen geopend, SMS of e-mails verstuurd als test.

## Nog niet uitgevoerd
Drie registratiestappen met beveiligde concepten; individuele capaciteit en producttoegang; gedeelde filters en volledige taken; handmatige voorstellen en akkoord; productverschilboekingen; zichtbare conceptcorrecties; seat-entitlements en kostenteller; PDF/e-mailaansluiting; voorschotreconciliatie en afgesproken transactionele eindtests. De aanvullende opdracht is nog niet afgerond.