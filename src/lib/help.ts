/*
 * Hulpteksten ("Hoe werkt het?"). Vaste teksten in de code: aanpassen gaat via een wijziging hier.
 * Elke gebruiker ziet alleen de onderwerpen van zijn rol. Houd de teksten kort, in eenvoudig Nederlands, en laat ze
 * aansluiten bij de echte knoppen in de app. Het Planvoorstel staat hier bewust NIET in (alleen voor de eigenaar).
 */

export type HelpAudience = "all" | "personal" | "planner" | "hours";

export type HelpTopic = {
  id: string;
  title: string;
  /** Wie ziet dit: all = iedereen; personal = wie aan een medewerker gekoppeld is; planner; hours = planner en administratie. */
  audience: HelpAudience;
  /** Korte samenvatting, ook gebruikt in het ?-knopje. */
  summary: string;
  /** Stappen (genummerd getoond). */
  steps?: string[];
  /** Losse tips of regels onder de stappen. */
  notes?: string[];
  link?: { href: string; label: string };
  /** Extra zoekwoorden. */
  keywords?: string;
};

export const HELP_GROUPS: { audience: HelpAudience; label: string }[] = [
  { audience: "personal", label: "Mijn werk" },
  { audience: "all", label: "Inloggen en de app" },
  { audience: "planner", label: "Voor de planner" },
  { audience: "hours", label: "Uren, verlof en ziekte (planner en administratie)" },
];

export const HELP_TOPICS: HelpTopic[] = [
  // ---------- Iedereen ----------
  {
    id: "inloggen",
    title: "Inloggen",
    audience: "all",
    summary: "Je logt in met je e-mailadres en wachtwoord. De eerste keer kies je zelf een nieuw wachtwoord.",
    steps: [
      "Open de app en vul je e-mailadres en wachtwoord in.",
      "De eerste keer gebruik je het tijdelijke wachtwoord uit de welkomstmail (of van de planner).",
      "Daarna vraagt de app je om zelf een nieuw wachtwoord te kiezen, van minstens 8 tekens.",
    ],
    notes: [
      "Wachtwoord vergeten? Vraag de planner om een nieuw tijdelijk wachtwoord.",
      "Tip voor je telefoon: open de app in de browser en kies \"Zet op beginscherm\". Dan open je hem met één tik.",
    ],
    keywords: "login wachtwoord vergeten telefoon beginscherm",
  },
  {
    id: "wachtwoord",
    title: "Wachtwoord wijzigen",
    audience: "all",
    summary: "Klik bovenaan op Wachtwoord, vul je huidige en je nieuwe wachtwoord in.",
    steps: [
      "Klik bovenaan, naast je naam, op Wachtwoord.",
      "Vul je huidige wachtwoord in.",
      "Vul twee keer je nieuwe wachtwoord in (minstens 8 tekens) en klik op Wachtwoord instellen.",
    ],
    link: { href: "/wachtwoord-wijzigen", label: "Naar Wachtwoord wijzigen" },
    keywords: "password inloggen",
  },
  {
    id: "menu",
    title: "Het menu gebruiken",
    audience: "all",
    summary: "Bovenaan staat het menu. Op een telefoon schuif je het menu opzij om meer te zien.",
    notes: [
      "Op een telefoon past niet alles naast elkaar: veeg over de menubalk naar links voor de rest.",
      "Een woord met ▾ erachter opent een klein menu met meer keuzes.",
      "Met Uitloggen rechtsboven log je uit.",
    ],
    keywords: "navigatie telefoon uitloggen",
  },
  {
    id: "feedback",
    title: "Iets melden of een vraag stellen",
    audience: "all",
    summary: "Rechtsonder staat de knop Feedback. Je bericht gaat per mail naar de beheerder.",
    steps: [
      "Klik rechtsonder op Feedback.",
      "Kies wat het is: een idee, een probleem, een vraag of een compliment.",
      "Schrijf je bericht en verstuur het. De pagina waar je bent, gaat automatisch mee.",
    ],
    keywords: "fout probleem vraag idee",
  },

  // ---------- Mijn werk (medewerkers) ----------
  {
    id: "rooster",
    title: "Je rooster bekijken",
    audience: "personal",
    summary: "Bij Mijn rooster zie je je eigen diensten van zes weken. Bij Rooster zie je het rooster van iedereen.",
    steps: [
      "Klik in het menu op Mijn rooster.",
      "Je ziet zes weken. Met ← eerder en later → blader je; met vandaag ga je terug naar deze week.",
      "Wil je zien wie er nog meer werkt? Klik op Rooster.",
    ],
    notes: [
      "Vandaag heeft een gekleurde rand. Dagen die al geweest zijn, zijn lichter.",
      "Een groene stip bij een dag betekent: deze dienst staat in je Google-agenda.",
      "Verandert de planner je rooster, dan krijg je één mail met alle wijzigingen (als je dat aan hebt staan).",
    ],
    link: { href: "/rooster/mijn", label: "Naar Mijn rooster" },
    keywords: "diensten planning week",
  },
  {
    id: "ruilen",
    title: "Een dienst ruilen met een collega",
    audience: "personal",
    summary: "Klik bij Mijn rooster op je dienst, kies Dienst ruilen en kies een collega. Pas als die accepteert, verandert het rooster.",
    steps: [
      "Ga naar Mijn rooster en klik op de dienst die je wilt ruilen.",
      "Kies Dienst ruilen.",
      "Bij Ruilen met kies je de collega.",
      "Wil je er een dienst van die collega voor terug? Kies die bij In ruil daarvoor. Dat is niet verplicht.",
      "Bij een gebroken dienst (ochtend en middag) kun je ook alleen de ochtend of alleen de middag ruilen.",
      "Klik op Ruilverzoek versturen.",
    ],
    notes: [
      "Je collega krijgt een mail en ziet het verzoek bij Mijn rooster, onder Ruilverzoeken. Daar klikt hij of zij op Accepteren of Afwijzen.",
      "Pas na Accepteren wordt het rooster aangepast. De planner krijgt daar een mail over.",
      "Zolang je collega nog niet heeft geantwoord, kun je het verzoek intrekken met Verzoek intrekken.",
      "Ruilen kan voor diensten in de komende 8 weken.",
      "Krijg je zelf een verzoek? Je ziet het bij Mijn rooster onder Ruilverzoeken → Verzoeken aan jou.",
    ],
    link: { href: "/rooster/mijn", label: "Naar Mijn rooster" },
    keywords: "ruil wisselen collega overnemen",
  },
  {
    id: "vrij",
    title: "Vrij vragen (verlof, dagdeel of andere dienst)",
    audience: "personal",
    summary: "Klik bij Mijn rooster op je dienst en kies Vrij vragen, of ga naar Mijn verlof. Een planner beoordeelt je aanvraag.",
    steps: [
      "Klik bij Mijn rooster op je dienst en kies Vrij vragen. Of ga naar Mijn verlof → Vrij vragen.",
      "Kies wat je wilt: Hele dag(en) vrij, Een dagdeel vrij of Een andere dienst.",
      "Hele dagen: kies de eerste en de laatste dag. Laat het vinkje voor zaterdag en zondag aan als die dagen ook vrij moeten.",
      "Een dagdeel vrij: kies de dienst en of je de ochtend of de middag vrij wilt. Dit kan alleen bij een dienst met ochtend en middag (een gebroken dienst).",
      "Een andere dienst: kies de dienst en de dienst die je liever wilt werken op die dag.",
      "Zet er eventueel een opmerking bij en klik op de knop om aan te vragen.",
    ],
    notes: [
      "Een planner keurt je aanvraag goed of af. Je ziet de status bij Mijn verlof.",
      "Na goedkeuring staan hele dagen als V (Vrij) in het rooster. Bij een dagdeel of andere dienst past de planner je dienst aan.",
      "Zolang je aanvraag nog niet is beoordeeld, kun je hem intrekken bij Mijn verlof.",
      "Is je verlof al goedgekeurd en wil je het veranderen? Vraag het aan een planner.",
    ],
    link: { href: "/verlof", label: "Naar Mijn verlof" },
    keywords: "verlof vakantie vrije dag aanvragen dagdeel ochtend middag",
  },
  {
    id: "verlofuren",
    title: "Je verlofuren (saldo)",
    audience: "personal",
    summary: "Bij Mijn verlof zie je hoeveel verlofuren je nog hebt en wat er binnenkort vervalt.",
    notes: [
      "Je verlof wordt per week berekend: je vaste uren per week min de uren die je die week hebt gewerkt.",
      "Ben je ziek, dan kost dat geen verlof.",
      "De verlofuren van een jaar kun je gebruiken tot en met 30 juni van het jaar erna. Wat dan nog over is, vervalt.",
      "Klopt er iets niet? Vraag het aan de administratie.",
    ],
    link: { href: "/verlof", label: "Naar Mijn verlof" },
    keywords: "saldo tegoed vervallen uren verlof",
  },
  {
    id: "uren",
    title: "Je uren invullen",
    audience: "personal",
    summary: "Bij Mijn uren staan je geplande uren al ingevuld. Klopt een dag, dan hoef je niets te doen. Klopt het niet, pas het dan aan.",
    steps: [
      "Klik in het menu op Mijn uren. Je ziet de dagen van de maand, per week.",
      "Bij elke dag staan de geplande uren al ingevuld (schuin gedrukt = nog niet bevestigd).",
      "Werkte je korter of langer? Vul de echte uren in en zet er eventueel een opmerking bij, bijvoorbeeld \"overwerk\".",
      "Werkte je een andere dienst dan in het rooster staat? Kies bij die dag onder Dienst de dienst die je echt hebt gewerkt. De uren van die dienst worden dan ingevuld.",
      "Klaar met een week? Klik vanaf de zondag bij de weekregel op Week indienen. Of dien vanaf de laatste dag van de maand de hele maand in met Maand indienen.",
    ],
    notes: [
      "Alles is meteen opgeslagen zodra je naar een ander vakje gaat.",
      "Met Bevestig alle dagen zoals gepland bevestig je in één keer alle dagen die kloppen.",
      "Na het indienen kun je die week niet meer zelf aanpassen. De administratie keurt goed of stuurt terug met een opmerking.",
      "Je krijgt een mail als de administratie je uren goedkeurt, en ook als zij daarna nog iets aanpast.",
      "Een andere dienst kiezen verandert je rooster niet. De administratie en de planner zien het wel.",
    ],
    link: { href: "/uren", label: "Naar Mijn uren" },
    keywords: "uren registratie gewerkt indienen overwerk andere dienst",
  },
  {
    id: "beschikbaarheid",
    title: "Je beschikbaarheid doorgeven",
    audience: "personal",
    summary: "Tik bij Beschikbaarheid op een dag om te kiezen: hele dag, ochtend, middag of niet. De planner ziet dit bij het inplannen.",
    steps: [
      "Klik in het menu op Beschikbaarheid. Je ziet een maand.",
      "Tik op een dag. Elke tik kiest het volgende: leeg → hele dag → ochtend (8:00–12:30) → middag (15:30–19:30) → niet.",
      "Het wordt meteen opgeslagen.",
      "Kun je de meeste dagen? Klik op Alle lege dagen op \"beschikbaar\" zetten, en pas daarna de uitzonderingen aan.",
      "Met volgende → ga je naar de volgende maand.",
    ],
    notes: [
      "Dagen die al geweest zijn en dagen met verlof kun je niet aanpassen.",
      "Beschikbaarheid is geen verlof. Wil je echt vrij, vraag dat dan aan via Vrij vragen.",
    ],
    link: { href: "/beschikbaarheid", label: "Naar Beschikbaarheid" },
    keywords: "beschikbaar kunnen werken ochtend middag",
  },
  {
    id: "ziek",
    title: "Ziek of beter melden",
    audience: "personal",
    summary: "Ziek? App of bel Mirjam of Kim. Ziekmelden kan niet in de app.",
    notes: [
      "Ziek? App of bel Mirjam of Kim.",
      "De planner zet dan Z (Ziek) in het rooster.",
      "Ben je weer beter? Laat het ook weten aan Mirjam of Kim.",
    ],
    keywords: "ziekte ziekmelding beter",
  },
  {
    id: "meldingen",
    title: "Mails en je Google-agenda",
    audience: "personal",
    summary: "Onderaan Mijn rooster zet je de mails over je rooster aan of uit, en koppel je je Google-agenda.",
    steps: [
      "Ga naar Mijn rooster en scroll naar beneden.",
      "Bij E-mailmeldingen zet je het vinkje aan of uit. Staat het aan, dan krijg je één mail als je rooster verandert.",
      "Bij Google Calendar-koppeling klik je op Verbind met Google Calendar en geef je toestemming.",
      "Je diensten staan dan in een aparte agenda Werkrooster in je Google-agenda.",
    ],
    notes: ["Zet je de koppeling uit, dan blijven diensten die al in je agenda staan, staan. Die haal je zelf weg."],
    link: { href: "/rooster/mijn", label: "Naar Mijn rooster" },
    keywords: "mail e-mail agenda calendar google meldingen",
  },

  // ---------- Planner ----------
  {
    id: "planner-rooster",
    title: "Het rooster aanpassen",
    audience: "planner",
    summary: "Klik bij Rooster op een vakje om de dienst te kiezen. De medewerker krijgt daarna één mail met alle wijzigingen.",
    steps: [
      "Klik in het menu op Rooster. Kies bovenaan maand of week.",
      "Klik op een vakje en kies de dienst. Ziek zet je met Z, vrij met V.",
      "Een oranje rand betekent: deze dag wijkt af van het vaste rooster. Met ↺ zet je de dag terug.",
    ],
    notes: [
      "Het stipje linksonder in een vakje is de beschikbaarheid die de medewerker heeft doorgegeven.",
      "De medewerker krijgt na een korte wachttijd één mail met alle wijzigingen samen, en de agenda wordt bijgewerkt.",
      "Rechts staan de uren van de week of maand, zonder pauzes. V en Z tellen niet mee.",
    ],
    link: { href: "/rooster", label: "Naar Rooster" },
    keywords: "inplannen dienst wijzigen ziek vrij",
  },
  {
    id: "planner-verlof",
    title: "Verlofaanvragen beoordelen",
    audience: "planner",
    summary: "Bij Planner → Verlofoverzicht staan de aanvragen onder Te beoordelen. Het getal in het menu is het aantal open aanvragen.",
    steps: [
      "Klik op Planner → Verlofoverzicht.",
      "Bij Te beoordelen klik je per aanvraag op Goedkeuren of Afwijzen.",
      "Bij goedkeuren worden hele dagen V. Bij een dagdeel of andere dienst wordt de dienst aangepast.",
      "Verlof vastleggen voor iemand anders? Gebruik Verlof vastleggen voor een medewerker.",
    ],
    link: { href: "/verlof/overzicht", label: "Naar Verlofoverzicht" },
    keywords: "goedkeuren afwijzen aanvraag",
  },
  {
    id: "planner-vast",
    title: "Vast rooster, vakanties en bezetting",
    audience: "planner",
    summary: "Het vaste rooster komt elke week terug. Bij Vakanties zet je vakantieperiodes. Bezetting telt hoeveel mensen er zijn.",
    notes: [
      "Vast rooster: een wijziging geldt vanaf vandaag. Dagen die al geweest zijn of die je met de hand hebt aangepast, blijven zoals ze zijn.",
      "Vakanties: een periode met eventueel een wensaantal. In het rooster kleurt de bezetting dan groen of rood.",
      "Bezetting: telt automatisch uit het rooster hoeveel mensen er per dag(deel) zijn.",
    ],
    keywords: "vast rooster vakantie bezetting telling",
  },
  {
    id: "planner-beheer",
    title: "Medewerkers, diensten, gebruikers en instellingen",
    audience: "planner",
    summary: "Onder Instellingen beheer je medewerkers, diensten, accounts en de bedrijfs- en mailgegevens.",
    notes: [
      "Medewerkers: naam, kleurgroep en de vaste uren per week (nodig voor de verlofuren).",
      "Diensten: code, tijden, kleur en eventueel een vast aantal betaalde uren.",
      "Gebruikers: maak een account aan. Laat Welkomstmail sturen aan, dan krijgt de nieuwe collega de inloggegevens per mail. Hier kies je ook de rol: medewerker, planner of administratie.",
      "Instellingen: bedrijfsgegevens en mailinstellingen. Opslaan vraagt om een controle en je wachtwoord.",
    ],
    keywords: "account aanmaken rol rechten welkomstmail",
  },

  // ---------- Uren, verlof en ziekte (planner en administratie) ----------
  {
    id: "admin-uren",
    title: "Uren controleren en goedkeuren",
    audience: "hours",
    summary: "Bij Administratie → Uren zie je per medewerker gepland en gewerkt. Open iemand om weken goed te keuren of uren aan te passen.",
    steps: [
      "Klik op Administratie → Uren en kies de maand.",
      "Klik bij een medewerker op openen.",
      "Pas zo nodig de uren van een dag aan.",
      "Klik bij de weekregel op Week goedkeuren. Een opmerking voor de mail is niet verplicht. Of stuur de week terug met een opmerking.",
    ],
    notes: [
      "Een oranje label of een oranje dag betekent: de medewerker zegt een andere dienst te hebben gewerkt dan in het rooster. Kijk dan of het rooster klopt.",
      "Bij goedkeuren krijgt de medewerker een mail. Pas je daarna nog uren aan, dan krijgt hij na een korte wachttijd één mail met oud → nieuw.",
      "Met de downloadknoppen krijg je een bestand voor Excel.",
    ],
    link: { href: "/uren/overzicht", label: "Naar Uren" },
    keywords: "goedkeuren terugsturen heropenen export excel andere dienst",
  },
  {
    id: "admin-verlofuren",
    title: "Verlofuren beheren",
    audience: "hours",
    summary: "Bij Administratie → Verlofuren vul je per medewerker het tegoed per jaar in en zie je het verlof van iedereen.",
    notes: [
      "Open een medewerker om het tegoed van een jaar of de uren per week in te vullen, of om een correctie te boeken (met een reden).",
      "Boven de tabel kies je een periode. Je ziet dan het verlof van iedereen in die periode, en per week als je een medewerker openklapt.",
      "Met Csv totalen en Csv per week download je het overzicht voor Excel.",
    ],
    link: { href: "/verlofuren", label: "Naar Verlofuren" },
    keywords: "tegoed saldo correctie export",
  },
  {
    id: "admin-ziekte",
    title: "Ziekteoverzicht",
    audience: "hours",
    summary: "Bij Administratie → Ziekte zie je per medewerker hoeveel en wanneer iemand ziek was, uit de Z in het rooster.",
    notes: [
      "Het overzicht telt de dagen met Z. De uren komen uit het vaste rooster van die medewerker.",
      "Aaneengesloten ziektedagen zijn één periode. Een weekend of vrije dag ertussen breekt de periode niet.",
      "Dit overzicht is vertrouwelijk. Alleen planners en administratie zien het.",
    ],
    link: { href: "/ziekte", label: "Naar Ziekte" },
    keywords: "ziek verzuim periode",
  },
];

/** Welke onderwerpen ziet deze gebruiker? */
export function topicsFor(role: "ADMIN" | "ACCOUNTING" | "EMPLOYEE", hasEmployee: boolean) {
  return HELP_TOPICS.filter((t) => {
    if (t.audience === "all") return true;
    if (t.audience === "personal") return hasEmployee;
    if (t.audience === "planner") return role === "ADMIN";
    return role === "ADMIN" || role === "ACCOUNTING";
  });
}

export const helpTopic = (id: string) => HELP_TOPICS.find((t) => t.id === id);
