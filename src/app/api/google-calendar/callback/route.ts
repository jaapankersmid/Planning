import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calendarCallbackUrl, createOAuthClient } from "@/lib/google-oauth";

const STATE_COOKIE = "google_oauth_state";

export async function GET(request: NextRequest) {
  const session = await auth();
  const redirectTarget = new URL("/rooster/mijn", request.url);

  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const errorParam = params.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (errorParam) {
    // Bv. de gebruiker klikte op "Weigeren" bij Google.
    redirectTarget.searchParams.set("calendar", "geweigerd");
    return NextResponse.redirect(redirectTarget);
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    redirectTarget.searchParams.set("calendar", "mislukt");
    return NextResponse.redirect(redirectTarget);
  }

  try {
    const client = createOAuthClient(calendarCallbackUrl(request.url));
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      redirectTarget.searchParams.set("calendar", "geen-refresh-token");
      return NextResponse.redirect(redirectTarget);
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        googleRefreshToken: tokens.refresh_token,
        googleAccessToken: tokens.access_token ?? null,
        googleTokenExpiresAt: tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : null,
        calendarSyncEnabled: true,
      },
    });

    redirectTarget.searchParams.set("calendar", "verbonden");
  } catch (error) {
    console.error("Google Calendar-koppeling mislukt:", error);
    redirectTarget.searchParams.set("calendar", "mislukt");
  }

  return NextResponse.redirect(redirectTarget);
}
