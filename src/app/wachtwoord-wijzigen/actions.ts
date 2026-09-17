"use server";

import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";

export type ChangePasswordState = { error?: string } | undefined;

export async function changeOwnPassword(
  _prevState: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "Nieuw wachtwoord moet minstens 8 tekens zijn." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "De twee wachtwoorden komen niet overeen." };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    return { error: "Huidig wachtwoord is onjuist." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(newPassword), mustChangePassword: false },
  });

  // Nieuw wachtwoord -> opnieuw inloggen, zodat een oude sessie elders niet
  // stilzwijgend blijft werken met het oude wachtwoord in gedachten.
  await signOut({ redirectTo: "/login" });
}
