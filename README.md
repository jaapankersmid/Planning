# Rooster

Een eigen personeelsplanning-app, gebouwd als vervanger voor Planning
V2.0.xlsx op Google Drive. De app is voorgeladen met de echte gegevens uit
dat bestand: 61 medewerkers (55 actief), de 16 shiftcodes uit de legenda,
en het volledige rooster van september 2026.

## Wat de app doet

- Eén overzichtelijk rooster in plaats van 12 maandtabbladen, met dezelfde
  shiftcodes en kleuren als nu.
- Inloggen met **zelf aangemaakte accounts** (e-mail + wachtwoord) — geen
  Google-account nodig om te kunnen inloggen. Een leidinggevende maakt de
  accounts aan bij "Gebruikers"; nieuwe accounts krijgen een tijdelijk
  wachtwoord en moeten er bij de eerste keer inloggen zelf één kiezen.
- **Los daarvan**, voor wie dat wil: een knop "Verbind met Google Calendar"
  bij "Mijn rooster". Wie dat aanzet, krijgt zijn/haar diensten
  **automatisch en (bijna) direct** in een aparte "Werkrooster"-agenda in
  Google Calendar — via een echte serverkoppeling, niet via de 8–24 uur
  vertraagde .ics-abonnementen die Shiftbase, Deputy en When I Work
  gebruiken. Inloggen en agenda-koppeling zijn dus twee losse dingen: geen
  Google-koppeling nodig om de app te kunnen gebruiken.
- Een automatisch berekend bezettingsoverzicht (aantal medewerkers aan het
  werk, aantal ochtend-/avonduitlaten per dag) — vervangt de handmatige
  tellingen bovenaan elk maandtabblad.
- Beheer van medewerkers, diensttypen en gebruikersaccounts.

## Wat de app (nog) niet doet

Bewust buiten scope gehouden, om een werkend startpunt te houden in plaats
van een half afgemaakt allesomvattend systeem:

- **Bezetting/Verdeling op basis van het aantal honden** (zoals in de
  tabbladen "Bezetting" en "Verdeling" van Planning V2.0) — dat vraagt een
  koppeling met het boekingssysteem van het pension, en is losstaand van
  de personeelsplanning zelf.
- Tijdregistratie/prikklok, verzuimregistratie, verlofaanvragen,
  rapportages en loonadministratie — dat is waar Shiftbase, Dyflexis en
  vergelijkbare tools het grootste deel van hun functionaliteit aan
  besteden. Deze app is bewust gericht op roosteren + agenda-sync.
- Wachtwoord vergeten via e-mail (er is geen e-mailverzending ingebouwd) —
  een leidinggevende kan wel altijd iemands wachtwoord resetten bij
  "Gebruikers".
- Een mobiele app (de webpagina werkt wel prima op een telefoon).

## Techniek

Next.js (App Router) + PostgreSQL via Prisma + eigen login (NextAuth met
een Credentials-provider, wachtwoorden gehasht met Node's ingebouwde
`crypto`-module, geen externe login-dependency) + Google Calendar API via
`googleapis` voor de losse agenda-koppeling. Alles staat in `src/`; het
datamodel staat in `prisma/schema.prisma`.

> **Belangrijk over deze codebase:** hij is geschreven en gecontroleerd op
> syntax, type-correctheid (op de Prisma-typen na, zie hieronder) en
> linting, maar **niet end-to-end getest tegen een echte database**, omdat
> de omgeving waarin hij gebouwd is geen toegang had tot Prisma's
> download-server voor de generator (`binaries.prisma.sh` was geblokkeerd
> door het netwerkbeleid van die omgeving). Zodra je op je eigen machine of
> bij de hostingpartij `npm install` draait, gebeurt dat automatisch wél
> (zie `postinstall` in package.json) en verdwijnen de type-foutmeldingen
> die je anders in de sandbox zou zien. Doe wel een eerste test met een
> paar accounts en diensten voordat je dit voor de hele planning gebruikt.
>
> `npm audit` meldt 4 "high"-advisories in `mysql2`/`deepmerge-ts` — dat
> zijn dependencies van de Prisma-CLI zelf (voor migraties/generatie), niet
> van de draaiende app, en mysql2 wordt hier niet eens gebruikt (we praten
> alleen met Postgres). Een `npm audit fix --force` zou terugzetten naar
> een oudere Prisma-hoofdversie — niet nodig, maar het staat je vrij.
>
> Om dezelfde reden kon `Dockerfile`/`docker-compose.prod.yml` (zie stap 3
> hieronder) niet in deze omgeving met een echte `docker build` getest
> worden — de opzet volgt Next.js' eigen self-hosting-documentatie en is
> een standaardpatroon, maar doe bij het eerste gebruik op de server rustig
> aan en kijk mee met `docker compose -f docker-compose.prod.yml logs -f`
> als er iets niet meteen opstart.

## 1. Lokaal draaien

Vereist: Node.js 20+, Docker (voor een lokale Postgres) of een eigen
Postgres-server.

```bash
npm install
cp .env.example .env
# vul .env in: DATABASE_URL, AUTH_SECRET, en de eerste beheerder
# (ADMIN_EMAIL/ADMIN_PASSWORD) — Google-gegevens mogen voorlopig leeg blijven,
# die zijn alleen nodig voor de Calendar-koppeling (zie stap 2)

docker compose up -d          # start een lokale Postgres
npx prisma db push                   # maakt de tabellen aan
npm run db:seed               # laadt medewerkers/diensten/september-rooster + eerste beheerder
npm run dev                   # http://localhost:3000
```

Log in met het e-mailadres en wachtwoord uit `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
Je wordt meteen gevraagd een eigen wachtwoord te kiezen. Maak daarna de
overige accounts aan bij "Gebruikers" — elk nieuw account krijgt een
tijdelijk wachtwoord dat je moet doorgeven (het wordt maar één keer
getoond).

Liever geen wachtwoord in `.env`? Laat `ADMIN_EMAIL`/`ADMIN_PASSWORD` dan
leeg en maak de eerste beheerder aan met:

```bash
npm run create-user -- --email=jaap@bedrijf.nl --name="Jaap" --role=ADMIN
```

## 2. Google Calendar-koppeling instellen (optioneel)

Dit is **niet nodig om de app te kunnen gebruiken** — alleen voor de knop
"Verbind met Google Calendar" bij "Mijn rooster".

1. Ga naar [console.cloud.google.com](https://console.cloud.google.com) en
   maak een nieuw project aan (bv. "Rooster").
2. Ga naar **APIs & services → Enabled APIs** en schakel de **Google
   Calendar API** in.
3. Ga naar **APIs & services → OAuth consent screen**. Kies "Extern" (of
   "Intern" als iedereen bij hetzelfde Google Workspace-domein hoort), vul
   de naam en je eigen e-mailadres in. Voeg bij "Scopes" de scope
   `https://www.googleapis.com/auth/calendar.app.created` toe (mag alleen de aparte agenda "Werkrooster" aanmaken en beheren). Zolang de app in
   "Testing"-status staat, moet je bij "Test users" elk Google-account
   toevoegen dat de koppeling mag gebruiken. Voor gebruik door een grotere
   groep zonder die beperking moet de app later bij Google worden
   "gepubliceerd" en eventueel geverifieerd.
4. Ga naar **APIs & services → Credentials → Create credentials → OAuth
   client ID**, type "Web application". Zet bij **Authorized redirect
   URIs**:
   - lokaal: `http://localhost:3000/api/google-calendar/callback`
   - productie: `https://<jouw-domein>/api/google-calendar/callback`
   Google accepteert hier **geen kaal IP-adres en geen http** (behalve
   localhost): zonder echte domeinnaam met https krijg je "Toegang
   geblokkeerd: autorisatiefout". Zet `AUTH_URL` in `.env` op dezelfde
   `https://<jouw-domein>`; de app bouwt het terugkeeradres daaruit.
5. Kopieer de **Client ID** en **Client secret** naar `.env` als
   `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Bij elke koppeling wordt bewust opnieuw om toestemming gevraagd
(`prompt: "consent"`) — dat is nodig om betrouwbaar een ververs-token te
krijgen, anders stopt de agenda-koppeling na een uur.

## E-mailmeldingen en beschikbaarheid

**Beschikbaarheid.** Iedere medewerker met een gekoppeld account kan onder *Beschikbaarheid* per dag aangeven: hele dag, alleen ochtend, alleen middag of niet beschikbaar (tikken op een dag wisselt door de keuzes heen). Verlofdagen (V) en dagen die al geweest zijn staan vast. De planner ziet dit als gekleurd stipje in elk vakje van het rooster; een rode rand betekent dat iemand is ingepland op een dag waarop hij of zij zich niet beschikbaar heeft gemeld.

**Mail bij inplannen.** Wijzigt de planner een dienst, dan wordt dat onthouden. Zodra het `NOTIFY_DELAY_MINUTES` (standaard 10) stil is, krijgt elke betrokken medewerker één mail met alle nieuwe en gewijzigde diensten. Medewerkers kunnen dit zelf uitzetten bij *Mijn rooster*. Instellen:

1. Zet `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` (en eventueel `SMTP_FROM`) in het `.env`-bestand op de server — zie `.env.example`. Gebruik poort 587 of 465; poort 25 is bij Hetzner geblokkeerd.
2. Herstart de app: `docker compose -f docker-compose.prod.yml up -d --force-recreate app`.
3. Open *Gebruikers* in de app en klik op *Stuur testmail naar mezelf*.

**Mail aan planners.** Planners krijgen meteen een mail bij een nieuwe verlofaanvraag, en één gebundelde mail (zelfde wachttijd) als een medewerker zijn beschikbaarheid heeft aangepast, met een waarschuwing als iemand al is ingepland op een dag waarop hij of zij zich niet beschikbaar meldt. Een planner kan dit voor zichzelf uitzetten bij *Mijn rooster*. Omgekeerd krijgt de medewerker meteen een mail als verlof wordt goedgekeurd, afgewezen of ingetrokken, of als een planner verlof voor hem of haar vastlegt (met de opmerking van de planner erbij); dit volgt dezelfde schakelaar bij *Mijn rooster* als de roostermails.

Nieuwe tabellen: na het updaten eenmalig `docker compose -f docker-compose.prod.yml exec app npx prisma db push` draaien.

## Mijn rooster: klik op een dienst om te ruilen of vrij te vragen

Op *Mijn rooster* staat **Mijn diensten** bovenaan. Een komende werkdienst is aan te klikken en opent een popup met twee keuzes:

- **Dienst ruilen**: het ruilformulier hieronder, met de aangeklikte dienst al gekozen. Dit kan voor diensten in de komende 8 weken.
- **Vrij vragen**: het verlofformulier, met de datum en de dienst al ingevuld.

Daaronder staan de **Ruilverzoeken**: verzoeken aan jou om te beantwoorden en je eigen verzoeken. Dit blok verschijnt alleen als er verzoeken zijn. Helemaal onderaan staan de *Google Calendar-koppeling* en de *E-mailmeldingen*.

Het verlofformulier is één formulier met drie keuzes. Het staat ook bij *Mijn verlof*:

- **Hele dag(en) vrij**: een periode, die bij goedkeuring V wordt.
- **Een dagdeel vrij**: alleen bij een gebroken dienst.
- **Een andere dienst**: een andere dienst op dezelfde dag.

Code: `src/components/my-shift-actions.tsx` (popup), `src/components/leave-request-form.tsx` (verlofformulier), `loadSwapOptions` in `src/components/shift-swaps.tsx`. Geen schemawijziging.

## Dienst ruilen

Op Mijn rooster klikt een medewerker op een eigen dienst (komende 8 weken), kiest *Dienst ruilen* en kiest een collega. Optioneel kiest hij een dienst van die collega die hij er voor terugkrijgt. De collega krijgt een mail en ziet het verzoek bij Mijn rooster; pas bij **Accepteren** wordt het rooster aangepast (met agenda-sync en de gewone roostermail) en krijgen de aanvrager en de planners een mail. Bij **Afwijzen** hoort alleen de aanvrager het.

- Gebroken dienst: ook alleen de ochtend of alleen de middag ruilen. Dat werkt via de losse dienst-typen met dezelfde tijden (X = XI + IX, Uit = UitO + UitA); bestaan die niet, dan kan alleen de hele dienst.
- Het rooster kent één dienst per medewerker per dag. Heeft de ontvanger die dag al een ochtenddienst en krijgt hij de middag erbij (of andersom), dan wordt het één gebroken dienst (XI + IX = X, UitO + UitA = Uit). Elke andere botsing wordt geweigerd.
- Staat de dienst bij het accepteren niet meer zoals bij het verzoek (de planner paste hem aan), dan vervalt het verzoek.
- Code: `src/lib/shift-swap.ts` (regels), `shift-swap-mail.ts` (mails), `rooster/mijn/ruilen-actions.ts`, `components/shift-swaps.tsx`. Databasemodel `ShiftSwapRequest`: draai `npx prisma db push`.

## Planvoorstel (alleen voor de eigenaar)

Menu Planner > Planvoorstel, alleen zichtbaar en bereikbaar voor het account jaapankersmid@gmail.com (`src/lib/auto-plan-access.ts`; pagina's geven voor anderen een 404 en elke actie controleert het opnieuw).

1. **Tags en kleurgroepen**: vink aan welke kleurgroepen meedoen, maak tags (Balie, Uitlaten, ...), koppel ze aan medewerkers en kies per tag welke dienst bij toepassen in het rooster komt (ochtend, middag, samen).
2. **Behoefte**: per week per tag en dagdeel hoeveel mensen er nodig zijn (handmatig; later vanuit het boekingsprogramma).
3. **Voorstel**: kies de periode; het voorstel verdeelt de plekken eerlijk: per kleurgroep krijgt degene met de minste uren eerst een dienst. Niet beschikbaar = geen opgave, onbeschikbaar, of al een hele dienst die dag (ook V/Z). Een hele bestaande dienst wordt nooit aangepast; een halve wel aangevuld (zie hieronder). Per regel kun je de persoon wijzigen of weghalen; pas bij "In het rooster zetten" verandert het rooster (met agenda-sync en roostermail).

Met "Bekijk in het rooster" komt het voorstel gestippeld omrand in het gewone rooster (alleen voor de eigenaar, alleen op vrije vakjes); daar kun je het ook toepassen of wissen. Model `PlanProposalItem`.

Bestaande diensten tellen mee voor de behoefte, op basis van **tijden**: bij elke tag vul je de tijden van de taak in (bv. uitlaten 08:00-10:00 en 15:30-17:00, balie 09:00-10:00 en 18:00-19:00, schoonmaken 08:00-12:30 en 15:30-19:30); leeg = de tijden van de bij het dagdeel ingestelde dienst. Alleen diensten van medewerkers **met de tag** tellen voor die taak. Een tijdsblok van een bestaande dienst (ook een lange als O 8:00-17:00 of A 10:30-19:30) dekt een taak als het de tijden van de taak helemaal omvat of als de dienst voor die taak is ingesteld. Een persoon kan niet twee taken tegelijk doen: overlappen de tijden van taken, dan telt het blok voor één taak; welke bepaalt de prioriteit van de tag. Alleen het tekort wordt aangevuld. In het voorstel staan de plekken die al ingeplande diensten vullen als grijze regels met naam en dienst ("al ingepland"); die veranderen niets.

**Halve dienst aanvullen.** Staat iemand al met alleen een ochtend- of middagdeel ingepland (bv. XI), dan kan het voorstel diegene het andere dagdeel geven. Dat kan als diegene daarvoor beschikbaar is, de tag heeft, en de dienst van de tag voor dat dagdeel er samen een bestaande gebroken dienst van maakt (XI + IX = X, zoals bij ruilen). Bij toepassen wordt de dienst dan samengevoegd (met agenda-sync en roostermail); in het rooster staat het voorstel gestippeld op het vakje ("XI wordt X"). Hele diensten, V en Z blijven altijd zoals ze zijn. Code: `halfPart` en `extendHalf` in `src/lib/auto-plan.ts`; geen schemawijziging. Diensten zonder tijden (V, Z) dekken niets. Nieuwe velden op `PlanTag` (`morningStart` enz.): draai `npx prisma db push`. Code: `coverFromShifts` in `src/lib/auto-plan.ts`.

**Prioriteit per tag.** Bij Tags en kleurgroepen staat voor elke tag een nummer met ▲/▼: bovenaan = hoogste prioriteit, nieuwe tags komen onderaan (veld `PlanTag.sortOrder`, geen schemawijziging). Het voorstel vult eerst alle plekken van de bovenste tag over de hele periode, dan de volgende: een harde volgorde, ook als lagere tags daardoor leeg of onderbezet blijven. Ook bij het meetellen van bestaande diensten gaat een dienst eerst naar de tag met de hoogste prioriteit. Boven het voorstel staat het blok **Niet vol gekomen**: per tag (op prioriteit) welke plekken open blijven en waarom, bv. "3 met deze tag: 1 heeft die dag al een dienst, 1 geen beschikbaarheid opgegeven, 1 al ingezet voor Balie".

Gerepareerd: een gebroken dienst (bv. X) die bij een tag als dienst voor "samen" is ingesteld, telde met beide blokken mee voor de ochtend én nog eens voor de middag, waardoor het voorstel te weinig mensen inplande. De ingestelde dienst telt nu alleen met het blok dat in de tijd bij de taak hoort.

Een persoon krijgt per dag één taak; ochtend en middag samen alleen als de tag een dienst voor "samen" heeft. Code: `src/lib/auto-plan.ts` (algoritme), `app/(app)/planvoorstel/`, `components/plan-proposal.tsx`. Databasemodellen `PlanTag`, `PlanTagEmployee`, `PlanNeed` en `ColorGroup.planParticipates`: draai `npx prisma db push`.

## Instellingen (bedrijfsgegevens en mail)

Menu *Instellingen → Instellingen*, alleen voor planners (rol ADMIN; de pagina en de opslaanactie controleren dat op de server). Een leeg veld gebruikt de waarde uit `.env`, en anders de standaard. Zolang er niets is ingevuld, werkt alles dus zoals voorheen. Wat je opslaat geldt meteen, zonder herstart: er is een cache van maximaal 30 seconden, die bij het opslaan wordt geleegd.

| In de app (Instellingen) | Terugval |
|---|---|
| Bedrijfsnaam | standaard "Bréborgh" (bovenaan in de app) |
| Adres, postcode en plaats, telefoon, e-mail, website | geen; zijn ze ingevuld, dan komen ze onderaan elke mail |
| SMTP-server, poort, beveiliging, gebruikersnaam | `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE`, `SMTP_USER` |
| Afzendernaam, afzenderadres | `SMTP_FROM`, anders de gebruikersnaam |
| Antwoordadres (Reply-To) | geen |
| Wachttijd gebundelde mails | `NOTIFY_DELAY_MINUTES` (10) |
| Feedback naar | `FEEDBACK_TO` |

**Blijft in `.env`.**
- *Geheimen*: `SMTP_PASSWORD`, `AUTH_SECRET`, `DATABASE_URL`, `POSTGRES_PASSWORD`, `GOOGLE_CLIENT_SECRET`, `SSO_SECRET` en `ADMIN_PASSWORD`. Het scherm toont alleen of ze "ingesteld" of "niet ingesteld" zijn, nooit de waarde.
- *Infrastructuur*: `AUTH_URL`, `DOMAIN`, `POSTGRES_USER`/`POSTGRES_DB`, `HUB_URL`/`HUB_INTERNAL_URL`, `NODE_ENV`, `GOOGLE_CLIENT_ID` en `CALENDAR_NAME` (een andere naam zou bij een nieuwe koppeling een tweede agenda maken). `ADMIN_EMAIL`/`ADMIN_NAME` gebruikt alleen de seed.
- De app-naam van de geïnstalleerde app (`manifest.ts`) blijft vast "Bréborgh Rooster".

**Dubbele bevestiging.** Opslaan gaat in twee stappen:
1. Je ziet een overzicht *oud → nieuw*, met een rode waarschuwing als je de mailinstellingen wijzigt, en vinkt aan dat je het hebt gecontroleerd.
2. Je vult je eigen wachtwoord in. Na 5 foute pogingen moet je een kwartier wachten.

Zonder beide stappen slaat de server niets op. Heeft iemand anders de instellingen intussen gewijzigd, dan wordt het opslaan geweigerd. Met **Testmail versturen** stuur je een mail naar je eigen adres, met de opgeslagen instellingen.

**Logboek.** Elke wijziging wordt vastgelegd: wie, wanneer, welke instelling en oud/nieuw. De laatste 30 staan onderaan de pagina. Er komen nooit geheimen in.

Code: `src/lib/settings.ts` (`getSettings`, `getMailConfig`, validatie), `src/app/(app)/instellingen/`, `src/components/settings-form.tsx`. Nieuwe tabellen `AppSetting` en `AppSettingChange`: draai `npx prisma db push`.

## Welkomstmail bij een nieuw account

Bij *Gebruikers → Nieuwe gebruiker* staat het vinkje **Welkomstmail sturen** (standaard aan). De nieuwe gebruiker krijgt dan een mail met de inloglink (`AUTH_URL`/login), het e-mailadres en het (tijdelijke) wachtwoord; moet het wachtwoord gewijzigd worden, dan staat erbij dat dat bij de eerste keer inloggen gebeurt. Lukt de mail niet of is SMTP niet ingesteld, dan wordt het account gewoon aangemaakt en zie je dat in de melding. Het wachtwoord komt nooit in de logs. Code: `src/lib/welcome-mail.ts`. Geen schemawijziging.

## Andere dienst gewerkt dan in het rooster

Bij *Mijn uren* kan de medewerker per dag (tot en met vandaag, zolang de week of maand niet is ingediend) onder *Dienst* kiezen **andere dienst?** en de dienst aanwijzen die hij of zij echt heeft gewerkt. Zo vang je fouten in het rooster op.

- De uren worden dan ingevuld met de uren van die dienst; aanpassen kan daarna nog. Terugzetten kan met *zoals rooster*.
- Het rooster zelf verandert niet. Dat blijft aan de planner, via `applyAssignment`.
- **Voor de administratie** is het duidelijk te zien:
  - in *Uren* staat bij de medewerker een oranje label *… dagen andere dienst*;
  - in de dagtabel is de dag oranje gemarkeerd, de roosterdienst doorgestreept, met het label *medewerker: A gewerkt*;
  - de export per dag heeft een kolom *Gewerkte dienst volgens medewerker*.
- De administratie kan de keuze ook zelf aanpassen. Ziek (Z) staat er niet tussen; dat zet alleen de planner.
- Code: veld `TimeEntry.workedShiftTypeId`, `writeEntry` in `src/lib/timesheets.ts`, `src/components/timesheet-table.tsx`.

> Schemawijziging: nieuw veld `workedShiftTypeId` op TimeEntry. Draai `npx prisma db push` (alleen toevoegen, geen dataverlies).

## Mail over goedgekeurde en aangepaste uren

- **Goedkeuren.** Keurt de administratie (of een planner) een week of maand goed, dan krijgt de medewerker meteen één mail met de uren per dag en het totaal. Bij de week staat daarvoor een veld *Opmerking voor de mail (optioneel)*; bij de maand gaat de opmerking van *Beoordelen* mee. Na het goedkeuren staat in de melding of de mail is verstuurd, mislukt is, of dat er geen mail kon (geen actief account met e-mailadres, of mail niet ingesteld). De goedkeuring blijft in alle gevallen staan.
- **Aanpassen na goedkeuring.** Past de administratie uren aan in een al goedgekeurde week of maand, dan komt per dag de nettowijziging in een wachtrij (tabel `HoursChange`). Na de wachttijd uit *Instellingen* (dezelfde als de roostermail) gaat er per medewerker per week één mail uit met per dag oud → nieuw, het weektotaal oud → nieuw, wie het aanpaste en wanneer. Zet je een dag terug naar de oude uren, dan vervalt die regel; verandert alleen de opmerking van een dag, dan komt er geen mail. Bij de week staat zolang *… aangepast na goedkeuring, de medewerker krijgt rond hh:mm één mail*, met een veld voor een opmerking die meegaat. Mislukt de mail (5 pogingen), dan staat dat bij de week.
- **Geen mail** als je je eigen uren aanpast of goedkeurt. Ook niet bij terugsturen of heropenen. Wordt een week of maand opnieuw goedgekeurd, dan vervangt de goedkeuringsmail de wachtende aanpassingen van die dagen.
- Planners krijgen geen kopie. De knop *Nu versturen* bij *Gebruikers* verstuurt ook deze wachtrij direct.
- Code: `src/lib/hours-mail.ts`, `src/app/(app)/uren/overzicht/actions.ts`.

> Schemawijziging: nieuwe tabel `HoursChange`. Draai `npx prisma db push` (alleen toevoegen, geen dataverlies).

## Ziekteoverzicht

Onder *Administratie → Ziekte* zie je per medewerker hoeveel en wanneer hij of zij ziek is geweest.

- **Bron.** Het overzicht komt uit het rooster: een dag telt als ziek als de planner er **Z** (Ziek) heeft gezet. Er is geen aparte registratie en er staat geen reden of diagnose bij.
- **Uren.** De uren van een ziektedag zijn de uren die de medewerker op die weekdag volgens het vaste rooster werkt, net als bij het verlofsaldo. Zonder vaste dienst is dat 0 uur, maar de dag telt wel.
- **Kolommen.** Per medewerker de dagen en uren in een gekozen periode (standaard dit jaar) en in het lopende jaar, de uren per week, en *ziek sinds …* als iemand nu ziek is. Onderaan staat het totaal van iedereen.
- **Periodes.** Onder de tabel klap je per medewerker de ziekteperiodes open, met begin- en einddatum.
  - Aaneengesloten Z-dagen vormen één periode.
  - Vrije dagen ertussen (geen dienst of V, hooguit 4 achter elkaar, bv. een weekend) onderbreken de periode niet, maar tellen niet als ziektedag.
  - Een periode die over de rand van de gekozen periode loopt, staat er met de echte data in. De totalen tellen alleen de dagen binnen de periode.
- **Export.** *Csv totalen* en *Csv periodes* (puntkomma, decimale komma).
- **Toegang.** Alleen planners en administratie zien de pagina en de export; dat wordt op de server gecontroleerd. Medewerkers zien geen totalen, ook niet die van zichzelf. Dat iemand ziek is, blijft zoals voorheen in het rooster zichtbaar. De totalen komen niet in mails of de agenda.
- **Code.** `src/lib/sickness.ts`, `src/app/(app)/ziekte/`. Geen schemawijziging.

## Rechten en urenregistratie

**Rollen.** Er zijn drie vaste rollen. De *planner* (technisch `ADMIN`) beheert rooster, diensten, verlof en gebruikers, en is de enige die rollen van anderen kan aanpassen (*Gebruikers*; een wijziging werkt direct, ook als iemand ingelogd is). Er blijft altijd minstens één actieve planner over en je kunt je eigen rol niet wijzigen. De *administratie* ziet het rooster (alleen lezen, inclusief de uren per maand), kan de uren van iedereen inzien, corrigeren, goedkeuren en exporteren, maar kan niets in het rooster of bij gebruikers wijzigen. De *medewerker* ziet het eigen rooster, vraagt verlof aan en registreert eigen uren.

**Uren registreren.** Onder *Mijn uren* staat per dag het geplande aantal uren (zonder pauzes) als voorstel. Klopt het, dan hoeft de medewerker niets te doen; anders past hij of zij de uren aan en zet er eventueel een opmerking bij. Vanaf de laatste dag van de maand dient de medewerker de maand in (dagen die niet zijn aangepast worden dan bevestigd zoals gepland). Het kan ook per week: een week die over een maandgrens loopt wordt altijd helemaal getoond (de dagen van de buurmaand staan gedempt, met de maandnaam erbij) en onder elke week staat het subtotaal van de hele week; het maandtotaal onderaan telt alleen de dagen van de gekozen maand en vanaf de zondag kan de medewerker die week indienen. Een ingediende of goedgekeurde week is voor de medewerker vergrendeld; de administratie keurt de week goed, stuurt hem terug met een opmerking of heropent hem. Maand en week zijn los van elkaar te gebruiken; de export per dag bevat het weeknummer en de weekstatus. Onder *Uren* ziet de administratie of planner per medewerker gepland en gewerkt, opent de details, past dagen aan, keurt goed of stuurt terug met een opmerking, en kan een goedgekeurde maand heropenen. Zowel *Uren* als *Verlofuren* staan gesorteerd op kleurgroep, in dezelfde volgorde als het rooster, en de export heeft een kolom *Kleurgroep*. Op de pagina van één medewerker staan dezelfde downloads voor alleen die persoon en maand. De export (*Download totalen* of *per dag*) is een CSV met puntkomma's en decimale komma's, direct te openen in Excel.

**Verlofuren.** De administratie (of een planner) vult onder *Verlofuren* per medewerker het aantal uren per jaar in en kan dat later aanpassen, bijvoorbeeld bij een contractwijziging (met een opmerking erbij). Het tegoed van jaar Y geldt van 1 januari Y tot en met 30 juni Y+1, dus anderhalf jaar; wat dan niet is opgenomen vervalt. Opgenomen verlof wordt per week berekend, niet uit de V in de planning: de standaard uren per week van de medewerker (in te vullen door de planner bij *Medewerkers*, of door de administratie bij *Verlofuren*) min de uren die in die week zijn gewerkt (de geregistreerde uren, anders de geplande uren; een ziektedag telt als gewerkt volgens het vaste rooster). Voor de huidige en komende weken gebruikt het saldo de geplande uren, tot en met 30 juni van het jaar erna (dan vervalt het tegoed van dit jaar). Het toont wat er naar verwachting nog over is op 31 december en op 30 juni, en per tegoed apart hoeveel je in het jaar zelf gebruikt en hoeveel je meeneemt naar de eerste helft van het jaar erna; wat er op 30 juni nog over is, vervalt. Weken zonder enige dienst of registratie tellen niet mee, evenmin als weken voor de *stand per*-datum. Het verlof gaat eerst van het oudste tegoed af. Medewerkers zien hun eigen saldo onder *Mijn verlof*, inclusief wat er binnenkort vervalt. Bij een tegoed kan de administratie een *stand per*-datum invullen: het tegoed is dan de stand op die dag en verlof (V) van daarvoor telt niet meer mee. Dat is bedoeld voor 2026, omdat de planning pas vanaf augustus is ingevuld: daar staat standaard 1 november 2026 ingevuld, zodat alleen verlof vanaf november meetelt. Wil de administratie uren anders verrekenen, dan boekt zij een *correctie* (uren erbij of eraf) op het tegoed van een jaar, met een datum en een verplichte reden. Alle correcties staan in een lijst, ook zichtbaar voor de medewerker; ze zijn niet te wijzigen, een vergissing herstel je met een tegengestelde correctie. Zijn de uren per week niet ingevuld, dan wordt er niets berekend en waarschuwt het overzicht daarvoor.

**Verlofoverzicht van iedereen (periode en export).** *Verlofuren* is één compacte tabel. Rechtsboven kies je een periode (standaard het lopende jaar) en download je de csv (*totalen* of *per week*, puntkomma en decimale komma voor Excel). Per medewerker staan zes kolommen: naam (klik om het tegoed te openen), *In periode* (verlof in de weken waarvan de maandag in de periode valt; het ingeplande deel tussen haakjes), *Opgen. / gepland* (dit verlofjaar), *Nu over*, *31-12 / 30-6* (verwachte rest op die dagen) en *Vervalt* (verwachte uren en de datum; oranje als er iets vervalt). Een totaal staat onderaan. Klik op een rij om de weken van die medewerker eronder open te klappen als kleine blokjes (wk 12 8): gestippeld is ingepland, doorgestreept telt niet mee (voor de *stand per*-datum); de details staan in de tooltip. Ontbreken de uren per week, dan staat dat naast de naam. De uitleg over de berekening zit onder *Hoe wordt dit berekend?*. Alleen voor planners en administratie, ook de export (op de server gecontroleerd). Code: , , / in , . Geen schemawijziging.

> Na deze update eenmalig `npx prisma db push` draaien: er komen vijf tabellen (Timesheet, TimeEntry, LeaveAllowance, WeekSubmission, LeaveAdjustment), het veld weeklyHours bij medewerkers en een rol (ACCOUNTING) bij. Bestaande gegevens blijven onaangeroerd.

## 3. Een echte omgeving hosten

> **Let op als je bij Hetzner host:** Hetzner heeft twee verschillende
> producten die je makkelijk door elkaar haalt. **"Webhosting"** (de
> pakketten S/M/L/XL) is gedeelde PHP/WordPress-hosting; zelfs het duurste
> pakket heeft geen PostgreSQL en geen Docker, dus deze app kan daar niet op
> draaien. **"Cloud" (Cloud Server, bv. CPX12/CX23/...)** is een gewone VPS
> met root-toegang — dát is wat je hieronder bij Optie B nodig hebt.

### Optie A — Vercel + Neon (snelst, weinig beheer)

1. Maak een gratis Postgres-database bij [neon.com](https://neon.com) (of
   Supabase / Vercel Postgres) en kopieer de connectiestring naar
   `DATABASE_URL`.
2. Push deze map naar een GitHub-repository en importeer die in
   [vercel.com](https://vercel.com).
3. Zet alle variabelen uit `.env.example` bij Vercel → Project → Settings
   → Environment Variables (met `AUTH_URL` = je Vercel-domein).
4. Als je de Calendar-koppeling gebruikt: voeg bij Google Cloud de
   Vercel-URL toe als redirect-URI (stap 2.4 hierboven).
5. Draai eenmalig `npx prisma db push` en `npm run db:seed` tegen de
   productiedatabase (bv. vanaf je eigen laptop met `DATABASE_URL` van
   Neon in `.env`).

### Optie B — zelf hosten op een Hetzner Cloud Server (meer controle)

Deze route gebruikt `Dockerfile` + `docker-compose.prod.yml` + `Caddyfile`
uit deze map: één commando start de database, de app én een reverse proxy
die automatisch een gratis HTTPS-certificaat regelt (Let's Encrypt, via
Caddy). Geschreven voor en getest tegen een **CPX12** (1 vCPU, 2 GB RAM, 40
GB SSD, ≈ €12/mnd) — dat is genoeg voor deze ene app met dit aantal
medewerkers, maar wel krap (zie stap 4 hieronder over swap). Kom je er met
het verhuurplatform (zie "Volgende stappen") ooit overheen, dan kun je de
server in de Hetzner Cloud Console met een paar klikken opschalen naar bv.
CPX22 (4 GB) zonder dat je iets aan deze configuratie hoeft te wijzigen.

**1. Server aanmaken**

1. Ga naar [console.hetzner.cloud](https://console.hetzner.cloud) → jouw
   project → **Add Server**.
2. Locatie: Falkenstein of Nürnberg (Duitsland) of Helsinki — maakt qua
   opzet niet uit, kies wat het dichtst bij je medewerkers ligt.
3. Image: **Ubuntu 24.04**.
4. Type: je hebt de CPX12 al — die staat er al, of kies hem hier alsnog.
5. Bij **SSH keys**: voeg je eigen publieke SSH-sleutel toe (op je eigen
   laptop: `cat ~/.ssh/id_ed25519.pub`, of maak er eerst één met
   `ssh-keygen -t ed25519`). Zonder dit krijg je een wachtwoord per e-mail,
   wat minder veilig is — sla dat dan meteen op in een wachtwoordmanager.
6. Server aanmaken en het toegewezen IP-adres noteren.

**2. Domein instellen (of: voorlopig overslaan)**

Heb je al een domein en het beheer daarvan zelf in handen? Zet dan bij je
domeinregistrar (of DNS-provider) een **A-record** voor het (sub)domein dat
je wilt gebruiken (bv. `rooster.jouwbedrijf.nl`) naar het IP-adres van de
server, en ga verder bij stap 3.

**Geen domein (nog), of het domeinbeheer ligt bij iemand anders?** Geen
probleem — je kunt nu al testen op het kale server-IP via gewoon HTTP, en
later zonder herinstallatie overstappen op een domein met HTTPS. Zie stap 6
hieronder (`DOMAIN=":80"`) en stap 9 aan het eind voor de overstap zodra het
domein er is.

**3. Inloggen en Docker installeren**

```bash
ssh root@<server-ip>

# Docker + compose-plugin installeren (officieel Hetzner/Docker-recept):
curl -fsSL https://get.docker.com | sh
```

**4. Een swapbestand toevoegen (aanbevolen op 2 GB RAM)**

Met maar 2 GB RAM kan het bouwen van de Docker-image (stap 6) krap zijn.
Een swapbestand van 4 GB is een standaardtruc op kleine VPS'en en kost
alleen wat schijfruimte (die heb je met 40 GB ruim genoeg):

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**5. Code naar de server krijgen**

Makkelijkst is een git-repository (bv. een privé GitHub-repo):

```bash
git clone https://github.com/<jouw-account>/rooster-app.git
cd rooster-app
```

Heb je (nog) geen git-repo, dan kan het ook direct vanaf je eigen laptop:
`scp -r rooster-app root@<server-ip>:/root/` (dit stuurt ook `node_modules`
mee, wat traag is — een repo is echt makkelijker zodra je iets vaker wilt
updaten).

**6. Configureren en starten**

```bash
cp .env.example .env
nano .env
```

Vul in `.env` in:

- `DATABASE_URL` — host moet `db` zijn (niet `localhost`), wachtwoord gelijk
  aan `POSTGRES_PASSWORD` hieronder.
- `AUTH_SECRET` — genereer met `npx auth secret` of `openssl rand -base64 32`.
- `POSTGRES_PASSWORD` — een eigen wachtwoord (moet matchen met `DATABASE_URL`).
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — voor de eerste beheerder.
- **Nog geen domein (zoals nu, met alleen het IP)**: laat `DOMAIN=":80"`
  staan en zet `AUTH_URL="http://<server-ip>"` (bv. `http://2.29.31.8`).
- **Wel al een domein dat naar dit IP wijst**: `DOMAIN="rooster.jouwbedrijf.nl"`
  en `AUTH_URL="https://rooster.jouwbedrijf.nl"`.

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

De eerste build duurt met 2 GB RAM een paar minuten. Daarna:

```bash
# Tabellen aanmaken (er zijn nog geen migratiebestanden, dus `db push`) + medewerkers/diensten/rooster + eerste beheerder laden:
docker compose -f docker-compose.prod.yml exec app npx prisma db push
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

Zonder domein: ga naar `http://<server-ip>`. Met domein: ga naar
`https://<jouw-domein>` — Caddy regelt het certificaat dan vanzelf bij het
eerste bezoek (dit kan de eerste keer een paar seconden duren).

> Test in de HTTP-fase (zonder domein) liever niet met wachtwoorden die
> iemand ook elders gebruikt — dat verkeer is nog niet versleuteld. Prima
> genoeg om de functionaliteit te proberen; voor echt gebruik met het hele
> team eerst naar stap 9 (domein + HTTPS).

**7. Updaten naar een nieuwe versie**

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

**8. Als je de Calendar-koppeling gebruikt**

Vul bij Google Cloud Console (sectie 2 hierboven in dit document) de
redirect-URI in met je echte domein:
`https://rooster.jouwbedrijf.nl/api/google-calendar/callback`. Dit heeft
sowieso een echt domein nodig (Google accepteert geen kaal IP-adres als
redirect-URI) — doe dit dus pas ná stap 9.

**9. Domein alsnog koppelen (zodra je die van iemand anders krijgt)**

Zodra het domein geregeld is — vraag degene die het beheert om een
**A-record** voor het (sub)domein naar dit server-IP (`<server-ip>`) te
zetten:

```bash
ssh root@<server-ip>
cd rooster-app
nano .env
# DOMAIN=":80"                          →  DOMAIN="rooster.jouwbedrijf.nl"
# AUTH_URL="http://<server-ip>"         →  AUTH_URL="https://rooster.jouwbedrijf.nl"

docker compose -f docker-compose.prod.yml up -d
```

Verder hoeft er niets te veranderen — geen herinstallatie, geen nieuwe
accounts. Caddy ziet de echte hostnaam en regelt binnen enkele seconden
zelf een geldig HTTPS-certificaat.

## Volgende stappen

- Eerste test: maak 2–3 accounts voor leidinggevenden aan, laat ze de
  Calendar-koppeling aanzetten, en wijzig een paar diensten om te zien of
  dat in hun eigen Google Calendar verschijnt.
- Vergelijk hoe dit voor jullie werkt tegenover Shiftbase/Dyflexis (zie de
  eerdere vergelijking) voordat je volledig overstapt.
- Als dit bevalt: de rest van de maanden uit Planning V2.0.xlsx laten
  overzetten (nu zit alleen september 2026 als voorbeeld in de seed).
- Een verhuurplatform is genoemd als mogelijk tweede project op dezelfde
  server. Dat is nog niet uitgewerkt (welke software, welke functionaliteit)
  — de serveropzet hierboven (Caddy + docker-compose) is er wel alvast op
  voorbereid: een tweede app komt gewoon als extra service in
  `docker-compose.prod.yml` met een eigen blok in `Caddyfile`, op een eigen
  sub(domein), zonder dat de rooster-app-configuratie hoeft te veranderen.


## Rooster inlezen uit Planning V2.0 en vast rooster

- `npm run db:import-planning` (op de server:
  `docker compose -f docker-compose.prod.yml exec app npm run db:import-planning`)
  leest `src/data/planning-import.json` in: personeelslijst, kleurgroep-volgorde,
  het vaste weekrooster en het rooster van oktober 2026 t/m maart 2027. De maanden
  in het bestand worden vervangen door de Excel-stand; andere maanden blijven staan.
- Pagina **Vast rooster**: dienst per medewerker per weekdag. Wijzigingen worden
  automatisch doorgevoerd vanaf vandaag; verleden dagen en handmatig ingestelde
  dagen blijven ongemoeid. In het rooster krijgt een afwijkende dag een oranje
  rand; met de knop ↺ zet je die dag terug naar het vaste rooster. Wat je invult
  geldt voor elke kleurgroep; de schakelaar per groep ("afwijkingen markeren")
  bepaalt alleen of een afwijking die oranje rand krijgt.
- Kleurgroepen: volgorde en indeling per medewerker bij **Medewerkers**.

## Dagdeel verlof aanvragen

Bij Mijn verlof (en in de popup bij Mijn rooster) kiest de medewerker in *Vrij vragen* voor **Een dagdeel vrij**. De medewerker kiest een ingeplande gebroken dienst (ochtend + middag, bv. X),
welk dagdeel vrij moet (ochtend of middag) en optioneel voor welke dienst (en op welke dag) hij dit wil ruilen. De planner ziet dat bij "Te beoordelen" en krijgt een mail.
Bij goedkeuring blijft alleen het andere dagdeel over in het rooster (bv. X wordt IX); bij intrekken komt de oorspronkelijke dienst terug (als de dag nog niet geweest is en het rooster niet is gewijzigd).
De gewenste ruildienst is een wens: de planner regelt die zelf in het rooster. Dagdeel-verlof telt niet als V en wordt dus niet automatisch van de verlofuren afgeboekt.
Schema: `LeaveRequest` heeft nieuwe velden `part`, `shiftTypeId`, `swapShiftTypeId`, `swapDate` (`db push` nodig, geen dataverlies).

## Andere dienst aanvragen (elke dienst is ruilbaar)

Bij Mijn verlof kan een medewerker voor elke ingeplande dienst (O, A, alleen ochtend, gebroken, ...) vragen om een **andere dienst op dezelfde dag**, bijvoorbeeld van O of A naar een gebroken dienst of andersom.
Bij een gebroken dienst kan daarnaast nog steeds een dagdeel vrij gevraagd worden. De planner beoordeelt; bij goedkeuring vervangt de gevraagde dienst de oorspronkelijke in het rooster, bij intrekken komt de oorspronkelijke terug
(zolang de dag niet geweest is en het rooster niet intussen is gewijzigd). Geen schemawijziging t.o.v. dagdeel-verlof: dezelfde velden (`shiftTypeId`, `swapShiftTypeId`).
Het ruilen met een collega (Mijn rooster) kon al met elke dienst: hele diensten van elk type zijn tegen elkaar te ruilen.
