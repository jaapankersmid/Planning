import { prisma } from "@/lib/prisma";
import { shiftHours } from "@/lib/hours";
import { toISODate } from "@/lib/format";
import { weekdayNumber } from "@/lib/schedule";

/**
 * Verlofuren: het tegoed van kalenderjaar Y geldt van 1 januari Y tot en met 30 juni Y+1
 * (anderhalf jaar). Opgenomen verlof (een V in het rooster) gaat eerst van het oudste tegoed af,
 * zodat wat het eerst vervalt het eerst op is.
 */

/** Eerste dag dat het tegoed van dit jaar niet meer geldt: 1 juli van het jaar erna. */
export const expiryISO = (year: number) => `${year + 1}-07-01`;
export const startISO = (year: number) => `${year}-01-01`;

export type VacationDay = { dateISO: string; hours: number };

export type BucketInput = {
  year: number;
  hours: number;
  /** Som van de correcties (+/−) op dit jaar. */
  adjustment?: number;
  note?: string | null;
  /** Peildatum (ISO): het tegoed is de stand op die dag; verlof ervoor telt niet mee. */
  countFromISO?: string | null;
  updatedByName?: string | null;
  updatedAt?: Date | null;
};

export type Bucket = BucketInput & {
  used: number;
  remaining: number;
  /** Het tegoed is nog niet ingegaan (jaar moet nog beginnen). */
  future: boolean;
  /** Het tegoed is verlopen. */
  expired: boolean;
  /** Uren die zijn vervallen omdat ze niet op zijn genomen. */
  lost: number;
};

export type DayAllocation = VacationDay & {
  taken: { year: number; hours: number }[];
  /** Valt voor de peildatum van het tegoed en telt daarom niet mee. */
  ignored?: boolean;
};

export type AdjustmentEntry = {
  id: string;
  year: number;
  hours: number;
  dateISO: string;
  reason: string;
  byName: string | null;
};

export type Balance = {
  buckets: Bucket[];
  /** Nu op te nemen: tegoed dat is ingegaan en nog niet vervallen, min alles wat al in het rooster staat. */
  available: number;
  /** Opgenomen tot en met vandaag, binnen geldige tegoeden. */
  takenPast: number;
  /** Al in het rooster ingepland maar nog niet geweest. */
  plannedFuture: number;
  /** Eerstvolgende datum waarop uren vervallen, met het aantal uren dat dan nog over is. */
  expiring: { dateISO: string; hours: number } | null;
  days: DayAllocation[];
  /** Alle correcties, nieuwste eerst. */
  adjustments: AdjustmentEntry[];
};

/** Bepaalt welke tegoed-jaren een verlofdag mag gebruiken. */
function eligibleYears(dateISO: string) {
  const year = Number(dateISO.slice(0, 4));
  return dateISO < `${year}-07-01` ? [year - 1, year] : [year];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computeBalance(
  inputs: BucketInput[],
  vacationDays: VacationDay[],
  todayISO: string,
  adjustments: AdjustmentEntry[] = [],
): Balance {
  const map = new Map<number, Bucket>();
  const make = (input: BucketInput): Bucket => ({
    ...input,
    used: 0,
    remaining: input.hours + (input.adjustment ?? 0),
    future: false,
    expired: false,
    lost: 0,
  });
  for (const input of inputs) map.set(input.year, make(input));

  const days: DayAllocation[] = [];
  for (const day of [...vacationDays].sort((a, b) => a.dateISO.localeCompare(b.dateISO))) {
    const allocation: DayAllocation = { ...day, taken: [] };
    let todo = day.hours;
    const years = eligibleYears(day.dateISO);
    // Heeft het nieuwste tegoed een peildatum na deze dag, dan is de stand al ingevuld zonder deze dag.
    const newest = map.get(years[years.length - 1]);
    if (newest?.countFromISO && day.dateISO < newest.countFromISO) {
      allocation.ignored = true;
      days.push(allocation);
      continue;
    }
    for (const year of years) {
      const bucket = map.get(year);
      if (!bucket || todo <= 0 || bucket.remaining <= 0) continue;
      if (bucket.countFromISO && day.dateISO < bucket.countFromISO) continue;
      const take = Math.min(todo, bucket.remaining);
      bucket.used += take;
      bucket.remaining -= take;
      allocation.taken.push({ year, hours: take });
      todo -= take;
    }
    if (todo > 0.0001) {
      // Geen tegoed meer: het tekort komt op het nieuwste tegoed te staan (negatief saldo).
      const year = years[years.length - 1];
      const bucket = map.get(year) ?? make({ hours: 0, year });
      map.set(year, bucket);
      bucket.used += todo;
      bucket.remaining -= todo;
      allocation.taken.push({ year, hours: todo });
    }
    days.push(allocation);
  }

  const buckets = [...map.values()].sort((a, b) => a.year - b.year);
  let available = 0;
  let expiring: Balance["expiring"] = null;
  for (const bucket of buckets) {
    bucket.used = round(bucket.used);
    bucket.remaining = round(bucket.remaining);
    bucket.future = startISO(bucket.year) > todayISO;
    bucket.expired = expiryISO(bucket.year) <= todayISO;
    if (bucket.expired && bucket.remaining > 0) bucket.lost = bucket.remaining;
    if (!bucket.future && !(bucket.expired && bucket.remaining >= 0)) available += bucket.remaining;
    if (!bucket.expired && !bucket.future && bucket.remaining > 0 && !expiring) {
      expiring = { dateISO: expiryISO(bucket.year), hours: bucket.remaining };
    }
  }

  let takenPast = 0;
  let plannedFuture = 0;
  for (const day of days) {
    const hours = day.taken.reduce((sum, t) => sum + t.hours, 0);
    if (day.dateISO <= todayISO) takenPast += hours;
    else plannedFuture += hours;
  }

  const sortedAdjustments = [...adjustments].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  return { buckets, available: round(available), takenPast: round(takenPast), plannedFuture: round(plannedFuture), expiring, days, adjustments: sortedAdjustments };
}

/**
 * Laadt tegoeden en verlofdagen uit de database en rekent het saldo uit voor de gevraagde medewerkers
 * (of iedereen). Een verlofdag telt voor de uren die iemand op die weekdag volgens het vaste rooster
 * zou werken; dagen waarop iemand normaal niet werkt (zoals het weekend) kosten niets.
 */
export async function loadBalances(todayISO: string, employeeIds?: string[]) {
  const filter = employeeIds ? { employeeId: { in: employeeIds } } : {};
  const [allowances, adjustmentRows] = await Promise.all([
    prisma.leaveAllowance.findMany({ where: filter, include: { updatedBy: { select: { name: true, email: true } } } }),
    prisma.leaveAdjustment.findMany({ where: filter, include: { createdBy: { select: { name: true, email: true } } }, orderBy: { date: "desc" } }),
  ]);
  const byEmployee = new Map<string, BucketInput[]>();
  for (const a of allowances) {
    const list = byEmployee.get(a.employeeId) ?? [];
    list.push({ year: a.year, hours: a.hours, note: a.note, countFromISO: a.countFrom ? toISODate(a.countFrom) : null, updatedByName: a.updatedBy ? (a.updatedBy.name ?? a.updatedBy.email) : null, updatedAt: a.updatedAt });
    byEmployee.set(a.employeeId, list);
  }

  // Correcties tellen mee bij het tegoed van hun jaar; staat er voor dat jaar nog geen tegoed, dan begint het bij 0 uur.
  const adjustmentsByEmployee = new Map<string, AdjustmentEntry[]>();
  for (const a of adjustmentRows) {
    const list = adjustmentsByEmployee.get(a.employeeId) ?? [];
    list.push({ id: a.id, year: a.year, hours: a.hours, dateISO: toISODate(a.date), reason: a.reason, byName: a.createdBy ? (a.createdBy.name ?? a.createdBy.email) : null });
    adjustmentsByEmployee.set(a.employeeId, list);
    const buckets = byEmployee.get(a.employeeId) ?? [];
    let bucket = buckets.find((b) => b.year === a.year);
    if (!bucket) {
      bucket = { year: a.year, hours: 0 };
      buckets.push(bucket);
    }
    bucket.adjustment = (bucket.adjustment ?? 0) + a.hours;
    byEmployee.set(a.employeeId, buckets);
  }

  const years = [...allowances.map((a) => a.year), ...adjustmentRows.map((a) => a.year)];
  const earliest = years.length ? Math.min(...years) : null;
  const [assignments, templates] = earliest
    ? await Promise.all([
        prisma.shiftAssignment.findMany({
          where: { ...filter, shiftType: { code: "V" }, date: { gte: new Date(`${startISO(earliest)}T00:00:00.000Z`) } },
          select: { employeeId: true, date: true },
        }),
        prisma.weeklyScheduleEntry.findMany({ where: filter, include: { shiftType: true } }),
      ])
    : [[], []];

  const hoursPerWeekday = new Map<string, number>();
  const hasTemplate = new Set<string>();
  for (const t of templates) {
    hasTemplate.add(t.employeeId);
    hoursPerWeekday.set(`${t.employeeId}_${t.weekday}`, t.shiftType.code === "V" ? 0 : shiftHours(t.shiftType));
  }

  const result = new Map<string, Balance & { noTemplate: boolean }>();
  const ids = employeeIds ?? [...byEmployee.keys()];
  for (const id of ids) {
    const days: VacationDay[] = assignments
      .filter((a) => a.employeeId === id)
      .map((a) => ({ dateISO: toISODate(a.date), hours: hoursPerWeekday.get(`${id}_${weekdayNumber(a.date)}`) ?? 0 }));
    const balance = computeBalance(byEmployee.get(id) ?? [], days, todayISO, adjustmentsByEmployee.get(id) ?? []);
    result.set(id, { ...balance, noTemplate: !hasTemplate.has(id) && days.length > 0 });
  }
  return result;
}

export async function loadBalance(employeeId: string, todayISO: string) {
  const result = await loadBalances(todayISO, [employeeId]);
  return result.get(employeeId)!;
}

/** 80 -> "80"; 12.5 -> "12,5"; -4 -> "-4". Anders dan formatHours toont dit ook 0 en negatieve waarden. */
export function fmtHours(hours: number) {
  return String(Math.round(hours * 100) / 100).replace(".", ",");
}
