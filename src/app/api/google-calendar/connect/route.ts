import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { CALENDAR_SCOPE, calendarCallbackUrl, createOAuthClient } from "@/lib/google-oauth";

const STATE_COOKIE = "google_oauth_state";

/**
 * Start van de losstaande Google Calendar-koppeling: stuurt de ingelogde
 * gebruiker naar Google's toestemmingsscherm. Dit is bewust géén inlogstap —
 * de gebruiker is al ingelogd met zijn eigen account en vraagt hier alleen
 * toestemming om diensten in zijn Google Calendar te mogen zetten.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
  });

  const client = createOAuthClient(calendarCallbackUrl(request.url));
  const authorizeUrl = client.generateAuthUrl({
    access_type: "offline",
    // Forceert elke keer opnieuw een refresh_token — zonder deze vlag geeft
    // Google er maar één af, bij de allereerste keer toestemming geven.
    prompt: "consent",
    scope: [CALENDAR_SCOPE],
    state,
  });

  return NextResponse.redirect(authorizeUrl);
}
