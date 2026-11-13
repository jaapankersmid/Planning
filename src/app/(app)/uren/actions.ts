"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, daysInMonth } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";
import { confirmPlannedDays, writeEntry } from "@/lib/timesheets";

export type ActionResult = { error: string } | { ok: string } | undefined;

function revalidate() {
  revalidatePath("/uren");
  revalidatePath("/uren/overzicht");
}

async function ownEmployeeId() {
  const session = await auth();
  if (!session?.user) throw new Error("Niet ingelogd.");
  if (!session.user.employeeId) throw new Error("Je account is nog niet aan een medewerker gekoppeld.");
  return { userId: session.user.id, employeeId: session.user.employeeId };
}

async function assertEditable(employeeId: string, year: number, month: number) {
  const sheet = await prisma.timesheet.findUnique({
    where: { employeeId_year_month: { employeeId, year, month } },
  });
  if (sheet?.status === "SUBMITTED") return "Deze maand is ingediend. Vraag de administratie om hem terug te sturen als je iets wilt wijzigen.";
  if (sheet?.status === "APPROVED") return "Deze maand is goedgekeurd en kan niet meer gewijzigd worden.";
  return null;
}

/** Slaat de gewerkte uren van één dag van de ingelogde medewerker op. `hours: null` zet de dag terug naar het voorstel. */
export async function saveOwnEntry(input: { dateISO: string; hours: string | null; note: string }): Promise<ActionResult> {
  try {
    const { userId, employeeId } = await ownEmployeeId();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateISO)) return { error: "Ongeldige datum." };
    const date = dateFromISO(input.dateISO);
    if (date > todayAmsterdam()) return { error: "Je kunt nog geen uren invullen voor dagen die nog moeten komen." };
    const locked = await assertEditable(employeeId, date.getUTCFullYear(), date.getUTCMonth() + 1);
    if (locked) return { error: locked };
    await writeEntry(employeeId, date, input.hours, input.note, userId);
    revalidate();
    return undefined;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}

/** Bevestigt alle dagen tot en met vandaag zonder registratie met de geplande uren. */
export async function confirmAllPlanned(input: { year: number; month: number }): Promise<ActionResult> {
  try {
    const { userId, employeeId } = await ownEmployeeId();
    const locked = await assertEditable(employeeId, input.year, input.month);
    if (locked) return { error: locked };
    const count = await confirmPlannedDays(employeeId, input.year, input.month, userId);
    revalidate();
    return { ok: count === 0 ? "Er was niets meer te bevestigen." : `${count} dag${count === 1 ? "" : "en"} bevestigd zoals gepland.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Bevestigen is niet gelukt." };
  }
}

/** Dient de maand in bij de administratie. Kan vanaf de laatste dag van de maand. */
export async function submitMonth(input: { year: number; month: number }): Promise<ActionResult> {
  try {
    const { userId, employeeId } = await ownEmployeeId();
    const { year, month } = input;
    const days = daysInMonth(year, month);
    if (todayAmsterdam() < days[days.length - 1]) {
      return { error: "Je kunt de maand indienen vanaf de laatste dag van de maand." };
    }
    const locked = await assertEditable(employeeId, year, month);
    if (locked) return { error: locked };
    await confirmPlannedDays(employeeId, year, month, userId);
    await prisma.timesheet.upsert({
      where: { employeeId_year_month: { employeeId, year, month } },
      update: { status: "SUBMITTED", submittedAt: new Date(), decidedAt: null, decidedById: null, decisionNote: null },
      create: { employeeId, year, month, status: "SUBMITTED", submittedAt: new Date() },
    });
    revalidate();
    return { ok: "Ingediend. De administratie beoordeelt je uren." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Indienen is niet gelukt." };
  }
}
