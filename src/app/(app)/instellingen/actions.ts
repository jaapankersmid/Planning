"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { tooMany } from "@/lib/rate-limit";
import { SETTING_KEYS, getStoredSettings, invalidateSettings, validateSetting, type SettingKey } from "@/lib/settings";

export type SaveSettingsInput = {
  /** Nieuwe waarden per sleutel; leeg = terug naar .env of de standaard. */
  changes: Record<string, string>;
  /** De waarden zoals de planner ze zag (om gelijktijdige wijzigingen te herkennen). */
  expected: Record<string, string>;
  /** Eerste bevestiging: de planner heeft het overzicht oud -> nieuw gezien en bevestigd. */
  acknowledged: boolean;
  /** Tweede bevestiging: het eigen wachtwoord. */
  password: string;
};
export type SaveSettingsResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Slaat gewijzigde instellingen op. Alleen voor planners (ADMIN), alleen met beide bevestigingen
 * (overzicht bevestigd en eigen wachtwoord), en elke wijziging komt in het logboek.
 */
export async function saveSettings(input: SaveSettingsInput): Promise<SaveSettingsResult> {
  const session = await auth();
  if (session?.user.role !== "ADMIN") return { ok: false, error: "Alleen planners kunnen de instellingen wijzigen." };
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true, active: true, passwordHash: true } });
  if (!me || !me.active || me.role !== "ADMIN") return { ok: false, error: "Alleen planners kunnen de instellingen wijzigen." };

  if (input?.acknowledged !== true) return { ok: false, error: "Bevestig eerst het overzicht van de wijzigingen." };
  if (tooMany(`settings-password:${me.id}`, 5, 15 * 60 * 1000)) return { ok: false, error: "Te vaak geprobeerd. Wacht een kwartier en probeer het opnieuw." };
  if (typeof input.password !== "string" || !input.password || !verifyPassword(input.password, me.passwordHash)) {
    return { ok: false, error: "Je wachtwoord klopt niet. Er is niets opgeslagen." };
  }

  const changes = new Map<SettingKey, string>();
  for (const [key, raw] of Object.entries(input.changes ?? {})) {
    if (!SETTING_KEYS.includes(key as SettingKey)) return { ok: false, error: "Onbekende instelling. Er is niets opgeslagen." };
    const value = String(raw ?? "").trim();
    const problem = validateSetting(key, value);
    if (problem) return { ok: false, error: `${problem} Er is niets opgeslagen.` };
    changes.set(key as SettingKey, value);
  }

  invalidateSettings();
  const stored = await getStoredSettings();
  const real: { key: SettingKey; oldValue: string; newValue: string }[] = [];
  for (const [key, value] of changes) {
    const current = stored.get(key) ?? "";
    if (String(input.expected?.[key] ?? "") !== current) {
      return { ok: false, error: "De instellingen zijn intussen door iemand anders gewijzigd. Laad de pagina opnieuw. Er is niets opgeslagen." };
    }
    if (current !== value) real.push({ key, oldValue: current, newValue: value });
  }
  if (real.length === 0) return { ok: false, error: "Er is niets gewijzigd." };

  await prisma.$transaction([
    ...real.map((c) =>
      c.newValue
        ? prisma.appSetting.upsert({ where: { key: c.key }, update: { value: c.newValue }, create: { key: c.key, value: c.newValue } })
        : prisma.appSetting.deleteMany({ where: { key: c.key } }),
    ),
    prisma.appSettingChange.createMany({
      data: real.map((c) => ({ key: c.key, oldValue: c.oldValue || null, newValue: c.newValue || null, changedById: me.id, changedByName: me.name ?? me.email })),
    }),
  ]);
  invalidateSettings();
  revalidatePath("/", "layout");
  return { ok: true, message: `${real.length} instelling${real.length === 1 ? "" : "en"} opgeslagen. Ze gelden meteen.` };
}
