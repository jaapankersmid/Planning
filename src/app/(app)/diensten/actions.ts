"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen diensttypen beheren.");
  }
}

function emptyToNull(value: FormDataEntryValue | null) {
  const str = String(value ?? "").trim();
  return str || null;
}

export async function addShiftType(formData: FormData) {
  await requireAdmin();

  const code = String(formData.get("code") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const color = String(formData.get("color") ?? "#2f6e63");
  if (!code || !label) throw new Error("Code en omschrijving zijn verplicht.");

  await prisma.shiftType.create({
    data: {
      code,
      label,
      color,
      startTime: emptyToNull(formData.get("startTime")),
      endTime: emptyToNull(formData.get("endTime")),
      secondStartTime: emptyToNull(formData.get("secondStartTime")),
      secondEndTime: emptyToNull(formData.get("secondEndTime")),
      countsMorningWalk: formData.get("countsMorningWalk") === "on",
      countsEveningWalk: formData.get("countsEveningWalk") === "on",
    },
  });

  revalidatePath("/diensten");
  revalidatePath("/rooster");
}

export async function setShiftTypeActive(shiftTypeId: string, active: boolean) {
  await requireAdmin();
  await prisma.shiftType.update({ where: { id: shiftTypeId }, data: { active } });
  revalidatePath("/diensten");
  revalidatePath("/rooster");
}
