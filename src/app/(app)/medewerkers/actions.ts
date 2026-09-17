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
