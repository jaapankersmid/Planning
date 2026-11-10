"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO } from "@/lib/format";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen vakantieperiodes beheren.");
  }
}

function readPeriod(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const start = String(formData.get("startDate") ?? "");
  const end = String(formData.get("endDate") ?? "");
  if (!name) throw new Error("Geef de vakantie een naam.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error("Vul een begin- en einddatum in.");
  }
  if (end < start) throw new Error("De einddatum ligt voor de begindatum.");

  const wish = (key: string) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error("Een wensaantal moet een heel getal van 0 of meer zijn.");
    }
    return value;
  };

  return {
    name,
    startDate: dateFromISO(start),
    endDate: dateFromISO(end),
    wantMorning: wish("wantMorning"),
    wantAfternoon: wish("wantAfternoon"),
  };
}

function revalidateAll() {
  revalidatePath("/vakanties");
  revalidatePath("/rooster");
}

export async function addHoliday(formData: FormData) {
  await requireAdmin();
  await prisma.holidayPeriod.create({ data: readPeriod(formData) });
  revalidateAll();
}

export async function updateHoliday(id: string, formData: FormData) {
  await requireAdmin();
  await prisma.holidayPeriod.update({ where: { id }, data: readPeriod(formData) });
  revalidateAll();
  redirect("/vakanties");
}

export async function deleteHoliday(id: string) {
  await requireAdmin();
  await prisma.holidayPeriod.deleteMany({ where: { id } });
  revalidateAll();
}
