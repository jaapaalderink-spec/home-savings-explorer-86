# Telefoonverificatie in de offerte-aanvraag

Doel: alleen aanvragen met een bewezen echt telefoonnummer gaan naar installateurs.

## Hoe het werkt voor de bezoeker

1. Stap 3 (contactgegevens) krijgt na het telefoonnummer een knop "Stuur code".
2. De bezoeker ontvangt een sms met een 6-cijferige code en vult die in het formulier in.
3. Bij een juiste code verschijnt een groen vinkje "Nummer bevestigd" en kan de aanvraag verstuurd worden.
4. Wordt de code niet ingevuld? De aanvraag wordt wel opgeslagen, maar krijgt de status "wacht op verificatie" en gaat niet naar installateurs. Na een geslaagde verificatie (ook later, via de link op de bedankpagina) wordt de aanvraag alsnog verdeeld.

Extra bescherming: maximaal 5 codeverzoeken per nummer per uur, code 10 minuten geldig, maximaal 5 pogingen per code.

## Overzicht voor jou

- In het beheerdersoverzicht en het partnerdashboard is te zien of een aanvraag geverifieerd is.
- Niet-geverifieerde aanvragen blijven zichtbaar voor jou, maar niet voor partners.

## Wat er technisch gebeurt

- Twilio koppelen via de connector (jij maakt het account aan; ik open de koppel-kaart). Verificatie loopt via Twilio Verify (`/verify/v2/Services/...`) door de connector-gateway, dus geen sleutels in de app.
- Eenmalig een Verify Service aanmaken bij Twilio; de service-SID slaan we op als projectgeheim `TWILIO_VERIFY_SERVICE_SID`.
- Twee server functions in `src/lib/phone-verify.functions.ts`: `startPhoneVerification` (nummer normaliseren naar E.164 NL, rate limit, Verify start) en `checkPhoneVerification` (code controleren, resultaat in een korte server-side sessie/token vastleggen). Server-only Twilio-aanroepen in `phone-verify.server.ts`.
- Rate limiting en verificatiestatus in een nieuwe tabel `phone_verifications` (nummer, hash van poging, teller, tijdstempels) met RLS: geen anon-toegang, alleen service-role.
- `submitLead` accepteert een verificatietoken. `insertLead` zet `phone_verified` op basis daarvan; de bestaande kolom wordt eindelijk gebruikt.
- `distributeLead` wordt alleen aangeroepen als `phone_verified` waar is; anders krijgt de lead status `new` en `distributed_at` blijft leeg. Nieuwe enum-waarde is niet nodig — een lead met `state = 'new'` en `phone_verified = false` telt als "wacht op verificatie".
- `src/routes/offerte.tsx`: codeveld, verzendknop, teller, foutmeldingen in het Nederlands; verzendknop blijft werken zonder code, met duidelijke melding dat de aanvraag pas doorgaat na bevestiging.
- Partnerqueries (`Marketplace`, `MyLeads`, verdeling) filteren op `phone_verified = true`; het adminoverzicht toont een kolom "Geverifieerd".

## Kosten en instellingen

Twilio Verify rekent per verificatie (enkele centen per sms in NL). Ik zet daarnaast in de tekst de aanbeveling om bij Twilio SMS Geo Permissions te beperken tot Nederland/België en SMS Pumping Protection aan te zetten, zodat misbruik geen hoge rekening oplevert.
