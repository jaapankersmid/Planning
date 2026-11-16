import { prisma } from "@/lib/prisma";
import { applyAssignment } from "@/lib/assignments";
import { addDays, dateFromISO, toISODate } from "@/lib/format";
import { shiftHours } from "@/lib/hours";
import { todayAmsterdam } from "@/lib/schedule";

/* Automatisch planvoorstel. Per dag, dagdeel (ochtend 8:00-12:30, middag 15:30-19:30) en tag (taak) is een aantal
   mensen nodig. Het voorstel kiest eerlijk: per kleurgroep krijgt degene met de minste uren als eerste een dienst.
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
export type PlanGap = { date: string; part: Part; tagId: string; missing: number };

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

  // Eerst de taken met de minste mogelijke mensen, dan op datum en dagdeel.
  const candidateCount = (tagId: string) => input.employees.filter((e) => e.tagIds.includes(tagId)).length;
  const slots = input.needs
    .filter((n) => n.count > 0 && tagById.has(n.tagId))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.part === b.part ? 0 : a.part === "MORNING" ? -1 : 1) || candidateCount(a.tagId) - candidateCount(b.tagId) || tagById.get(a.tagId)!.sortOrder - tagById.get(b.tagId)!.sortOrder);

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
    if (missing > 0) gaps.push({ date: slot.date, part: slot.part, tagId: slot.tagId, missing });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.part === b.part ? 0 : a.part === "MORNING" ? -1 : 1) || (tagById.get(a.tagId)?.sortOrder ?? 0) - (tagById.get(b.tagId)?.sortOrder ?? 0));
  return { items, gaps, hours, coveredByExisting };
}

type TypeTimes = { id: string; startTime: string | null; endTime: string | null; secondStartTime: string | null; secondEndTime: string | null };
type TagShiftIds = {
  id: string; morningShiftTypeId: string | null; afternoonShiftTypeId: string | null; bothShiftTypeId: string | null;
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
 * Welke plekken zijn al gedekt door bestaande diensten? Een tijdsblok van een bestaande dienst dekt een taak als het de tijden van de taak
 * helemaal omvat (bv. uitlaten 8:00-10:00 en 15:30-17:00, balie 9:00-10:00 en 18:00-19:00, schoonmaken 8:00-12:30 en 15:30-19:30).
 * Eén persoon kan niet twee taken tegelijk doen: overlappen de tijden van taken, dan telt het blok voor één taak. Daarbij gaat de taak waarvoor de dienst
 * is ingesteld voor, daarna de taak waarvan de tijden het best bij het blok passen. Diensten zonder tijden (V, Z) dekken niets.
 */
export function coverFromShifts(tags: TagShiftIds[], typeRows: TypeTimes[], assignments: { shiftTypeId: string | null; date: string }[]) {
  const types = new Map(typeRows.map((t) => [t.id, t]));
  const wins = tags.map((t) => ({ tag: t, w: tagWindows(t, types) }));
  const covered: { date: string; part: Part; tagId: string; count: number }[] = [];
  for (const a of assignments) {
    if (!a.shiftTypeId) continue;
    for (const [s, e] of blocks(types.get(a.shiftTypeId))) {
      const cands: { tagId: string; part: Part; w: Win; score: number }[] = [];
      for (const { tag, w } of wins) {
        for (const part of ["MORNING", "AFTERNOON"] as Part[]) {
          const tw = w[part];
          if (!tw) continue;
          const exact = (part === "MORNING" ? [tag.morningShiftTypeId, tag.bothShiftTypeId] : [tag.afternoonShiftTypeId, tag.bothShiftTypeId]).includes(a.shiftTypeId);
          const contains = s <= tw[0] && e >= tw[1];
          if (!contains && !exact) continue;
          cands.push({ tagId: tag.id, part, w: tw, score: (exact ? 1 : 0) + (tw[1] - tw[0]) / (e - s) });
        }
      }
      cands.sort((x, y) => y.score - x.score);
      const picked: typeof cands = [];
      for (const c of cands) {
        if (picked.some((p) => (p.tagId === c.tagId && p.part === c.part) || (c.w[0] < p.w[1] && p.w[0] < c.w[1]))) continue;
        picked.push(c);
        covered.push({ date: a.date, part: c.part, tagId: c.tagId, count: 1 });
      }
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
  const covered = coverFromShifts(tagRows, shiftTypes, existingAll.map((a) => ({ shiftTypeId: a.shiftTypeId, date: toISODate(a.date) })));
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
