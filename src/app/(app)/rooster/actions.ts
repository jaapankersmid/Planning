"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO } from "@/lib/format";
import { recordRosterChange } from "@/lib/notifications";
import { reconcileTemplate, todayAmsterdam } from "@/lib/schedule";
import { applyAssignment, removeFromCalendar } from "@/lib/assignments";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen het rooster bewerken.");
  }
}

function revalidateRoster() {
  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
  revalidatePath("/bezetting");
}

/**
 * Zet, wijzigt of wist de dienst van één medewerker op één dag (zie applyAssignment: een handmatige
 * wijziging heeft voorrang op het vaste rooster).
 */
export async function setAssignment(input: {
  employeeId: string;
  dateISO: string;
  shiftTypeId: string | null;
}) {
  await requireAdmin();
  await applyAssignment(input);
  revalidateRoster();
}

/** Zet één dag terug naar het vaste rooster (alleen voor vandaag en later). */
export async function resetToTemplate(input: { employeeId: string; dateISO: string }) {
  await requireAdmin();

  const date = dateFromISO(input.dateISO);
  if (date < todayAmsterdam()) {
    throw new Error("Dagen die al geweest zijn worden niet meer aangepast.");
  }

  const existing = await prisma.shiftAssignment.findFirst({
    where: { employeeId: input.employeeId, date },
  });
  await prisma.dayOverride.deleteMany({ where: { employeeId: input.employeeId, date } });
  if (existing) {
    await prisma.shiftAssignment.delete({ where: { id: existing.id } });
    await removeFromCalendar(existing);
  }

  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  await reconcileTemplate(input.dateISO, next.toISOString().slice(0, 10));

  const now = await prisma.shiftAssignment.findFirst({
    where: { employeeId: input.employeeId, date },
  });
  await recordRosterChange({
    employeeId: input.employeeId,
    date,
    oldShiftTypeId: existing?.shiftTypeId ?? null,
    newShiftTypeId: now?.shiftTypeId ?? null,
  }).catch((error) => console.error("Mailwachtrij bijwerken mislukt:", error));

  revalidateRoster();
}
