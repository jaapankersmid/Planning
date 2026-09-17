"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO } from "@/lib/format";
import { removeAssignmentFromCalendar, syncAssignmentToCalendar } from "@/lib/google-calendar";

/**
 * Zet, wijzigt of wist de dienst van één medewerker op één dag. Het rooster
 * laat bewust maar één dienst per medewerker per dag toe (net als in
 * Planning V2.0) — een tweede, andere dienst op dezelfde dag vervangt de
 * eerste in plaats van ernaast te bestaan.
 */
export async function setAssignment(input: {
  employeeId: string;
  dateISO: string;
  shiftTypeId: string | null;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen het rooster bewerken.");
  }

  const date = dateFromISO(input.dateISO);
  const existing = await prisma.shiftAssignment.findFirst({
    where: { employeeId: input.employeeId, date },
  });

  if (!input.shiftTypeId) {
    if (existing) {
      const employee = await prisma.employee.findUnique({
        where: { id: input.employeeId },
        include: { user: true },
      });
      await prisma.shiftAssignment.delete({ where: { id: existing.id } });
      if (employee?.user) {
        await removeAssignmentFromCalendar(
          existing.id,
          existing.googleEventId,
          employee.user.id,
        ).catch((error) => console.error("Kalender-verwijdering mislukt:", error));
      }
    }
  } else {
    const assignment = existing
      ? await prisma.shiftAssignment.update({
          where: { id: existing.id },
          data: { shiftTypeId: input.shiftTypeId },
        })
      : await prisma.shiftAssignment.create({
          data: {
            employeeId: input.employeeId,
            date,
            shiftTypeId: input.shiftTypeId,
          },
        });

    await syncAssignmentToCalendar(assignment.id).catch((error) =>
      console.error("Kalender-sync mislukt:", error),
    );
  }

  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
  revalidatePath("/bezetting");
}
