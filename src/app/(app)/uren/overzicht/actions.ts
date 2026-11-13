"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDays, dateFromISO, startOfWeek, toISODate } from "@/lib/format";
import { canManageHours } from "@/lib/roles";
import { confirmPlannedDays, confirmPlannedRange, writeEntry } from "@/lib/timesheets";
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

/** Corrigeert de uren van een medewerker op één dag (ook in een ingediende of goedgekeurde maand). */
export async function saveEntryForEmployee(
  employeeId: string,
  input: { dateISO: string; hours: string | null; note: string },
): Promise<ActionResult> {
  try {
    const session = await requireHoursAdmin();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateISO)) return { error: "Ongeldige datum." };
    await writeEntry(employeeId, dateFromISO(input.dateISO), input.hours, input.note, session.user.id);
    revalidate();
    return undefined;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}

/**
 * Keurt de maand goed, stuurt hem terug naar de medewerker (met opmerking) of heropent een goedgekeurde maand.
 * Goedkeuren kan ook als de medewerker nog niet heeft ingediend; dagen zonder registratie krijgen dan de geplande uren.
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

    if (input.decision === "APPROVE") {
      if (status === "APPROVED") return { error: "Deze maand is al goedgekeurd." };
      await confirmPlannedDays(employeeId, year, month, session.user.id);
      await prisma.timesheet.upsert({
        where: key,
        update: { status: "APPROVED", decidedById: session.user.id, decidedAt: new Date(), decisionNote: note },
        create: { employeeId, year, month, status: "APPROVED", decidedById: session.user.id, decidedAt: new Date(), decisionNote: note },
      });
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
    return { ok: input.decision === "APPROVE" ? "Goedgekeurd." : input.decision === "RETURN" ? "Teruggestuurd naar de medewerker." : "Heropend." };
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

    if (input.decision === "APPROVE") {
      if (status === "APPROVED") return { error: "Deze week is al goedgekeurd." };
      await confirmPlannedRange(employeeId, monday, addDays(monday, 6), session.user.id);
      await prisma.weekSubmission.upsert({
        where: key,
        update: { status: "APPROVED", decidedById: session.user.id, decidedAt: now, decisionNote: note },
        create: { employeeId, weekStart: monday, status: "APPROVED", decidedById: session.user.id, decidedAt: now, decisionNote: note },
      });
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
    return { ok: input.decision === "APPROVE" ? "Week goedgekeurd." : input.decision === "RETURN" ? "Week teruggestuurd naar de medewerker." : "Week heropend." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}
