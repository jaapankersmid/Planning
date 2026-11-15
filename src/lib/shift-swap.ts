import type { ShiftPart } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyAssignment } from "@/lib/assignments";
import { dateFromISO, monthName, toISODate, weekdayShort } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";

/* Dienst ruilen. Het rooster kent één dienst per medewerker per dag. Een gebroken dienst (twee tijdsblokken,
   bv. X = 8:00-12:30 én 15:30-19:30) kan in delen worden geruild: de ochtend en de middag zijn dan losse
   diensten (XI en IX) die al bestaan als dienst-type. Het rooster verandert pas als de collega accepteert. */

export type ShiftTypeLite = {
  id: string;
  code: string;
  label: string;
  startTime: string | null;
  endTime: string | null;
  secondStartTime: string | null;
  secondEndTime: string | null;
  active: boolean;
};

export const isBroken = (t: ShiftTypeLite) => !!(t.secondStartTime && t.secondEndTime);
export const isWorking = (t: ShiftTypeLite) => !!(t.startTime && t.endTime);

/** De losse ochtend- en middagdienst van een gebroken dienst, als beide als dienst-type bestaan. */
export function pieces(t: ShiftTypeLite, all: ShiftTypeLite[]): { morning: ShiftTypeLite; afternoon: ShiftTypeLite } | null {
  if (!isBroken(t)) return null;
  const find = (start: string | null, end: string | null) =>
    all.find((x) => x.active && x.id !== t.id && !isBroken(x) && x.startTime === start && x.endTime === end);
  const morning = find(t.startTime, t.endTime);
  const afternoon = find(t.secondStartTime, t.secondEndTime);
  return morning && afternoon ? { morning, afternoon } : null;
}

/** Twee losse delen (bv. ochtend XI en middag IX) samen: de gebroken dienst waar ze bij horen (X). null als die niet bestaat of het geen ochtend + middag is. */
export function combine(a: ShiftTypeLite, b: ShiftTypeLite, all: ShiftTypeLite[]): ShiftTypeLite | null {
  for (const t of all) {
    if (!t.active || !isBroken(t)) continue;
    const p = pieces(t, all);
    if (!p) continue;
    if ((p.morning.id === a.id && p.afternoon.id === b.id) || (p.morning.id === b.id && p.afternoon.id === a.id)) return t;
  }
  return null;
}

/** Het deel dat naar de collega gaat. */
export function pieceOf(t: ShiftTypeLite, part: ShiftPart, all: ShiftTypeLite[]): ShiftTypeLite | null {
  if (part === "ALL") return t;
  const p = pieces(t, all);
  return p ? (part === "MORNING" ? p.morning : p.afternoon) : null;
}

/** Wat er overblijft bij degene die een deel weggeeft (null = niets). */
export function remainderOf(t: ShiftTypeLite, part: ShiftPart, all: ShiftTypeLite[]): ShiftTypeLite | null | undefined {
  if (part === "ALL") return null;
  const p = pieces(t, all);
  return p ? (part === "MORNING" ? p.afternoon : p.morning) : undefined;
}

export const timesOf = (t: ShiftTypeLite) =>
  t.startTime && t.endTime ? `${t.startTime}–${t.endTime}${isBroken(t) ? ` en ${t.secondStartTime}–${t.secondEndTime}` : ""}` : "";

export function dayLabel(date: Date) {
  return `${weekdayShort(date)} ${date.getUTCDate()} ${monthName(date.getUTCMonth() + 1).slice(0, 3)} ${date.getUTCFullYear()}`;
}

export const PART_LABEL: Record<ShiftPart, string> = { ALL: "hele dienst", MORNING: "alleen de ochtend", AFTERNOON: "alleen de middag" };

/** Omschrijving van een dienst of deel ervan, bv. "X · Hele dag (08:00–12:30 en 15:30–19:30), alleen de ochtend". */
export function describeGiven(t: ShiftTypeLite, part: ShiftPart, all: ShiftTypeLite[]) {
  const piece = pieceOf(t, part, all);
  const base = `${t.code} · ${t.label}${timesOf(t) ? ` (${timesOf(t)})` : ""}`;
  return part === "ALL" || !piece ? base : `${base}, ${PART_LABEL[part]} (${timesOf(piece)})`;
}

type SwapLike = {
  requesterId: string;
  targetId: string;
  date: Date;
  shiftTypeId: string;
  part: ShiftPart;
  returnDate: Date | null;
  returnShiftTypeId: string | null;
  returnPart: ShiftPart | null;
};

export type SwapChange = { employeeId: string; date: Date; shiftTypeId: string | null };

/**
 * Berekent wat er met het rooster gebeurt als deze ruil doorgaat, of waarom het niet kan.
 * Eerst worden de weggegeven delen uit de roosters gehaald, dan komen de overgenomen delen erbij;
 * een medewerker kan per dag maar één dienst hebben, behalve dat een ochtend- en een middagdienst samen één gebroken dienst worden.
 */
export async function planSwap(req: SwapLike): Promise<{ error: string } | { changes: SwapChange[] }> {
  const types: ShiftTypeLite[] = await prisma.shiftType.findMany();
  const byId = new Map(types.map((t) => [t.id, t]));
  const given = byId.get(req.shiftTypeId);
  if (!given || !isWorking(given)) return { error: "Alleen een dienst met werktijden kan geruild worden." };
  const today = todayAmsterdam();
  if (req.date < today) return { error: "Een dienst die al geweest is kan niet meer geruild worden." };
  const hasReturn = !!(req.returnDate && req.returnShiftTypeId);
  const ret = hasReturn ? byId.get(req.returnShiftTypeId!) : undefined;
  if (hasReturn && (!ret || !isWorking(ret) || req.returnDate! < today)) return { error: "De dienst die je terug wilt krijgen kan niet meer geruild worden." };

  const keys = [
    { employeeId: req.requesterId, date: req.date },
    { employeeId: req.targetId, date: req.date },
    ...(hasReturn ? [{ employeeId: req.targetId, date: req.returnDate! }, { employeeId: req.requesterId, date: req.returnDate! }] : []),
  ];
  const current = await prisma.shiftAssignment.findMany({ where: { OR: keys } });
  const k = (employeeId: string, date: Date) => `${employeeId}|${toISODate(date)}`;
  const orig = new Map<string, string | null>();
  for (const key of keys) orig.set(k(key.employeeId, key.date), null);
  for (const a of current) orig.set(k(a.employeeId, a.date), a.shiftTypeId);
  const state = new Map(orig);

  const [requester, target] = await Promise.all([
    prisma.employee.findUnique({ where: { id: req.requesterId }, select: { name: true } }),
    prisma.employee.findUnique({ where: { id: req.targetId }, select: { name: true } }),
  ]);

  if (orig.get(k(req.requesterId, req.date)) !== req.shiftTypeId) return { error: `De dienst van ${requester?.name ?? "de aanvrager"} op ${dayLabel(req.date)} is inmiddels gewijzigd.` };
  if (hasReturn && orig.get(k(req.targetId, req.returnDate!)) !== req.returnShiftTypeId) return { error: `De dienst van ${target?.name ?? "de collega"} op ${dayLabel(req.returnDate!)} is inmiddels gewijzigd.` };

  const givenPiece = pieceOf(given, req.part, types);
  const givenRest = remainderOf(given, req.part, types);
  if (!givenPiece || givenRest === undefined) return { error: "Deze dienst kan niet in delen geruild worden." };
  let retPiece: ShiftTypeLite | null = null;
  let retRest: ShiftTypeLite | null | undefined = null;
  if (hasReturn) {
    const part = req.returnPart ?? "ALL";
    retPiece = pieceOf(ret!, part, types);
    retRest = remainderOf(ret!, part, types);
    if (!retPiece || retRest === undefined) return { error: "De dienst van de collega kan niet in delen geruild worden." };
  }

  // Eerst weghalen, dan toevoegen.
  state.set(k(req.requesterId, req.date), givenRest?.id ?? null);
  if (hasReturn) state.set(k(req.targetId, req.returnDate!), retRest?.id ?? null);
  // Heeft iemand die dag al een ochtend- of middagdienst en komt het andere deel erbij, dan wordt het één gebroken dienst.
  const place = (employeeId: string, date: Date, name: string | undefined, type: ShiftTypeLite): string | null => {
    const existingId = state.get(k(employeeId, date));
    if (existingId) {
      const existing = byId.get(existingId);
      const merged = existing ? combine(existing, type, types) : null;
      if (!merged) return `${name ?? "Een medewerker"} heeft op ${dayLabel(date)} al een dienst die hier niet bij past.`;
      state.set(k(employeeId, date), merged.id);
      return null;
    }
    state.set(k(employeeId, date), type.id);
    return null;
  };
  const e1 = place(req.targetId, req.date, target?.name, givenPiece);
  if (e1) return { error: e1 };
  if (hasReturn) {
    const e2 = place(req.requesterId, req.returnDate!, requester?.name, retPiece!);
    if (e2) return { error: e2 };
  }

  const changes: SwapChange[] = [];
  for (const [key, shiftTypeId] of state) {
    if (shiftTypeId === orig.get(key)) continue;
    const [employeeId, iso] = key.split("|");
    changes.push({ employeeId, date: dateFromISO(iso), shiftTypeId });
  }
  return { changes };
}

/** Voert de berekende wijzigingen door in het rooster (met agenda-sync en roostermail via applyAssignment). */
export async function applyChanges(changes: SwapChange[]) {
  // Eerst wissen, dan zetten.
  for (const c of [...changes].sort((a, b) => Number(!!a.shiftTypeId) - Number(!!b.shiftTypeId))) {
    await applyAssignment({ employeeId: c.employeeId, dateISO: toISODate(c.date), shiftTypeId: c.shiftTypeId });
  }
}
