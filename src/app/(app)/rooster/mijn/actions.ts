"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncAllAssignmentsForEmployee } from "@/lib/google-calendar";

export async function setCalendarSync(enabled: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error("Niet ingelogd.");

  if (enabled) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.googleRefreshToken) {
      throw new Error(
        "Nog geen Google Calendar-koppeling. Klik eerst op “Verbind met Google Calendar”.",
      );
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { calendarSyncEnabled: enabled },
  });

  if (enabled && session.user.employeeId) {
    await syncAllAssignmentsForEmployee(session.user.employeeId).catch((error) =>
      console.error("Volledige sync mislukt:", error),
    );
  }

  revalidatePath("/rooster/mijn");
}

export async function syncNow() {
  const session = await auth();
  if (!session?.user?.employeeId) throw new Error("Geen gekoppelde medewerker.");

  const result = await syncAllAssignmentsForEmployee(session.user.employeeId);
  revalidatePath("/rooster/mijn");
  return result;
}

/** Verbreekt de Google Calendar-koppeling volledig — de gebruiker kan zich
 * later opnieuw verbinden via "Verbind met Google Calendar". */
export async function disconnectCalendar() {
  const session = await auth();
  if (!session?.user) throw new Error("Niet ingelogd.");

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      calendarSyncEnabled: false,
      googleRefreshToken: null,
      googleAccessToken: null,
      googleTokenExpiresAt: null,
      googleCalendarId: null,
    },
  });

  revalidatePath("/rooster/mijn");
}

/** Zet de e-mailmeldingen over ingeplande diensten aan of uit voor de ingelogde gebruiker. */
export async function setEmailNotifications(enabled: boolean) {
  const session = await auth();
  if (!session?.user) throw new Error("Niet ingelogd.");
  await prisma.user.update({
    where: { id: session.user.id },
    data: { emailNotifications: enabled },
  });
  revalidatePath("/rooster/mijn");
}
