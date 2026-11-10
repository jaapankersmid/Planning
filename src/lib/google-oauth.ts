import { google } from "googleapis";

// Alleen gebruikt voor de losstaande "Verbind met Google Calendar"-koppeling
// (src/app/api/google-calendar/*) — heeft niets te maken met inloggen, dat
// gaat via zelf aangemaakte accounts (zie src/auth.ts).
//
// calendar.app.created: mag een aparte agenda ("Werkrooster") aanmaken en
// daarin diensten zetten/wijzigen/wissen, maar komt niet aan de andere
// agenda's van de gebruiker. De bredere scope calendar.events kan géén
// agenda aanmaken, en vraagt bij Google meer verificatie.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

export function createOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

/**
 * De vaste redirect-URI die ook in Google Cloud Console geregistreerd moet
 * staan. Bij voorkeur uit AUTH_URL (de publieke https-url van de app), zodat
 * hij niet afhangt van hoe de proxy het verzoek doorgeeft.
 */
export function calendarCallbackUrl(requestUrl: string) {
  const base = process.env.AUTH_URL || requestUrl;
  return new URL("/api/google-calendar/callback", base).toString();
}

/**
 * Bouwt een adres binnen de app, voor omleidingen na de Google-koppeling.
 * Achter de proxy ziet Next het verzoek als https://localhost:3000, dus we
 * gebruiken het publieke adres uit AUTH_URL zodra dat is ingesteld.
 */
export function appUrl(path: string, requestUrl: string) {
  return new URL(path, process.env.AUTH_URL || requestUrl);
}
