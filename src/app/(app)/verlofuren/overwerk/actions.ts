"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageHours } from "@/lib/roles";
import { invalidateSettings } from "@/lib/settings";
import { OVERTIME_SETTING, overtimeEnabled } from "@/lib/leave-balance";

/** Zet overwerk bijschrijven bij het verlof aan of uit (voor iedereen). Alleen administratie en planner. */
export async function setOvertime(on: boolean) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) throw new Error("Geen toegang.");
  const current = await overtimeEnabled();
  if (current !== on) {
    await prisma.$transaction([
      on
        ? prisma.appSetting.upsert({ where: { key: OVERTIME_SETTING }, update: { value: "on" }, create: { key: OVERTIME_SETTING, value: "on" } })
        : prisma.appSetting.deleteMany({ where: { key: OVERTIME_SETTING } }),
      prisma.appSettingChange.create({
        data: {
          key: OVERTIME_SETTING,
          oldValue: current ? "on" : null,
          newValue: on ? "on" : null,
          changedById: session.user.id,
          changedByName: session.user.name ?? session.user.email ?? null,
        },
      }),
    ]);
    invalidateSettings();
  }
  revalidatePath("/verlofuren", "layout");
  revalidatePath("/verlof");
  redirect("/verlofuren/overwerk");
}
