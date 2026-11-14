import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { effectiveHubRole } from "@/lib/hub-access";
import { signSso } from "@/lib/sso";

// Knop "Crematorium" in het menu: stuurt iedereen met crematorium-toegang ingelogd door naar de Hub.
export async function GET(req: Request) {
  const session = await auth();
  const base = process.env.AUTH_URL ?? req.url;
  if (!session?.user?.email || !session.user.active) return NextResponse.redirect(new URL("/login", base));
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const role = user ? effectiveHubRole(user) : null;
  const root = process.env.HUB_URL?.replace(/\/$/, "");
  const token = user && role && root ? signSso({ aud: "hub", email: user.email, name: user.name ?? "", role }) : null;
  if (!role || !root || !token) {
    return new NextResponse("Geen toegang tot het crematorium (of SSO_SECRET/HUB_URL ontbreekt). Vraag de beheerder om toegang.", { status: 403 });
  }
  return NextResponse.redirect(`${root}/sso?token=${encodeURIComponent(token)}`);
}
