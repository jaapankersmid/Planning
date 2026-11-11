import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { addDays, isWeekend } from "@/lib/format";
import { reconcileTemplate, todayAmsterdam } from "@/lib/schedule";
import { removeAssignmentFromCalendar, syncAssignmentToCalendar } from "@/lib/google-calendar";

export const MAX_LEAVE_DAYS = 120;

/** Alle dagen van een verlofperiode (optioneel zonder zaterdag en zondag). */
export function leaveDates(start: Date, end: Date, includeWeekends: boolean) {
  const dates: Date[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (includeWeekends || !isWeekend(d)) dates.push(new Date(d));
  }
  return dates;
}

/**
 * Keurt een aanvraag goed en zet de dagen als V (Vrij) in het rooster. Een
 * dienst die er al stond op die dag wordt vervangen (er is maar één dienst per
 * medewerker per dag). De V geldt als handmatig ingesteld, dus het vaste
 * rooster blijft er vanaf. Geeft het aantal vervangen diensten terug.
 */
export async function approveLeave(requestId: string, plannerId: string, note?: string | null) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: { include: { user: true } } },
  });
  if (!request || request.status !== "PENDING") {
    throw new Error("Deze aanvraag is al beoordeeld of bestaat niet meer.");
  }
  const vrij = await prisma.shiftType.findUnique({ where: { code: "V" } });
  if (!vrij) throw new Error("De dienst V (Vrij) bestaat niet. Maak die eerst aan bij Diensten.");

  const dates = leaveDates(request.startDate, request.endDate, request.includeWeekends);
  const existing = await prisma.shiftAssignment.findMany({
    where: { employeeId: request.employeeId, date: { in: dates } },
  });

  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { id: { in: existing.map((e) => e.id) } } }),
    prisma.dayOverride.deleteMany({
      where: { employeeId: request.employeeId, date: { in: dates } },
    }),
    prisma.shiftAssignment.createMany({
      data: dates.map((date) => ({
        employeeId: request.employeeId,
        date,
        shiftTypeId: vrij.id,
        source: "MANUAL" as const,
        note: "Verlof",
      })),
      skipDuplicates: true,
    }),
    prisma.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        decidedById: plannerId,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
      },
    }),
  ]);

  // Agenda bijwerken na het antwoord: oude events weg, V erin.
  const user = request.employee.user;
  if (user?.calendarSyncEnabled) {
    const removals = existing.filter((e) => e.googleEventId || e.googleEventId2);
    after(async () => {
      for (const r of removals) {
        await removeAssignmentFromCalendar(r.id, r.googleEventId, user.id, r.googleEventId2).catch((e) =>
          console.error("Kalender-verwijdering mislukt:", e),
        );
      }
      const created = await prisma.shiftAssignment.findMany({
        where: { employeeId: request.employeeId, date: { in: dates }, shiftTypeId: vrij.id },
        select: { id: true },
      });
      for (const c of created) {
        await syncAssignmentToCalendar(c.id).catch((e) =>
          console.error("Kalender-sync mislukt:", e),
        );
      }
    });
  }

  return existing.length;
}

/**
 * Trekt een goedgekeurde aanvraag in: de V-dagen vanaf vandaag verdwijnen weer
 * uit het rooster en het vaste rooster vult de dag opnieuw aan. Dagen die al
 * geweest zijn blijven staan.
 */
export async function revokeApprovedLeave(requestId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { employee: { include: { user: true } } },
  });
  if (!request || request.status !== "APPROVED") {
    throw new Error("Alleen een goedgekeurde aanvraag kan worden ingetrokken.");
  }

  const today = todayAmsterdam();
  const dates = leaveDates(request.startDate, request.endDate, request.includeWeekends).filter(
    (d) => d >= today,
  );
  const vrij = await prisma.shiftType.findUnique({ where: { code: "V" } });

  const toRemove = vrij
    ? await prisma.shiftAssignment.findMany({
        where: { employeeId: request.employeeId, date: { in: dates }, shiftTypeId: vrij.id },
      })
    : [];

  await prisma.$transaction([
    prisma.shiftAssignment.deleteMany({ where: { id: { in: toRemove.map((r) => r.id) } } }),
    prisma.leaveRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } }),
  ]);

  const user = request.employee.user;
  if (user?.calendarSyncEnabled) {
    const removals = toRemove.filter((r) => r.googleEventId || r.googleEventId2);
    after(async () => {
      for (const r of removals) {
        await removeAssignmentFromCalendar(r.id, r.googleEventId, user.id, r.googleEventId2).catch((e) =>
          console.error("Kalender-verwijdering mislukt:", e),
        );
      }
    });
  }

  if (dates.length > 0) {
    const first = dates[0].toISOString().slice(0, 10);
    const after1 = addDays(dates[dates.length - 1], 1).toISOString().slice(0, 10);
    await reconcileTemplate(first, after1);
  }
}

/** Leest en controleert het verlofformulier. Gooit een Nederlandse foutmelding bij ongeldige invoer. */
export function parseLeaveForm(formData: FormData, options: { allowPast: boolean }) {
  const start = String(formData.get("startDate") ?? "");
  const end = String(formData.get("endDate") ?? "");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(start) || !iso.test(end)) throw new Error("Vul een eerste en laatste dag in.");

  const startDate = new Date(`${start}T00:00:00.000Z`);
  const endDate = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Een van de datums is ongeldig.");
  }
  if (endDate < startDate) throw new Error("De laatste dag ligt voor de eerste dag.");
  if (!options.allowPast && startDate < todayAmsterdam()) {
    throw new Error("Je kunt geen verlof aanvragen voor dagen die al geweest zijn.");
  }
  const days = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (days > MAX_LEAVE_DAYS) throw new Error(`Een aanvraag kan maximaal ${MAX_LEAVE_DAYS} dagen beslaan.`);

  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;
  const includeWeekends = formData.get("includeWeekends") === "on";
  return { startDate, endDate, note, includeWeekends };
}

/** Is er al een lopende of goedgekeurde aanvraag die overlapt met deze periode? */
export async function findOverlappingLeave(employeeId: string, start: Date, end: Date) {
  return prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });
}
