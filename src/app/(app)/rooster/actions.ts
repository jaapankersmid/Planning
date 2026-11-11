"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO } from "@/lib/format";
import { recordRosterChange } from "@/lib/notifications";
import { reconcileTemplate, todayAmsterdam, weekdayNumber } from "@/lib/schedule";
import { removeAssignmentFromCalendar, syncAssignmentToCalendar } from "@/lib/google-calendar";

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

async function removeFromCalendar(assignment: {
  id: string;
  googleEventId: string | null;
  googleEventId2: string | null;
  employeeId: string;
}) {
  if (!assignment.googleEventId && !assignment.googleEventId2) return;
  const employee = await prisma.employee.findUnique({
    where: { id: assignment.employeeId },
    include: { user: true },
  });
  if (employee?.user) {
    await removeAssignmentFromCalendar(
      assignment.id,
      assignment.googleEventId,
      employee.user.id,
      assignment.googleEventId2,
    ).catch((error) => console.error("Kalender-verwijdering mislukt:", error));
  }
}

/**
 * Zet, wijzigt of wist de dienst van één medewerker op één dag. Een handmatige
 * wijziging heeft voorrang op het vaste rooster: de dag wordt als MANUAL
 * gemarkeerd (of, bij wissen, met een DayOverride) en het vaste rooster blijft
 * er vanaf. Het rooster laat bewust maar één dienst per medewerker per dag toe.
 */
export async function setAssignment(input: {
  employeeId: string;
  dateISO: string;
  shiftTypeId: string | null;
}) {
  await requireAdmin();

  const date = dateFromISO(input.dateISO);
  const existing = await prisma.shiftAssignment.findFirst({
    where: { employeeId: input.employeeId, date },
  });

  if (!input.shiftTypeId) {
    if (existing) {
      await prisma.shiftAssignment.delete({ where: { id: existing.id } });
      await removeFromCalendar(existing);
    }
    // Alleen vastleggen als het vaste rooster hier anders een dienst zou zetten.
    const templateEntry = await prisma.weeklyScheduleEntry.findUnique({
      where: {
        employeeId_weekday: { employeeId: input.employeeId, weekday: weekdayNumber(date) },
      },
    });
    if (templateEntry) {
      await prisma.dayOverride.upsert({
        where: { employeeId_date: { employeeId: input.employeeId, date } },
        update: {},
        create: { employeeId: input.employeeId, date },
      });
    }
  } else {
    await prisma.dayOverride.deleteMany({
      where: { employeeId: input.employeeId, date },
    });
    const assignment = existing
      ? await prisma.shiftAssignment.update({
          where: { id: existing.id },
          data: { shiftTypeId: input.shiftTypeId, source: "MANUAL" },
        })
      : await prisma.shiftAssignment.create({
          data: {
            employeeId: input.employeeId,
            date,
            shiftTypeId: input.shiftTypeId,
            source: "MANUAL",
          },
        });

    await syncAssignmentToCalendar(assignment.id).catch((error) =>
      console.error("Kalender-sync mislukt:", error),
    );
  }

  // De medewerker krijgt (gebundeld) een mail over deze wijziging.
  await recordRosterChange({
    employeeId: input.employeeId,
    date,
    oldShiftTypeId: existing?.shiftTypeId ?? null,
    newShiftTypeId: input.shiftTypeId,
  }).catch((error) => console.error("Mailwachtrij bijwerken mislukt:", error));

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
