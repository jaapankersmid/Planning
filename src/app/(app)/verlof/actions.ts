"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { findOverlappingLeave, parseLeaveForm } from "@/lib/leave";
import { formatRange } from "@/lib/format";

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
    await prisma.leaveRequest.create({
      data: {
        employeeId,
        startDate,
        endDate,
        note,
        includeWeekends,
        requestedById: session.user.id,
      },
    });
    revalidateLeave();
    return { ok: `Aangevraagd: ${formatRange(startDate, endDate)}. Een planner beoordeelt dit.` };
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
