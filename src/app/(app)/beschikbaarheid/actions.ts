"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, daysInMonth } from "@/lib/format";
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
  revalidatePath("/beschikbaarheid");
  revalidatePath("/rooster");
}

/** Zet alle nog lege dagen (vanaf vandaag) van een maand op dezelfde keuze. */
export async function fillEmptyDays(input: { year: number; month: number; status: AvailabilityStatus }) {
  const employeeId = await currentEmployeeId();
  if (!STATUSES.includes(input.status)) throw new Error("Ongeldige keuze.");
  const today = todayAmsterdam();
  const days = daysInMonth(input.year, input.month).filter((d) => d >= today);
  const existing = await prisma.availability.findMany({
    where: { employeeId, date: { in: days } },
    select: { date: true },
  });
  const taken = new Set(existing.map((e) => e.date.getTime()));
  // Dagen met goedgekeurd verlof (V) laten we leeg.
  const leave = await prisma.shiftAssignment.findMany({
    where: { employeeId, date: { in: days }, shiftType: { code: "V" } },
    select: { date: true },
  });
  const onLeave = new Set(leave.map((l) => l.date.getTime()));

  const toFill = days.filter((d) => !taken.has(d.getTime()) && !onLeave.has(d.getTime()));
  await prisma.availability.createMany({
    data: toFill.map((date) => ({ employeeId, date, status: input.status })),
    skipDuplicates: true,
  });
  for (const date of toFill) {
    await recordAvailabilityChange({ employeeId, date, oldStatus: null, newStatus: input.status }).catch((error) =>
      console.error("Beschikbaarheidswijziging vastleggen mislukt:", error),
    );
  }
  revalidatePath("/beschikbaarheid");
  revalidatePath("/rooster");
}
