"use server";

import { revalidatePath } from "next/cache";
import type { ShiftPart } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { todayAmsterdam } from "@/lib/schedule";
import { applyChanges, isBroken, isWorking, pieces, planSwap, type ShiftTypeLite } from "@/lib/shift-swap";
import { notifySwapDecided, notifyTargetOfSwap } from "@/lib/shift-swap-mail";

export type SwapFormState = { error?: string; ok?: string } | undefined;

const PARTS: ShiftPart[] = ["ALL", "MORNING", "AFTERNOON"];
const asPart = (v: FormDataEntryValue | null): ShiftPart => (PARTS.includes(String(v) as ShiftPart) ? (String(v) as ShiftPart) : "ALL");

async function me() {
  const session = await auth();
  if (!session?.user?.employeeId) throw new Error("Aan jouw account is geen medewerker gekoppeld.");
  return { employeeId: session.user.employeeId };
}

function refresh() {
  revalidatePath("/rooster/mijn");
  revalidatePath("/rooster");
  revalidatePath("/bezetting");
}

/** Een medewerker vraagt een collega een dienst (of deel ervan) over te nemen, eventueel in ruil voor een dienst van die collega. */
export async function createSwapRequest(_prev: SwapFormState, fd: FormData): Promise<SwapFormState> {
  const { employeeId } = await me();
  const assignmentId = String(fd.get("assignmentId") ?? "");
  const targetId = String(fd.get("targetId") ?? "");
  const returnAssignmentId = String(fd.get("returnAssignmentId") ?? "");
  const part = asPart(fd.get("part"));
  const returnPart = asPart(fd.get("returnPart"));
  const note = String(fd.get("note") ?? "").trim().slice(0, 300) || null;
  if (!assignmentId || !targetId) return { error: "Kies je dienst en een collega." };
  if (targetId === employeeId) return { error: "Je kunt niet met jezelf ruilen." };

  const types: ShiftTypeLite[] = await prisma.shiftType.findMany();
  const [mine, target, theirs] = await Promise.all([
    prisma.shiftAssignment.findFirst({ where: { id: assignmentId, employeeId }, include: { shiftType: true } }),
    prisma.employee.findFirst({ where: { id: targetId, active: true }, include: { user: true } }),
    returnAssignmentId ? prisma.shiftAssignment.findFirst({ where: { id: returnAssignmentId, employeeId: targetId }, include: { shiftType: true } }) : null,
  ]);
  if (!mine) return { error: "Die dienst is niet gevonden." };
  if (!target || !target.user?.active) return { error: "Deze collega kan geen ruilverzoek ontvangen (geen actief account)." };
  if (returnAssignmentId && !theirs) return { error: "De dienst van de collega is niet gevonden." };
  if (mine.date < todayAmsterdam()) return { error: "Een dienst die al geweest is kan niet meer geruild worden." };
  if (!isWorking(mine.shiftType)) return { error: "Alleen een dienst met werktijden kan geruild worden." };
  if (part !== "ALL" && !(isBroken(mine.shiftType) && pieces(mine.shiftType, types))) return { error: "Deze dienst kan niet in delen geruild worden." };

  const dup = await prisma.shiftSwapRequest.findFirst({ where: { requesterId: employeeId, date: mine.date, shiftTypeId: mine.shiftTypeId, status: "PENDING" } });
  if (dup) return { error: "Voor deze dienst loopt al een ruilverzoek." };

  const draft = {
    requesterId: employeeId,
    targetId,
    date: mine.date,
    shiftTypeId: mine.shiftTypeId,
    part,
    returnDate: theirs?.date ?? null,
    returnShiftTypeId: theirs?.shiftTypeId ?? null,
    returnPart: theirs ? returnPart : null,
  };
  const plan = await planSwap(draft);
  if ("error" in plan) return { error: plan.error };

  const created = await prisma.shiftSwapRequest.create({ data: { ...draft, note } });
  await notifyTargetOfSwap(created.id);
  refresh();
  return { ok: `Verzoek verstuurd naar ${target.name}.` };
}

/** De gevraagde collega accepteert of wijst af. Bij acceptatie wordt het rooster meteen aangepast. */
export async function respondToSwap(id: string, accept: boolean, reason?: string) {
  const { employeeId } = await me();
  const req = await prisma.shiftSwapRequest.findFirst({ where: { id, targetId: employeeId, status: "PENDING" } });
  if (!req) throw new Error("Dit verzoek is niet meer open.");

  if (!accept) {
    await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "DECLINED", decidedAt: new Date(), decisionNote: reason?.trim().slice(0, 300) || null } });
    await notifySwapDecided(id);
    refresh();
    return;
  }

  const plan = await planSwap(req);
  if ("error" in plan) {
    // Het rooster is intussen veranderd of de ruil past niet meer: het verzoek vervalt.
    await prisma.shiftSwapRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date(), decisionNote: plan.error } });
    refresh();
    throw new Error(`De ruil kan niet doorgaan: ${plan.error}`);
  }
  // Eerst het verzoek claimen, zodat een dubbele klik het rooster niet twee keer aanpast.
  const claimed = await prisma.shiftSwapRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "ACCEPTED", decidedAt: new Date() } });
  if (claimed.count === 0) throw new Error("Dit verzoek is niet meer open.");
  await applyChanges(plan.changes);
  await notifySwapDecided(id);
  refresh();
}

/** De aanvrager trekt een openstaand verzoek in. */
export async function cancelSwap(id: string) {
  const { employeeId } = await me();
  const res = await prisma.shiftSwapRequest.updateMany({ where: { id, requesterId: employeeId, status: "PENDING" }, data: { status: "CANCELLED", decidedAt: new Date() } });
  if (res.count === 0) throw new Error("Dit verzoek is niet meer open.");
  refresh();
}
