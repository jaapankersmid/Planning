"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageHours } from "@/lib/roles";

export type AllowanceResult = { error: string } | undefined;

function revalidate() {
  revalidatePath("/verlofuren");
  revalidatePath("/verlof");
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) {
    throw new Error("Alleen administratie en planners kunnen verlofuren aanpassen.");
  }
  return session;
}

/** Stelt het aantal verlofuren van een medewerker voor een jaar in (of past het aan). */
export async function saveAllowance(input: {
  employeeId: string;
  year: number;
  hours: string;
  note: string;
}): Promise<AllowanceResult> {
  try {
    const session = await requireAdmin();
    const year = Math.trunc(input.year);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) return { error: "Ongeldig jaar." };
    const hours = Number(input.hours.trim().replace(",", "."));
    if (input.hours.trim() === "" || !Number.isFinite(hours) || hours < 0 || hours > 5000) {
      return { error: "Vul het aantal uren in als getal tussen 0 en 5000." };
    }
    const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } });
    if (!employee) return { error: "Medewerker niet gevonden." };
    const note = input.note.trim().slice(0, 300) || null;
    const rounded = Math.round(hours * 100) / 100;
    await prisma.leaveAllowance.upsert({
      where: { employeeId_year: { employeeId: employee.id, year } },
      update: { hours: rounded, note, updatedById: session.user.id },
      create: { employeeId: employee.id, year, hours: rounded, note, updatedById: session.user.id },
    });
    revalidate();
    return undefined;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}

/** Haalt het tegoed van één jaar weg (bijvoorbeeld als het per ongeluk is toegevoegd). */
export async function deleteAllowance(input: { employeeId: string; year: number }): Promise<AllowanceResult> {
  try {
    await requireAdmin();
    await prisma.leaveAllowance.deleteMany({ where: { employeeId: input.employeeId, year: Math.trunc(input.year) } });
    revalidate();
    return undefined;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Verwijderen is niet gelukt." };
  }
}
