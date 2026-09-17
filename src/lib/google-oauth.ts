import { google } from "googleapis";

// Alleen gebruikt voor de losstaande "Verbind met Google Calendar"-koppeling
// (src/app/api/google-calendar/*) — heeft niets te maken met inloggen, dat
// gaat via zelf aangemaakte accounts (zie src/auth.ts).
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export function createOAuthClient(redirectUri?: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  );
}

/** De vaste redirect-URI die ook in Google Cloud Console geregistreerd moet staan. */
export function calendarCallbackUrl(requestUrl: string) {
  return new URL("/api/google-calendar/callback", requestUrl).toString();
}
