"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { removeFromCalendar } from "@/lib/assignments";
import { todayAmsterdam } from "@/lib/schedule";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen medewerkers beheren.");
  }
}

export async function addEmployee(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Naam is verplicht.");
  const colorGroup = String(formData.get("colorGroup") ?? "").trim() || null;

  await prisma.employee.create({ data: { name, colorGroup } });
  revalidatePath("/medewerkers");
}

export async function setEmployeeActive(employeeId: string, active: boolean) {
  await requireAdmin();
  await prisma.employee.update({ where: { id: employeeId }, data: { active } });
  revalidatePath("/medewerkers");
  revalidatePath("/rooster");
}

export async function unlinkEmployeeAccount(employeeId: string) {
  await requireAdmin();
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });
  if (employee?.user) {
    await prisma.user.update({
      where: { id: employee.user.id },
      data: { employeeId: null },
    });
  }
  revalidatePath("/medewerkers");
}

export type DeleteInfo = {
  name: string;
  accountEmail: string | null;
  counts: { label: string; n: number }[];
};

/** Wat er verdwijnt als deze medewerker definitief wordt verwijderd (voor de eerste bevestiging). */
export async function employeeDeleteInfo(employeeId: string): Promise<DeleteInfo | { error: string }> {
  await requireAdmin();
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, include: { user: { select: { email: true } } } });
  if (!employee) return { error: "Medewerker niet gevonden." };
  const where = { employeeId };
  const [assignments, entries, leave, allowances, adjustments, availability, contracts, swaps] = await Promise.all([
    prisma.shiftAssignment.count({ where }),
    prisma.timeEntry.count({ where }),
    prisma.leaveRequest.count({ where }),
    prisma.leaveAllowance.count({ where }),
    prisma.leaveAdjustment.count({ where }),
    prisma.availability.count({ where }),
    prisma.contractHours.count({ where }),
    prisma.shiftSwapRequest.count({ where: { OR: [{ requesterId: employeeId }, { targetId: employeeId }] } }),
  ]);
  return {
    name: employee.name,
    accountEmail: employee.user?.email ?? null,
    counts: [
      { label: "diensten in het rooster", n: assignments },
      { label: "dagen met geregistreerde uren", n: entries },
      { label: "verlofaanvragen", n: leave },
      { label: "verloftegoeden", n: allowances },
      { label: "verlofcorrecties", n: adjustments },
      { label: "dagen met beschikbaarheid", n: availability },
      { label: "contractperiodes", n: contracts },
      { label: "ruilverzoeken", n: swaps },
    ].filter((c) => c.n > 0),
  };
}

/**
 * Verwijdert een medewerker definitief, met alles wat erbij hoort (rooster, uren, verlof, beschikbaarheid ...).
 * Tweede bevestiging: de naam moet worden ingetypt; dat wordt hier op de server opnieuw gecontroleerd.
 * Een gekoppeld account blijft bestaan (zonder medewerker). Komende diensten worden eerst uit de Google-agenda gehaald.
 */
export async function deleteEmployee(employeeId: string, typedName: string): Promise<{ error: string } | { ok: string }> {
  await requireAdmin();
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true, name: true } });
  if (!employee) return { error: "Medewerker niet gevonden." };
  if (typedName.trim().toLowerCase() !== employee.name.trim().toLowerCase()) {
    return { error: "De ingetypte naam klopt niet. Er is niets verwijderd." };
  }
  // Best effort: komende diensten uit de agenda van het gekoppelde account halen.
  const synced = await prisma.shiftAssignment.findMany({
    where: { employeeId, date: { gte: todayAmsterdam() }, OR: [{ googleEventId: { not: null } }, { googleEventId2: { not: null } }] },
    select: { id: true, googleEventId: true, googleEventId2: true, employeeId: true },
  });
  for (const a of synced) await removeFromCalendar(a);

  await prisma.$transaction([
    prisma.user.updateMany({ where: { employeeId }, data: { employeeId: null } }),
    prisma.employee.delete({ where: { id: employeeId } }),
  ]);
  for (const path of ["/medewerkers", "/rooster", "/vast-rooster", "/gebruikers", "/verlofuren", "/uren/overzicht", "/ziekte", "/verlof/overzicht", "/bezetting"]) {
    revalidatePath(path);
  }
  return { ok: `${employee.name} is definitief verwijderd.` };
}

export async function setEmployeeColorGroup(employeeId: string, colorGroup: string | null) {
  await requireAdmin();
  await prisma.employee.update({ where: { id: employeeId }, data: { colorGroup } });
  revalidatePath("/medewerkers");
  revalidatePath("/rooster");
  revalidatePath("/vast-rooster");
}

/** Verschuift een kleurgroep één plek omhoog of omlaag in de volgorde van het rooster. */
export async function moveColorGroup(groupId: string, direction: "up" | "down") {
  await requireAdmin();
  const groups = await prisma.colorGroup.findMany({ orderBy: { sortOrder: "asc" } });
  const index = groups.findIndex((g) => g.id === groupId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= groups.length) return;

  const reordered = [...groups];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  await prisma.$transaction(
    reordered.map((g, i) =>
      prisma.colorGroup.update({ where: { id: g.id }, data: { sortOrder: i } }),
    ),
  );
  revalidatePath("/medewerkers");
  revalidatePath("/rooster");
  revalidatePath("/vast-rooster");
}

/** Bepaalt of een kleurgroep meetelt in de bezetting bovenin het rooster. */
export async function setColorGroupCoverage(groupId: string, counts: boolean) {
  await requireAdmin();
  await prisma.colorGroup.update({ where: { id: groupId }, data: { countsInCoverage: counts } });
  revalidatePath("/medewerkers");
  revalidatePath("/rooster");
}

/**
 * Bepaalt of afwijkingen van het vaste rooster voor een kleurgroep met een oranje rand worden
 * getoond. Het vaste rooster zelf wordt voor elke groep doorgevoerd.
 */
export async function setColorGroupTemplate(groupId: string, uses: boolean) {
  await requireAdmin();
  await prisma.colorGroup.update({ where: { id: groupId }, data: { usesTemplate: uses } });

  revalidatePath("/medewerkers");
  revalidatePath("/vast-rooster");
  revalidatePath("/rooster");
  revalidatePath("/rooster/mijn");
  revalidatePath("/bezetting");
}
