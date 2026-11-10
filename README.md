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
  rand; met de knop ↺ zet je die dag terug naar het vaste rooster.
- Kleurgroepen: volgorde en indeling per medewerker bij **Medewerkers**.
