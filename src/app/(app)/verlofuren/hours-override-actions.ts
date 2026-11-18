"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, toISODate } from "@/lib/format";
import { loadBalances, periodLeave, type Balance } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";

type Input = { employeeId: string; shiftTypeId: string; hours: string; validFrom: string };

export type OverrideSummary = { available: number; forecastYearEnd: number; forecast: number; leaveSince: number; weeks: number };
export type OverridePreview = { before: OverrideSummary; after: OverrideSummary; changedWeeks: { label: string; before: number; after: number }[] };
export type OverrideResult = { error: string } | { ok: string } | { preview: OverridePreview };

async function requireHoursAdmin() {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) {
    throw new Error("Alleen administratie en planners kunnen afwijkende diensturen instellen.");
  }
  return session;
}

/** Controleert de invoer. hours = null betekent: vanaf die dag weer de gewone uren van de dienst. */
async function parse(input: Input) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom) || Number.isNaN(dateFromISO(input.validFrom).getTime())) {
    throw new Error("Kies een geldige ingangsdatum.");
  }
  const [employee, shift] = await Promise.all([
    prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true } }),
    prisma.shiftType.findUnique({ where: { id: input.shiftTypeId }, select: { id: true, code: true } }),
  ]);
  if (!employee) throw new Error("Medewerker niet gevonden.");
  if (!shift) throw new Error("Kies een dienst.");
  const text = input.hours.trim().replace(",", ".");
  let hours: number | null = null;
  if (text !== "") {
    hours = Number(text);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new Error("Vul de uren in als getal tussen 0 en 24, bijvoorbeeld 9 of 8,5. Leeg = weer de gewone uren.");
    hours = Math.round(hours * 100) / 100;
  }
  return { employeeId: employee.id, shiftTypeId: shift.id, code: shift.code, hours, validFromISO: input.validFrom };
}

const summarize = (b: Balance, fromISO: string): OverrideSummary => {
  const p = periodLeave(b, fromISO, "9999-12-31");
  return { available: b.available, forecastYearEnd: b.forecastYearEnd, forecast: b.forecast, leaveSince: p.total, weeks: p.weeks.filter((w) => !w.ignored).length };
};

/** Laat zien wat het verlofsaldo van deze medewerker wordt met de nieuwe regel, zonder iets op te slaan. */
export async function previewHoursOverride(input: Input): Promise<OverrideResult> {
  try {
    await requireHoursAdmin();
    const rule = await parse(input);
    const todayISO = toISODate(todayAmsterdam());
    // De week waarin de ingangsdatum valt telt mee: verlof wordt per week (vanaf maandag) berekend.
    const [before, after] = await Promise.all([
      loadBalances(todayISO, [rule.employeeId]),
      loadBalances(todayISO, [rule.employeeId], [rule]),
    ]);
    const b = before.get(rule.employeeId)!;
    const a = after.get(rule.employeeId)!;
    const monday = dateFromISO(rule.validFromISO);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const fromISO = toISODate(monday);
    const hoursOf = (list: typeof b.days) => new Map(list.filter((d) => d.dateISO >= fromISO && !d.ignored).map((d) => [d.dateISO, { label: d.label ?? d.dateISO, hours: d.hours }]));
    const bw = hoursOf(b.days);
    const aw = hoursOf(a.days);
    const changedWeeks = [...new Set([...bw.keys(), ...aw.keys()])]
      .sort()
      .map((iso) => ({ label: bw.get(iso)?.label ?? aw.get(iso)?.label ?? iso, before: bw.get(iso)?.hours ?? 0, after: aw.get(iso)?.hours ?? 0 }))
      .filter((w) => Math.abs(w.before - w.after) > 0.001);
    return { preview: { before: summarize(b, fromISO), after: summarize(a, fromISO), changedWeeks } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Berekenen is niet gelukt." };
  }
}

/**
 * Slaat een nieuwe regel op. Oude regels blijven als historie staan (en gelden tot de nieuwe ingangsdatum);
 * alleen een regel voor dezelfde dienst en dezelfde ingangsdatum wordt overschreven (om een vergissing te herstellen).
 */
export async function saveHoursOverride(input: Input & { note: string }): Promise<OverrideResult> {
  try {
    const session = await requireHoursAdmin();
    const rule = await parse(input);
    const note = input.note.trim().slice(0, 300) || null;
    const data = {
      hours: rule.hours,
      note,
      createdById: session.user.id,
      createdByName: session.user.name ?? session.user.email ?? null,
    };
    await prisma.shiftHoursOverride.upsert({
      where: { employeeId_shiftTypeId_validFrom: { employeeId: rule.employeeId, shiftTypeId: rule.shiftTypeId, validFrom: dateFromISO(rule.validFromISO) } },
      update: data,
      create: { employeeId: rule.employeeId, shiftTypeId: rule.shiftTypeId, validFrom: dateFromISO(rule.validFromISO), ...data },
    });
    for (const path of ["/verlofuren", "/verlof", "/uren", "/uren/overzicht", "/ziekte", "/rooster"]) revalidatePath(path);
    return { ok: rule.hours === null ? `${rule.code} telt vanaf de ingangsdatum weer als de gewone uren.` : `${rule.code} telt vanaf de ingangsdatum als ${String(rule.hours).replace(".", ",")} uur.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}
