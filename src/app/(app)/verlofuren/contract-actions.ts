"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, toISODate } from "@/lib/format";
import { loadBalances, type Balance } from "@/lib/leave-balance";
import { BEGIN_ISO, loadContractRules, mondayOfISO, syncWeeklyHours, type ContractRule } from "@/lib/contract-hours";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";

type Input = { employeeId: string; validFrom: string; hours: string; remove?: boolean };

export type ContractSummary = { available: number; forecastYearEnd: number; leaveSince: number; overtimeSince: number };
export type ContractPreview = {
  mondayISO: string;
  retroactive: boolean;
  before: ContractSummary;
  after: ContractSummary;
  changedWeeks: { dateISO: string; label: string; before: number; after: number; kind: "verlof" | "overwerk" }[];
};
export type ContractResult = { error: string } | { ok: string } | { preview: ContractPreview };

async function requireHoursAdmin() {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) {
    throw new Error("Alleen administratie en planners kunnen de contracturen aanpassen.");
  }
  return session;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Controleert de invoer; de ingangsdatum wordt de maandag van die week. */
async function parse(input: Input) {
  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId }, select: { id: true, weeklyHours: true } });
  if (!employee) throw new Error("Medewerker niet gevonden.");
  let mondayISO: string;
  if (input.validFrom === BEGIN_ISO) mondayISO = BEGIN_ISO;
  else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.validFrom) || Number.isNaN(dateFromISO(input.validFrom).getTime())) {
      throw new Error("Kies een geldige ingangsdatum.");
    }
    mondayISO = mondayOfISO(input.validFrom);
  }
  let hours = 0;
  if (!input.remove) {
    const text = input.hours.trim().replace(",", ".");
    hours = Number(text);
    if (text === "" || !Number.isFinite(hours) || hours < 0 || hours > 80) {
      throw new Error("Vul de uren per week in als getal van 0 tot en met 80, bijvoorbeeld 32 of 38,5.");
    }
    hours = round(hours);
  }
  const existing = (await loadContractRules([employee.id])).get(employee.id) ?? [];
  return { employee, mondayISO, hours, existing };
}

/**
 * De periodes na de wijziging. Bij de eerste periode met een datum blijft het oude getal bewaard als "vanaf het
 * begin", zodat eerdere weken niet veranderen.
 */
function rulesAfter(existing: ContractRule[], weeklyHours: number | null, mondayISO: string, hours: number, remove: boolean): ContractRule[] {
  const map = new Map(existing.map((r) => [r.fromISO, r.hours]));
  if (map.size === 0 && weeklyHours !== null && mondayISO !== BEGIN_ISO && !remove) map.set(BEGIN_ISO, weeklyHours);
  if (remove) map.delete(mondayISO);
  else map.set(mondayISO, hours);
  return [...map.entries()].map(([fromISO, h]) => ({ fromISO, hours: h })).sort((a, b) => a.fromISO.localeCompare(b.fromISO));
}

const summarize = (b: Balance, fromISO: string): ContractSummary => ({
  available: b.available,
  forecastYearEnd: b.forecastYearEnd,
  leaveSince: round(b.days.filter((d) => d.dateISO >= fromISO && !d.ignored).reduce((s, d) => s + d.hours, 0)),
  overtimeSince: round(b.overtime.filter((w) => w.dateISO >= fromISO && w.status !== "ignored").reduce((s, w) => s + w.hours, 0)),
});

/** Laat zien wat het verlof van deze medewerker wordt met de wijziging, zonder iets op te slaan. */
export async function previewContract(input: Input): Promise<ContractResult> {
  try {
    await requireHoursAdmin();
    const { employee, mondayISO, hours, existing } = await parse(input);
    if (input.remove && !existing.some((r) => r.fromISO === mondayISO)) return { error: "Deze periode bestaat niet (meer)." };
    const todayISO = toISODate(todayAmsterdam());
    const rules = rulesAfter(existing, employee.weeklyHours, mondayISO, hours, !!input.remove);
    const [before, after] = await Promise.all([
      loadBalances(todayISO, [employee.id]),
      loadBalances(todayISO, [employee.id], { contractRules: { employeeId: employee.id, rules } }),
    ]);
    const b = before.get(employee.id)!;
    const a = after.get(employee.id)!;
    const weeks = (bal: Balance) => {
      const m = new Map<string, { label: string; hours: number; kind: "verlof" | "overwerk" }>();
      for (const d of bal.days) if (!d.ignored) m.set(`v_${d.dateISO}`, { label: d.label ?? d.dateISO, hours: d.hours, kind: "verlof" });
      for (const w of bal.overtime) if (w.status !== "ignored") m.set(`o_${w.dateISO}`, { label: w.label, hours: w.hours, kind: "overwerk" });
      return m;
    };
    const bw = weeks(b);
    const aw = weeks(a);
    const changedWeeks = [...new Set([...bw.keys(), ...aw.keys()])]
      .sort((x, y) => x.slice(2).localeCompare(y.slice(2)))
      .map((key) => {
        const info = bw.get(key) ?? aw.get(key)!;
        return { dateISO: key.slice(2), label: info.label, kind: info.kind, before: bw.get(key)?.hours ?? 0, after: aw.get(key)?.hours ?? 0 };
      })
      .filter((w) => Math.abs(w.before - w.after) > 0.001);
    const fromISO = mondayISO === BEGIN_ISO ? "0000-01-01" : mondayISO;
    return {
      preview: {
        mondayISO,
        retroactive: mondayISO < mondayOfISO(todayISO),
        before: summarize(b, fromISO),
        after: summarize(a, fromISO),
        changedWeeks,
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Berekenen is niet gelukt." };
  }
}

/** Slaat een periode op (of past die aan: dezelfde maandag), of verwijdert hem. Alles komt in het logboek. */
export async function saveContract(input: Input): Promise<ContractResult> {
  try {
    const session = await requireHoursAdmin();
    const { employee, mondayISO, hours, existing } = await parse(input);
    const by = { changedById: session.user.id, changedByName: session.user.name ?? session.user.email ?? null };
    const old = existing.find((r) => r.fromISO === mondayISO);
    const ops = [];
    if (input.remove) {
      if (!old) return { error: "Deze periode bestaat niet (meer)." };
      ops.push(prisma.contractHours.deleteMany({ where: { employeeId: employee.id, validFrom: dateFromISO(mondayISO) } }));
      ops.push(prisma.contractHoursChange.create({ data: { employeeId: employee.id, validFrom: dateFromISO(mondayISO), oldHours: old.hours, newHours: null, ...by } }));
    } else {
      // Eerste periode met een datum: het oude getal blijft gelden "vanaf het begin".
      if (existing.length === 0 && employee.weeklyHours !== null && mondayISO !== BEGIN_ISO) {
        ops.push(prisma.contractHours.create({ data: { employeeId: employee.id, validFrom: dateFromISO(BEGIN_ISO), hours: employee.weeklyHours, createdById: by.changedById, createdByName: by.changedByName } }));
        ops.push(prisma.contractHoursChange.create({ data: { employeeId: employee.id, validFrom: dateFromISO(BEGIN_ISO), oldHours: null, newHours: employee.weeklyHours, ...by } }));
      }
      ops.push(
        prisma.contractHours.upsert({
          where: { employeeId_validFrom: { employeeId: employee.id, validFrom: dateFromISO(mondayISO) } },
          update: { hours, createdById: by.changedById, createdByName: by.changedByName },
          create: { employeeId: employee.id, validFrom: dateFromISO(mondayISO), hours, createdById: by.changedById, createdByName: by.changedByName },
        }),
      );
      ops.push(prisma.contractHoursChange.create({ data: { employeeId: employee.id, validFrom: dateFromISO(mondayISO), oldHours: old?.hours ?? null, newHours: hours, ...by } }));
    }
    await prisma.$transaction(ops);
    const todayISO = toISODate(todayAmsterdam());
    await syncWeeklyHours(employee.id, todayISO);
    for (const path of ["/verlofuren", "/verlof", "/medewerkers", "/ziekte", "/uren/overzicht"]) revalidatePath(path);
    revalidatePath(`/verlofuren/${employee.id}`);
    return { ok: input.remove ? "De periode is verwijderd." : "De contracturen zijn opgeslagen." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Opslaan is niet gelukt." };
  }
}
