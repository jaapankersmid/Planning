"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findOverlappingLeave, parseLeaveForm } from "@/lib/leave";
import { dayLabel, isWorking, pieces, type ShiftTypeLite } from "@/lib/shift-swap";
import { todayAmsterdam } from "@/lib/schedule";
import { dateFromISO } from "@/lib/format";
import { formatRange } from "@/lib/format";
import { after } from "next/server";
import { notifyPlannersOfLeaveRequest } from "@/lib/planner-alerts";

export type LeaveFormState = { error?: string; ok?: string } | undefined;

function revalidateLeave() {
  revalidatePath("/verlof");
  revalidatePath("/verlof/overzicht");
}

/** De ingelogde medewerker vraagt verlof aan. Een planner moet dit nog goedkeuren. */
export async function requestLeave(
  _prev: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const session = await auth();
  if (!session?.user) return { error: "Je bent niet ingelogd." };
  const employeeId = session.user.employeeId;
  if (!employeeId) return { error: "Je account is nog niet aan een medewerker gekoppeld." };

  try {
    const { startDate, endDate, note, includeWeekends } = parseLeaveForm(formData, {
      allowPast: false,
    });
    const overlap = await findOverlappingLeave(employeeId, startDate, endDate);
    if (overlap) {
      return {
        error: `Er staat al een aanvraag voor ${formatRange(overlap.startDate, overlap.endDate)}.`,
      };
    }
    const created = await prisma.leaveRequest.create({
      data: {
        employeeId,
        startDate,
        endDate,
        note,
        includeWeekends,
        requestedById: session.user.id,
      },
    });
    // Planners krijgen meteen een mail; dat gebeurt na het antwoord aan de medewerker.
    after(() => notifyPlannersOfLeaveRequest(created.id));
    revalidateLeave();
    return { ok: `Aangevraagd: ${formatRange(startDate, endDate)}. Een planner beoordeelt dit.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Aanvragen is niet gelukt." };
  }
}

/**
 * Dagdeel verlof: de medewerker kiest een ingeplande gebroken dienst en of de ochtend of de middag vrij moet,
 * en geeft optioneel aan welke dienst hij er graag voor in de plaats werkt. Een planner beoordeelt dit.
 */
export async function requestPartLeave(_prev: LeaveFormState, formData: FormData): Promise<LeaveFormState> {
  const session = await auth();
  if (!session?.user) return { error: "Je bent niet ingelogd." };
  const employeeId = session.user.employeeId;
  if (!employeeId) return { error: "Je account is nog niet aan een medewerker gekoppeld." };
  try {
    const part = String(formData.get("part") ?? "");
    if (part !== "MORNING" && part !== "AFTERNOON") throw new Error("Kies of je de ochtend of de middag vrij wilt.");
    const assignment = await prisma.shiftAssignment.findFirst({ where: { id: String(formData.get("assignmentId") ?? ""), employeeId } });
    if (!assignment) throw new Error("Kies een ingeplande dienst.");
    if (assignment.date < todayAmsterdam()) throw new Error("Die dienst is al geweest.");
    const types: ShiftTypeLite[] = await prisma.shiftType.findMany();
    const shift = types.find((t) => t.id === assignment.shiftTypeId);
    if (!shift || !pieces(shift, types)) throw new Error("Van deze dienst kun je niet alleen de ochtend of middag vrij vragen.");

    const swapId = String(formData.get("swapShiftTypeId") ?? "");
    const swap = swapId ? types.find((t) => t.id === swapId && t.active && isWorking(t)) : undefined;
    if (swapId && !swap) throw new Error("De dienst waarvoor je wilt ruilen bestaat niet (meer).");
    const swapDateRaw = String(formData.get("swapDate") ?? "");
    let swapDate: Date | null = null;
    if (swapDateRaw) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(swapDateRaw)) throw new Error("De datum van de ruildienst is ongeldig.");
      swapDate = dateFromISO(swapDateRaw);
      if (swapDate < todayAmsterdam()) throw new Error("De ruildienst ligt in het verleden.");
    }
    const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;

    const overlap = await findOverlappingLeave(employeeId, assignment.date, assignment.date);
    if (overlap) throw new Error(`Er staat al een aanvraag voor ${formatRange(overlap.startDate, overlap.endDate)}.`);

    const created = await prisma.leaveRequest.create({
      data: {
        employeeId, startDate: assignment.date, endDate: assignment.date, includeWeekends: true, note, part,
        shiftTypeId: shift.id, swapShiftTypeId: swap?.id ?? null, swapDate: swap ? swapDate : null, requestedById: session.user.id,
      },
    });
    after(() => notifyPlannersOfLeaveRequest(created.id));
    revalidateLeave();
    return { ok: `Aangevraagd: ${part === "MORNING" ? "de ochtend" : "de middag"} van ${dayLabel(assignment.date)}. Een planner beoordeelt dit.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Aanvragen is niet gelukt." };
  }
}

/** Trekt een eigen, nog niet beoordeelde aanvraag in. */
export async function cancelOwnRequest(requestId: string) {
  const session = await auth();
  const employeeId = session?.user.employeeId;
  if (!employeeId) throw new Error("Je account is nog niet aan een medewerker gekoppeld.");

  await prisma.leaveRequest.updateMany({
    where: { id: requestId, employeeId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  revalidateLeave();
}
