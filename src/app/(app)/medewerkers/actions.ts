"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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
