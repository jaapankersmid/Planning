"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reconcileTemplate, todayAmsterdam } from "@/lib/schedule";
import { toISODate } from "@/lib/format";

/**
 * Zet of wist de vaste dienst van een medewerker op een weekdag
 * (1 = maandag ... 7 = zondag) en past het vaste rooster daarna automatisch toe
 * op de komende maanden — alleen op dagen vanaf vandaag en zonder handmatig
 * ingestelde dagen te overschrijven.
 */
export async function setTemplateEntry(input: {
  employeeId: string;
  weekday: number;
  shiftTypeId: string | null;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen het vaste rooster bewerken.");
  }
  if (input.weekday < 1 || input.weekday > 7) throw new Error("Ongeldige weekdag.");

  const key = { employeeId: input.employeeId, weekday: input.weekday };
  if (input.shiftTypeId) {
    await prisma.weeklyScheduleEntry.upsert({
      where: { employeeId_weekday: key },
      update: { shiftTypeId: input.shiftTypeId },
      create: { ...key, shiftTypeId: input.shiftTypeId },
    });
  } else {
    await prisma.weeklyScheduleEntry.deleteMany({ where: key });
  }

  const from = todayAmsterdam();
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 6);
  await reconcileTemplate(toISODate(from), toISODate(to));

  revalidatePath("/vast-rooster");
  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
  revalidatePath("/bezetting");
}
