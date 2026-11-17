"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDays, dateFromISO, toISODate } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";
import { recordAvailabilityChange } from "@/lib/planner-alerts";
import type { AvailabilityStatus } from "@prisma/client";

const STATUSES: AvailabilityStatus[] = ["AVAILABLE", "MORNING", "AFTERNOON", "UNAVAILABLE"];

async function currentEmployeeId() {
  const session = await auth();
  const employeeId = session?.user.employeeId;
  if (!employeeId) throw new Error("Je account is nog niet aan een medewerker gekoppeld.");
  return employeeId;
}

/** Zet de beschikbaarheid van de ingelogde medewerker op één dag (null = niets doorgegeven). */
export async function setAvailability(input: { dateISO: string; status: AvailabilityStatus | null }) {
  const employeeId = await currentEmployeeId();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateISO)) throw new Error("Ongeldige datum.");
  const date = dateFromISO(input.dateISO);
  if (date < todayAmsterdam()) throw new Error("Dagen die al geweest zijn kun je niet meer wijzigen.");

  const before = await prisma.availability.findUnique({
    where: { employeeId_date: { employeeId, date } },
    select: { status: true },
  });
  if (input.status === null) {
    await prisma.availability.deleteMany({ where: { employeeId, date } });
  } else {
    if (!STATUSES.includes(input.status)) throw new Error("Ongeldige keuze.");
    await prisma.availability.upsert({
      where: { employeeId_date: { employeeId, date } },
      update: { status: input.status },
      create: { employeeId, date, status: input.status },
    });
  }
  await recordAvailabilityChange({
    employeeId,
    date,
    oldStatus: before?.status ?? null,
    newStatus: input.status,
  }).catch((error) => console.error("Beschikbaarheidswijziging vastleggen mislukt:", error));
  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
}

/**
 * Zet alle nog lege dagen (vanaf vandaag, t/m tot) op dezelfde keuze. Dagen waarop al een dienst of verlof staat,
 * of waarvoor al iets is doorgegeven, blijven zoals ze zijn. Geeft de ingevulde dagen (ISO) terug.
 */
export async function fillEmptyDays(input: { fromISO: string; toISO: string; status: AvailabilityStatus }): Promise<string[]> {
  const employeeId = await currentEmployeeId();
  if (!STATUSES.includes(input.status)) throw new Error("Ongeldige keuze.");
  if (!/^d{4}-d{2}-d{2}$/.test(input.fromISO) || !/^d{4}-d{2}-d{2}$/.test(input.toISO)) throw new Error("Ongeldige datum.");
  const today = todayAmsterdam();
  const from = dateFromISO(input.fromISO) < today ? today : dateFromISO(input.fromISO);
  const to = dateFromISO(input.toISO);
  const days: Date[] = [];
  for (let d = from; d <= to && days.length < 7 * 26; d = addDays(d, 1)) days.push(d);
  if (days.length === 0) return [];

  const [existing, assigned] = await Promise.all([
    prisma.availability.findMany({ where: { employeeId, date: { in: days } }, select: { date: true } }),
    prisma.shiftAssignment.findMany({ where: { employeeId, date: { in: days } }, select: { date: true } }),
  ]);
  const skip = new Set([...existing, ...assigned].map((e) => e.date.getTime()));
  const toFill = days.filter((d) => !skip.has(d.getTime()));
  await prisma.availability.createMany({
    data: toFill.map((date) => ({ employeeId, date, status: input.status })),
    skipDuplicates: true,
  });
  for (const date of toFill) {
    await recordAvailabilityChange({ employeeId, date, oldStatus: null, newStatus: input.status }).catch((error) =>
      console.error("Beschikbaarheidswijziging vastleggen mislukt:", error),
    );
  }
  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
  return toFill.map((d) => toISODate(d));
}
