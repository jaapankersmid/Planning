"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { todayAmsterdam } from "@/lib/schedule";
import { syncAssignmentToCalendar } from "@/lib/google-calendar";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen diensttypen beheren.");
  }
}

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

export async function addShiftType(formData: FormData) {
  await requireAdmin();

  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const color = String(formData.get("color") ?? "#2f6e63");
  if (!code || !label) throw new Error("Code en omschrijving zijn verplicht.");

  await prisma.shiftType.create({
    data: {
      code,
      label,
      color,
      startTime: emptyToNull(formData.get("startTime")),
      endTime: emptyToNull(formData.get("endTime")),
      secondStartTime: emptyToNull(formData.get("secondStartTime")),
      secondEndTime: emptyToNull(formData.get("secondEndTime")),
      countsMorningWalk: formData.get("countsMorningWalk") === "on",
      countsEveningWalk: formData.get("countsEveningWalk") === "on",
    },
  });

  revalidatePath("/diensten");
  revalidatePath("/rooster");
}

export async function setShiftTypeActive(shiftTypeId: string, active: boolean) {
  await requireAdmin();
  await prisma.shiftType.update({ where: { id: shiftTypeId }, data: { active } });
  revalidatePath("/diensten");
  revalidatePath("/rooster");
}

/**
 * Past een bestaande dienst aan (code, omschrijving, kleur, tijden, telling).
 * Alles in het rooster dat deze dienst gebruikt wijzigt mee. Toekomstige
 * diensten worden daarna opnieuw naar Google Calendar gesynchroniseerd, zodat
 * gewijzigde tijden ook in de agenda's komen.
 */
export async function updateShiftType(shiftTypeId: string, formData: FormData) {
  await requireAdmin();

  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const color = String(formData.get("color") ?? "#2f6e63");
  if (!code || !label) throw new Error("Code en omschrijving zijn verplicht.");

  const clash = await prisma.shiftType.findFirst({
    where: { code, NOT: { id: shiftTypeId } },
  });
  if (clash) throw new Error(`De code ${code} bestaat al.`);

  await prisma.shiftType.update({
    where: { id: shiftTypeId },
    data: {
      code,
      label,
      color,
      startTime: emptyToNull(formData.get("startTime")),
      endTime: emptyToNull(formData.get("endTime")),
      secondStartTime: emptyToNull(formData.get("secondStartTime")),
      secondEndTime: emptyToNull(formData.get("secondEndTime")),
      countsMorningWalk: formData.get("countsMorningWalk") === "on",
      countsEveningWalk: formData.get("countsEveningWalk") === "on",
    },
  });

  after(async () => {
    const upcoming = await prisma.shiftAssignment.findMany({
      where: {
        shiftTypeId,
        date: { gte: todayAmsterdam() },
        employee: { user: { calendarSyncEnabled: true } },
      },
      select: { id: true },
    });
    for (const a of upcoming) {
      await syncAssignmentToCalendar(a.id).catch((e) =>
        console.error("Kalender-sync mislukt:", e),
      );
    }
  });

  revalidatePath("/diensten");
  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
  revalidatePath("/vast-rooster");
  revalidatePath("/bezetting");
  redirect("/diensten");
}
