import { prisma } from "@/lib/prisma";
import { applyAssignment } from "@/lib/assignments";
import { addDays, dateFromISO, toISODate } from "@/lib/format";
import { shiftHours } from "@/lib/hours";
import { todayAmsterdam } from "@/lib/schedule";

/* Automatisch planvoorstel. Per dag, dagdeel (ochtend 8:00-12:30, middag 15:30-19:30) en tag (taak) is een aantal
   mensen nodig. De tags worden gevuld in volgorde van prioriteit (sortOrder, laagste = hoogste prioriteit): eerst alle
   plekken van de bovenste tag, dan de volgende, ook als lagere tags daardoor leeg blijven. Binnen een tag kiest het
   voorstel eerlijk: per kleurgroep krijgt degene met de minste uren als eerste een dienst.
   Bestaande diensten worden nooit aangepast: wie die dag al een dienst heeft (ook V of Z) is niet beschikbaar.
   Bestaande diensten tellen wel mee voor de behoefte: een dienst dekt een taak als hij de tijden van de taak helemaal omvat
   (zie coverFromShifts); dan wordt er alleen het tekort aangevuld.
   Geen opgegeven beschikbaarheid telt als niet beschikbaar. */

export type Part = "MORNING" | "AFTERNOON";
export const PART_LABEL: Record<Part, string> = { MORNING: "Ochtend", AFTERNOON: "Middag" };
export const DEFAULT_PART_HOURS = 4;

export type PlanTagInfo = { id: string; name: string; sortOrder: number; hours: Record<Part, number>; canBoth: boolean };
export type PlanEmployee = { id: string; name: string; colorGroup: string | null; tagIds: string[] };
export type PlanItem = { date: string; part: Part; tagId: string; employeeId: string };
export type PlanGap = { date: string; part: Part; tagId: string; missing: number; reason: string };

export type PlanInput = {
  needs: { date: string; part: Part; tagId: string; count: number }[];
  tags: PlanTagInfo[];
  employees: PlanEmployee[];
  /** "employeeId|YYYY-MM-DD" -> status van de beschikbaarheid. Ontbreekt = niet beschikbaar. */
  availability: Record<string, "AVAILABLE" | "MORNING" | "AFTERNOON" | "UNAVAILABLE">;
  /** "employeeId|YYYY-MM-DD" waar al een dienst staat (ook V of Z). */
  busy: string[];
  /** Uren die iemand in de periode al heeft uit bestaande diensten. */
  baseHours: Record<string, number>;
  /** Plekken die al gedekt zijn door bestaande diensten (van iedereen in het rooster, ook buiten de meedoende kleurgroepen). */
  covered?: { date: string; part: Part; tagId: string; count: number }[];
};

const key = (employeeId: string, date: string) => `${employeeId}|${date}`;
const okFor = (status: string | undefined, part: Part) => status === "AVAILABLE" || status === part;

/** Maakt het voorstel. Zuiver rekenwerk, zonder database. */
export function generatePlan(input: PlanInput): { items: PlanItem[]; gaps: PlanGap[]; hours: Record<string, number>; coveredByExisting: number } {
  const cover = new Map<string, number>();
  for (const c of input.covered ?? []) cover.set(`${c.date}|${c.part}|${c.tagId}`, (cover.get(`${c.date}|${c.part}|${c.tagId}`) ?? 0) + c.count);
  let coveredByExisting = 0;
  const tagById = new Map(input.tags.map((t) => [t.id, t]));
  const busy = new Set(input.busy);
  const hours: Record<string, number> = {};
  for (const e of input.employees) hours[e.id] = input.baseHours[e.id] ?? 0;
  const items: PlanItem[] = [];
  const gaps: PlanGap[] = [];
  // Per medewerker per dag: welke tag en welke delen er al in het voorstel staan.
  const taken = new Map<string, { tagId: string; parts: Set<Part> }>();

  const groupMin = (group: string | null) => {
    let min = Infinity;
    for (const e of input.employees) if (e.colorGroup === group) min = Math.min(min, hours[e.id]);
    return min === Infinity ? 0 : min;
  };

  // Harde volgorde: eerst de tag met de hoogste prioriteit (laagste sortOrder) voor de hele periode, dan de volgende.
  // Binnen een tag op datum en dagdeel.
  const prio = (tagId: string) => tagById.get(tagId)!.sortOrder;
  const slots = input.needs
    .filter((n) => n.count > 0 && tagById.has(n.tagId))
    .sort((a, b) => prio(a.tagId) - prio(b.tagId) || a.tagId.localeCompare(b.tagId) || a.date.localeCompare(b.date) || (a.part === b.part ? 0 : a.part === "MORNING" ? -1 : 1));

  /** Waarom er voor een plek niemand (meer) te vinden is: telt per reden de medewerkers met deze tag. */
  const whyNot = (slot: { date: string; part: Part; tagId: string }) => {
    const holders = input.employees.filter((e) => e.tagIds.includes(slot.tagId));
    if (holders.length === 0) return "Niemand in de meedoende kleurgroepen heeft deze tag.";
    let shift = 0, noAvail = 0, unavail = 0, here = 0;
    const other = new Map<string, number>();
    for (const e of holders) {
      const k = key(e.id, slot.date);
      const st = input.availability[k];
      const t = taken.get(k);
      if (busy.has(k)) shift++;
      else if (!st) noAvail++;
      else if (!okFor(st, slot.part)) unavail++;
      else if (t && t.tagId !== slot.tagId) { const n = tagById.get(t.tagId)?.name ?? "een andere taak"; other.set(n, (other.get(n) ?? 0) + 1); }
      else here++;
    }
    const parts: string[] = [];
    if (shift) parts.push(`${shift} ${shift === 1 ? "heeft" : "hebben"} die dag al een dienst`);
    if (noAvail) parts.push(`${noAvail} geen beschikbaarheid opgegeven`);
    if (unavail) parts.push(`${unavail} niet beschikbaar ${slot.part === "MORNING" ? "'s ochtends" : "'s middags"}`);
    for (const [n, c] of other) parts.push(`${c} al ingezet voor ${n}`);
    if (here) parts.push(`${here} al ingezet voor deze taak${tagById.get(slot.tagId)?.canBoth ? "" : " (er is geen dienst voor ochtend + middag ingesteld)"}`);
    return `${holders.length} met deze tag: ${parts.join(", ")}.`;
  };

  for (const slot of slots) {
    const tag = tagById.get(slot.tagId)!;
    let missing = 0;
    const have = Math.min(slot.count, cover.get(`${slot.date}|${slot.part}|${slot.tagId}`) ?? 0);
    coveredByExisting += have;
    for (let i = 0; i < slot.count - have; i++) {
      const candidates = input.employees.filter((e) => {
        if (!e.tagIds.includes(slot.tagId)) return false;
        const k = key(e.id, slot.date);
        if (busy.has(k) || !okFor(input.availability[k], slot.part)) return false;
        const t = taken.get(k);
        if (!t) return true;
        // Al ingepland die dag: alleen het andere dagdeel met dezelfde tag, en alleen als daar een dienst voor "samen" bestaat.
        return t.tagId === slot.tagId && tag.canBoth && !t.parts.has(slot.part);
      });
      if (candidates.length === 0) { missing++; continue; }
      const mins = new Map<string | null, number>();
      for (const e of candidates) if (!mins.has(e.colorGroup)) mins.set(e.colorGroup, groupMin(e.colorGroup));
      candidates.sort((a, b) => hours[a.id] - mins.get(a.colorGroup)! - (hours[b.id] - mins.get(b.colorGroup)!) || hours[a.id] - hours[b.id] || a.name.localeCompare(b.name, "nl"));
      const pick = candidates[0];
      items.push({ date: slot.date, part: slot.part, tagId: slot.tagId, employeeId: pick.id });
      hours[pick.id] += tag.hours[slot.part];
      const k = key(pick.id, slot.date);
      const t = taken.get(k);
      if (t) t.parts.add(slot.part); else taken.set(k, { tagId: slot.tagId, parts: new Set([slot.part]) });
    }
    if (missing > 0) gaps.push({ date: slot.date, part: slot.part, tagId: slot.tagId, missing, reason: whyNot(slot) });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.part === b.part ? 0 : a.part === "MORNING" ? -1 : 1) || (tagById.get(a.tagId)?.sortOrder ?? 0) - (tagById.get(b.tagId)?.sortOrder ?? 0));
  return { items, gaps, hours, coveredByExisting };
}

type TypeTimes = { id: string; startTime: string | null; endTime: string | null; secondStartTime: string | null; secondEndTime: string | null };
type TagShiftIds = {
  id: string; sortOrder?: number; morningShiftTypeId: string | null; afternoonShiftTypeId: string | null; bothShiftTypeId: string | null;
  morningStart?: string | null; morningEnd?: string | null; afternoonStart?: string | null; afternoonEnd?: string | null;
};
const toMin = (t: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? "").trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
type Win = [number, number];
const win = (a: string | null | undefined, b: string | null | undefined): Win | undefined => { const s = toMin(a), e = toMin(b); return s !== null && e !== null && e > s ? [s, e] : undefined; };
const blocks = (t: TypeTimes | undefined): Win[] => {
  if (!t) return [];
  return [win(t.startTime, t.endTime), win(t.secondStartTime, t.secondEndTime)].filter((w): w is Win => !!w);
};
/** De tijden van een tag per dagdeel: de eigen tijden van de tag, anders die van de dienst voor alleen ochtend/middag, anders het eerste en tweede blok van de dienst voor samen. */
function tagWindows(tag: TagShiftIds, types: Map<string, TypeTimes>): Partial<Record<Part, Win>> {
  const m = blocks(tag.morningShiftTypeId ? types.get(tag.morningShiftTypeId) : undefined)[0];
  const a = blocks(tag.afternoonShiftTypeId ? types.get(tag.afternoonShiftTypeId) : undefined)[0];
  const both = blocks(tag.bothShiftTypeId ? types.get(tag.bothShiftTypeId) : undefined);
  const out: Partial<Record<Part, Win>> = {};
  const mw = win(tag.morningStart, tag.morningEnd) ?? m ?? both[0], aw = win(tag.afternoonStart, tag.afternoonEnd) ?? a ?? both[1];
  if (mw) out.MORNING = mw;
  if (aw) out.AFTERNOON = aw;
  return out;
}
/**
 * Welke plekken zijn al gedekt door bestaande diensten? Een tijdsblok van een bestaande dienst (ook van een lange dienst als O 8:00-17:00 of
 * A 10:30-19:30) dekt een taak als het de tijden van de taak helemaal omvat, of als de dienst voor die taak is ingesteld. Eén persoon doet niet
 * twee taken tegelijk: overlappen de tijden van taken, dan telt het blok voor één ervan. Welke, bepaalt de prioriteit van de tag (hoogste
 * eerst); bij gelijke prioriteit eerst de plek met de minste mogelijke blokken, en een blok gaat naar de taak waar het het minst anders voor
 * kan. De ingestelde dienst telt alleen met het blok dat in de tijd overlapt met de taak: het middagblok van X dekt geen ochtendtaak.
 * Taken zonder behoefte tellen niet mee.
 * Diensten zonder tijden (V, Z) dekken niets.
 */
export function coverFromShifts(
  tags: TagShiftIds[],
  typeRows: TypeTimes[],
  assignments: { shiftTypeId: string | null; date: string }[],
  needs: { date: string; part: Part; tagId: string; count: number }[],
) {
  const types = new Map(typeRows.map((t) => [t.id, t]));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const windows = new Map(tags.map((t) => [t.id, tagWindows(t, types)]));
  const covered: { date: string; part: Part; tagId: string; count: number }[] = [];
  const dates = [...new Set(needs.filter((n) => n.count > 0).map((n) => n.date))];
  for (const date of dates) {
    type Blk = { s: number; e: number; typeId: string; picked: Win[] };
    const blks: Blk[] = [];
    for (const a of assignments) if (a.date === date && a.shiftTypeId) for (const [s, e] of blocks(types.get(a.shiftTypeId))) blks.push({ s, e, typeId: a.shiftTypeId, picked: [] });
    if (blks.length === 0) continue;
    type Slot = { part: Part; tagId: string; w: Win; left: number };
    const slots: Slot[] = [];
    for (const n of needs) {
      const w = n.date === date && n.count > 0 ? windows.get(n.tagId)?.[n.part] : undefined;
      if (w && tagById.has(n.tagId)) slots.push({ part: n.part, tagId: n.tagId, w, left: n.count });
    }
    const can = (b: Blk, sl: Slot) => {
      const tag = tagById.get(sl.tagId)!;
      const exact = (sl.part === "MORNING" ? [tag.morningShiftTypeId, tag.bothShiftTypeId] : [tag.afternoonShiftTypeId, tag.bothShiftTypeId]).includes(b.typeId) && b.s < sl.w[1] && sl.w[0] < b.e;
      return (exact || (b.s <= sl.w[0] && b.e >= sl.w[1])) && !b.picked.some((p) => sl.w[0] < p[1] && p[0] < sl.w[1]);
    };
    for (;;) {
      // De tag met de hoogste prioriteit eerst, dan de plek met de minste mogelijke blokken; daarbinnen het blok dat voor de minste andere plekken kan.
      const prio = (sl: Slot) => tagById.get(sl.tagId)!.sortOrder ?? 0;
      let best: { sl: Slot; b: Blk; k: number; flex: number } | null = null;
      for (const sl of slots) {
        if (sl.left <= 0) continue;
        const cands = blks.filter((b) => can(b, sl));
        if (cands.length === 0) continue;
        for (const b of cands) {
          const flex = slots.filter((o) => o !== sl && o.left > 0 && can(b, o)).length;
          const pd = best ? prio(sl) - prio(best.sl) : -1;
          if (!best || pd < 0 || (pd === 0 && (cands.length < best.k || (cands.length === best.k && flex < best.flex)))) best = { sl, b, k: cands.length, flex };
        }
      }
      if (!best) break;
      best.sl.left--;
      best.b.picked.push(best.sl.w);
      covered.push({ date, part: best.sl.part, tagId: best.sl.tagId, count: 1 });
    }
  }
  return covered;
}

/** Haalt alles uit de database voor [startISO, startISO + dagen). Alleen kleurgroepen die meedoen tellen. */
export async function loadPlanInput(startISO: string, days: number): Promise<PlanInput & { groups: string[]; hasTags: boolean }> {
  const start = dateFromISO(startISO);
  const end = addDays(start, days);
  const [tagRows, groupRows, shiftTypes] = await Promise.all([
    prisma.planTag.findMany({ include: { employees: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.colorGroup.findMany({ where: { planParticipates: true } }),
    prisma.shiftType.findMany(),
  ]);
  const groups = groupRows.map((g) => g.name);
  const employees = await prisma.employee.findMany({ where: { active: true, colorGroup: { in: groups } } });
  const ids = employees.map((e) => e.id);
  const typeHours = (id: string | null) => {
    const t = shiftTypes.find((x) => x.id === id);
    return t ? shiftHours(t) : DEFAULT_PART_HOURS;
  };
  const tags: PlanTagInfo[] = tagRows.map((t) => ({
    id: t.id,
    name: t.name,
    sortOrder: t.sortOrder,
    hours: { MORNING: typeHours(t.morningShiftTypeId), AFTERNOON: typeHours(t.afternoonShiftTypeId) },
    canBoth: !!t.bothShiftTypeId,
  }));
  const [needs, availability, existing, existingAll] = await Promise.all([
    prisma.planNeed.findMany({ where: { date: { gte: start, lt: end } } }),
    prisma.availability.findMany({ where: { employeeId: { in: ids }, date: { gte: start, lt: end } } }),
    prisma.shiftAssignment.findMany({ where: { employeeId: { in: ids }, date: { gte: start, lt: end } }, include: { shiftType: true } }),
    prisma.shiftAssignment.findMany({ where: { date: { gte: start, lt: end } }, select: { shiftTypeId: true, date: true } }),
  ]);
  const covered = coverFromShifts(tagRows, shiftTypes, existingAll.map((a) => ({ shiftTypeId: a.shiftTypeId, date: toISODate(a.date) })), needs.map((n) => ({ date: toISODate(n.date), part: n.part, tagId: n.tagId, count: n.count })));
  const baseHours: Record<string, number> = {};
  for (const a of existing) baseHours[a.employeeId] = (baseHours[a.employeeId] ?? 0) + shiftHours(a.shiftType);
  return {
    groups,
    hasTags: tagRows.length > 0,
    tags,
    employees: employees.map((e) => ({ id: e.id, name: e.name, colorGroup: e.colorGroup, tagIds: tagRows.filter((t) => t.employees.some((x) => x.employeeId === e.id)).map((t) => t.id) })),
    needs: needs.map((n) => ({ date: toISODate(n.date), part: n.part, tagId: n.tagId, count: n.count })),
    availability: Object.fromEntries(availability.map((a) => [key(a.employeeId, toISODate(a.date)), a.status])),
    busy: existing.map((a) => key(a.employeeId, toISODate(a.date))),
    baseHours,
    covered,
  };
}

/** Welke dienst bij een tag hoort voor de gegeven dagdelen (één dagdeel, of beide samen). null als die niet is ingesteld. */
export function shiftTypeForParts(tag: { morningShiftTypeId: string | null; afternoonShiftTypeId: string | null; bothShiftTypeId: string | null }, parts: Set<Part>): string | null {
  return parts.size === 2 ? tag.bothShiftTypeId : parts.has("MORNING") ? tag.morningShiftTypeId : tag.afternoonShiftTypeId;
}

/** Zet het (eventueel aangepaste) voorstel in het rooster. Bestaande diensten blijven onaangeroerd. Geeft terug wat er niet kon. */
export async function applyPlan(items: PlanItem[]): Promise<{ applied: number; skipped: string[] }> {
  const tags = await prisma.planTag.findMany();
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const names = new Map((await prisma.employee.findMany({ select: { id: true, name: true } })).map((e) => [e.id, e.name]));
  const skipped: string[] = [];
  // Per medewerker per dag samenvoegen.
  const perDay = new Map<string, PlanItem[]>();
  for (const it of items) {
    if (!it.employeeId) continue;
    const k = key(it.employeeId, it.date);
    perDay.set(k, [...(perDay.get(k) ?? []), it]);
  }
  let applied = 0;
  for (const [k, list] of perDay) {
    const [employeeId, date] = k.split("|");
    const who = `${names.get(employeeId) ?? "Onbekend"} op ${date}`;
    const tagIds = new Set(list.map((l) => l.tagId));
    if (tagIds.size > 1) { skipped.push(`${who}: twee verschillende taken op één dag past niet in één dienst.`); continue; }
    const tag = tagById.get(list[0].tagId);
    const parts = new Set(list.map((l) => l.part));
    const shiftTypeId = tag ? shiftTypeForParts(tag, parts) : null;
    if (!shiftTypeId) { skipped.push(`${who}: er is geen dienst ingesteld bij de tag ${tag?.name ?? ""}.`); continue; }
    if (dateFromISO(date) < todayAmsterdam()) { skipped.push(`${who}: de dag is al geweest.`); continue; }
    // Opnieuw controleren vlak voor het toepassen: een bestaande dienst mag nooit overschreven worden.
    const exists = await prisma.shiftAssignment.findFirst({ where: { employeeId, date: dateFromISO(date) } });
    if (exists) { skipped.push(`${who}: er staat inmiddels al een dienst.`); continue; }
    await applyAssignment({ employeeId, dateISO: date, shiftTypeId });
    applied++;
  }
  return { applied, skipped };
}
