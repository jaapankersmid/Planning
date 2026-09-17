"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTempPassword, hashPassword } from "@/lib/password";
import type { Role } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen gebruikers beheren.");
  }
  return session;
}

export type CreateUserState =
  | { error: string }
  | { success: { email: string; tempPassword: string } }
  | undefined;

/**
 * Maakt een account aan met een gegenereerd tijdelijk wachtwoord. Dat
 * wachtwoord wordt maar op één plek getoond — hier, in het resultaat van
 * deze actie — en moet dus meteen doorgegeven worden aan de medewerker. Bij
 * de eerste keer inloggen wordt een eigen wachtwoord verplicht gesteld.
 */
export async function createUser(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "EMPLOYEE") as Role;
  const employeeId = String(formData.get("employeeId") ?? "").trim() || null;

  if (!name || !email) {
    return { error: "Naam en e-mailadres zijn verplicht." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Er bestaat al een account met dit e-mailadres." };
  }

  const tempPassword = generateTempPassword();

  await prisma.user.create({
    data: {
      name,
      email,
      role,
      employeeId,
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: true,
    },
  });

  revalidatePath("/gebruikers");
  revalidatePath("/medewerkers");
  return { success: { email, tempPassword } };
}

export type ResetPasswordState = { tempPassword: string } | { error: string } | undefined;

export async function resetPassword(
  userId: string,
  _prevState: ResetPasswordState,
  _formData: FormData,
): Promise<ResetPasswordState> {
  await requireAdmin();

  const tempPassword = generateTempPassword();
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(tempPassword), mustChangePassword: true },
  });

  revalidatePath("/gebruikers");
  return { tempPassword };
}

export async function setUserActive(userId: string, active: boolean) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath("/gebruikers");
}

export async function setUserRole(userId: string, role: Role) {
  await requireAdmin();
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/gebruikers");
}
