"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string } | undefined;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/rooster",
    });
    return undefined;
  } catch (error) {
    // `signIn` gooit ook een (interne) redirect-fout bij succes — die moet
    // gewoon doorgegeven worden aan Next.js, alleen echte auth-fouten vangen we hier af.
    if (error instanceof AuthError) {
      return { error: "E-mailadres of wachtwoord onjuist." };
    }
    throw error;
  }
}
