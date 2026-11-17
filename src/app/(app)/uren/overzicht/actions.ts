"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDays, dateFromISO, daysInMonth, monthName, startOfWeek, toISODate } from "@/lib/format";
import { canManageHours } from "@/lib/roles";
import { confirmPlannedDays, confirmPlannedRange, writeEntry } from "@/lib/timesheets";
import {
  clearHoursChanges,
  dayHours,
  employeeAddress,
  isApprovedDay,
  outcomeMessage,
  recordHoursChange,
  sendApprovalMail,
  setHoursChangeNote,
  weekLabel,
} from "@/lib/hours-mail";
import { isMailConfigured } from "@/lib/mail";
import type { ActionResult } from "../actions";

async function requireHoursAdmin() {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) {
    throw new Error("Alleen planners en administratie kunnen de uren van iedereen beheren.");
  }
  return session;
}

function revalidate() {
  revalidatePath("/uren");
  revalidatePath("/uren/overzicht");
}

/**
 * Corrigeert de uren van een medewerker op één dag (ook in een ingediende of goedgekeurde maand).
 * In een goedgekeurde week of maand komt de wijziging in de wachtrij voor de mail aan de medewerker
 * (niet als de beheerder zijn eigen uren aanpast).
 */
export async function saveEntryForEmployee(
  employeeId: string,
  input: { dateISO: string; hours: string | null; note: string; workedShiftTypeId?: string | null },
): Promise<ActionResult> {
  try {
    const session = await requireHoursAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateISO)) return { error: "Ongeldige datum." };
    const shiftId = input.workedShiftTypeId;
    if (shiftId !== undefined && shiftId !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(shiftId)) return { error: "Ongeldige dienst." };
    const date = dateFromISO(input.dateISO);
    const track = session.user.employeeId !== employeeId && (await isApprovedDay(employeeId, date));
    const before = track ? await dayHours(employeeId, date) : 0;
    await writeEntry(employeeId, date, input.hours, input.note, session.user.id, input.workedShiftTypeId);
    if (track && (await isMailConfigured()) && (await employeeAddress(employeeId))?.email) {
      await recordHoursChange({
        employeeId,
        date,
        oldHours: before,
        newHours: await dayHours(employeeId, date),
        changedById: session.user.id,
        changedByName: session.user.name ?? session.user.email ?? null,
      });
    }
    revalidate();
    return undefined;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}

/** Opmerking die meegaat in de mail over aanpassingen in een goedgekeurde week. */
export async function saveHoursChangeNote(input: { employeeId: string; weekStartISO: string; note: string }): Promise<ActionResult> {
  try {
    await requireHoursAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStartISO)) return { error: "Ongeldige week." };
    const monday = dateFromISO(input.weekStartISO);
    if (toISODate(startOfWeek(monday)) !== input.weekStartISO) return { error: "Ongeldige week." };
    const note = input.note.trim().slice(0, 500) || null;
    const count = await setHoursChangeNote(input.employeeId, monday, note);
    if (count === 0) return { error: "Er wacht geen mail meer voor deze week (al verstuurd?)." };
    revalidate();
    return { ok: note ? "Opmerking gaat mee in de mail." : "Opmerking verwijderd." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}

/**
 * Keurt de maand goed, stuurt hem terug naar de medewerker (met opmerking) of heropent een goedgekeurde maand.
 * Goedkeuren kan ook als de medewerker nog niet heeft ingediend; dagen zonder registratie krijgen dan de geplande uren.
 * Bij goedkeuren krijgt de medewerker een mail met de uren en de opmerking.
 */
export async function decideTimesheet(input: {
  employeeId: string;
  year: number;
  month: number;
  decision: "APPROVE" | "RETURN" | "REOPEN";
  note: string;
}): Promise<ActionResult> {
  try {
    const session = await requireHoursAdmin();
    const { employeeId, year, month } = input;
    const note = input.note.trim().slice(0, 500) || null;
    const key = { employeeId_year_month: { employeeId, year, month } };
    const sheet = await prisma.timesheet.findUnique({ where: key });
    const status = sheet?.status ?? "DRAFT";
    let mail = "";

    if (input.decision === "APPROVE") {
      if (status === "APPROVED") return { error: "Deze maand is al goedgekeurd." };
      await confirmPlannedDays(employeeId, year, month, session.user.id);
      await prisma.timesheet.upsert({
        where: key,
        update: { status: "APPROVED", decidedById: session.user.id, decidedAt: new Date(), decisionNote: note },
        create: { employeeId, year, month, status: "APPROVED", decidedById: session.user.id, decidedAt: new Date(), decisionNote: note },
      });
      const days = daysInMonth(year, month);
      const first = days[0];
      const last = days[days.length - 1];
      // De goedkeuringsmail laat de actuele uren zien; losse aanpassingsmails voor deze dagen zijn dan overbodig.
      await clearHoursChanges(employeeId, first, last);
      const outcome = await sendApprovalMail({
        employeeId,
        from: first,
        toInclusive: last,
        periodLabel: `${monthName(month)} ${year}`,
        note,
        approverName: session.user.name ?? null,
        approverEmployeeId: session.user.employeeId ?? null,
      });
      mail = outcomeMessage(outcome, (await employeeAddress(employeeId))?.name ?? "De medewerker");
    } else if (input.decision === "RETURN") {
      if (status !== "SUBMITTED") return { error: "Alleen een ingediende maand kun je terugsturen." };
      if (!note) return { error: "Geef een opmerking mee, zodat de medewerker weet wat er moet veranderen." };
      await prisma.timesheet.update({
        where: key,
        data: { status: "RETURNED", decidedById: session.user.id, decidedAt: new Date(), decisionNote: note },
      });
    } else {
      if (status !== "APPROVED") return { error: "Alleen een goedgekeurde maand kun je heropenen." };
      await prisma.timesheet.update({
        where: key,
        data: { status: "RETURNED", decidedById: session.user.id, decidedAt: new Date(), decisionNote: note ?? "Heropend door de administratie." },
      });
    }
    revalidate();
    return { ok: input.decision === "APPROVE" ? `Goedgekeurd.${mail}` : input.decision === "RETURN" ? "Teruggestuurd naar de medewerker." : "Heropend." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}

/** Zelfde beoordeling als bij een maand, maar voor één week (maandag t/m zondag). */
export async function decideWeek(input: {
  employeeId: string;
  weekStartISO: string;
  decision: "APPROVE" | "RETURN" | "REOPEN";
  note: string;
}): Promise<ActionResult> {
  try {
    const session = await requireHoursAdmin();
    const { employeeId } = input;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStartISO)) return { error: "Ongeldige week." };
    const monday = dateFromISO(input.weekStartISO);
    if (toISODate(startOfWeek(monday)) !== input.weekStartISO) return { error: "Ongeldige week." };
    const note = input.note.trim().slice(0, 500) || null;
    const key = { employeeId_weekStart: { employeeId, weekStart: monday } };
    const status = (await prisma.weekSubmission.findUnique({ where: key }))?.status ?? "DRAFT";
    const now = new Date();
    let mail = "";

    if (input.decision === "APPROVE") {
      if (status === "APPROVED") return { error: "Deze week is al goedgekeurd." };
      const sunday = addDays(monday, 6);
      await confirmPlannedRange(employeeId, monday, sunday, session.user.id);
      await prisma.weekSubmission.upsert({
        where: key,
        update: { status: "APPROVED", decidedById: session.user.id, decidedAt: now, decisionNote: note },
        create: { employeeId, weekStart: monday, status: "APPROVED", decidedById: session.user.id, decidedAt: now, decisionNote: note },
      });
      await clearHoursChanges(employeeId, monday, sunday);
      const outcome = await sendApprovalMail({
        employeeId,
        from: monday,
        toInclusive: sunday,
        periodLabel: weekLabel(monday),
        note,
        approverName: session.user.name ?? null,
        approverEmployeeId: session.user.employeeId ?? null,
      });
      mail = outcomeMessage(outcome, (await employeeAddress(employeeId))?.name ?? "De medewerker");
    } else if (input.decision === "RETURN") {
      if (status !== "SUBMITTED") return { error: "Alleen een ingediende week kun je terugsturen." };
      if (!note) return { error: "Geef een opmerking mee, zodat de medewerker weet wat er moet veranderen." };
      await prisma.weekSubmission.update({ where: key, data: { status: "RETURNED", decidedById: session.user.id, decidedAt: now, decisionNote: note } });
    } else {
      if (status !== "APPROVED") return { error: "Alleen een goedgekeurde week kun je heropenen." };
      await prisma.weekSubmission.update({
        where: key,
        data: { status: "RETURNED", decidedById: session.user.id, decidedAt: now, decisionNote: note ?? "Heropend door de administratie." },
      });
    }
    revalidate();
    return {
      ok: input.decision === "APPROVE" ? `Week goedgekeurd.${mail}` : input.decision === "RETURN" ? "Week teruggestuurd naar de medewerker." : "Week heropend.",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}
