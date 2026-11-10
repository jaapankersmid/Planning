"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  approveLeave,
  findOverlappingLeave,
  parseLeaveForm,
  revokeApprovedLeave,
} from "@/lib/leave";
import { formatRange } from "@/lib/format";
import type { LeaveFormState } from "../actions";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen planners kunnen verlof beoordelen.");
  }
  return session;
}

function revalidateAll() {
  revalidatePath("/verlof");
  revalidatePath("/verlof/overzicht");
  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
  revalidatePath("/bezetting");
}

/** Goedkeuren of afwijzen (de knop bepaalt dat via het veld "decision"). */
export async function decideLeave(requestId: string, formData: FormData) {
  const session = await requireAdmin();
  const note = String(formData.get("note") ?? "").trim().slice(0, 300) || null;

  if (formData.get("decision") === "reject") {
    await prisma.leaveRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: {
        status: "REJECTED",
        decidedById: session.user.id,
        decidedAt: new Date(),
        decisionNote: note,
      },
    });
  } else {
    await approveLeave(requestId, session.user.id, note);
  }
  revalidateAll();
}

/** Trekt een goedgekeurde aanvraag in; de V-dagen vanaf vandaag verdwijnen uit het rooster. */
export async function revokeLeave(requestId: string) {
  await requireAdmin();
  await revokeApprovedLeave(requestId);
  revalidateAll();
}

/** Een planner legt verlof vast namens een medewerker; dat is meteen goedgekeurd. */
export async function addLeaveForEmployee(
  _prev: LeaveFormState,
  formData: FormData,
): Promise<LeaveFormState> {
  const session = await requireAdmin();
  const employeeId = String(formData.get("employeeId") ?? "");
  if (!employeeId) return { error: "Kies een medewerker." };

  try {
    const { startDate, endDate, note, includeWeekends } = parseLeaveForm(formData, {
      allowPast: true,
    });
    const overlap = await findOverlappingLeave(employeeId, startDate, endDate);
    if (overlap) {
      return {
        error: `Er staat al een aanvraag voor ${formatRange(overlap.startDate, overlap.endDate)}.`,
      };
    }
    const request = await prisma.leaveRequest.create({
      data: {
        employeeId,
        startDate,
        endDate,
        note,
        includeWeekends,
        requestedById: session.user.id,
      },
    });
    await approveLeave(request.id, session.user.id, "Door planner vastgelegd");
    revalidateAll();
    return { ok: `Vastgelegd: ${formatRange(startDate, endDate)}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Vastleggen is niet gelukt." };
  }
}
