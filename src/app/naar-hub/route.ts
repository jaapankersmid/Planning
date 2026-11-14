import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { mapRole, signSso } from "@/lib/sso";

// Knop "Crematorium" in het menu: stuurt beheerder/administratie ingelogd door naar de Hub.
export async function GET(req: Request) {
  const session = await auth();
  const base = process.env.AUTH_URL ?? req.url;
  if (!session?.user?.email || !session.user.active) return NextResponse.redirect(new URL("/login", base));
  const role = mapRole(session.user.role);
  const root = process.env.HUB_URL?.replace(/\/$/, "");
  const token = role && root ? signSso({ aud: "hub", email: session.user.email, name: session.user.name ?? "", role }) : null;
  if (!role || !root || !token) {
    return new NextResponse("Doorsturen naar het crematorium is niet beschikbaar (geen rechten of SSO_SECRET/HUB_URL ontbreekt).", { status: 503 });
  }
  return NextResponse.redirect(`${root}/sso?token=${encodeURIComponent(token)}`);
}
