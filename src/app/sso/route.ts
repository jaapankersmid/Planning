import { NextResponse } from "next/server";
import { signIn } from "@/auth";

// Landingspunt van de knop "Crematorium" in het rooster: logt in met het ondertekende bewijs.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  try {
    await signIn("sso", { token, redirectTo: "/rooster" });
  } catch (e) {
    // Een geslaagde login "gooit" intern een redirect: die moet doorgegeven worden.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    return NextResponse.redirect(new URL("/login?fout=sso", process.env.AUTH_URL ?? req.url));
  }
  return NextResponse.redirect(new URL("/rooster", process.env.AUTH_URL ?? req.url));
}
