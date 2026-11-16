import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { canAutoPlan } from "@/lib/auto-plan-access";

/** Alleen de eigenaar mag erbij; voor iedereen anders bestaat de pagina niet. */
export async function requireAutoPlan() {
  const session = await auth();
  if (!session?.user || !canAutoPlan(session.user.email)) notFound();
  return session;
}

/** Voor server actions: gooit een fout als de gebruiker de eigenaar niet is. */
export async function assertAutoPlan() {
  const session = await auth();
  if (!session?.user || !canAutoPlan(session.user.email)) throw new Error("Geen toegang.");
  return session;
}
