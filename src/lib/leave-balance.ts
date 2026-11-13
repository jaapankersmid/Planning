import { prisma } from "@/lib/prisma";
import { shiftHours } from "@/lib/hours";
import { addDays, dateFromISO, isoWeek, startOfWeek, toISODate } from "@/lib/format";
import { weekdayNumber } from "@/lib/schedule";

/**
 * Verlofuren: het tegoed van kalenderjaar Y geldt van 1 januari Y tot en met 30 juni Y+1
 * (anderhalf jaar). Opgenomen verlof gaat eerst van het oudste tegoed af, zodat wat het eerst
 * vervalt het eerst op is.
 *
 * Wat is opgenomen verlof? Niet de V in de planning, maar per week: de standaard uren per week
 * (contract) min de uren die iemand echt heeft gewerkt (of, voor weken die nog komen, is ingepland).
 */

/** Eerste dag dat het tegoed van dit jaar niet meer geldt: 1 juli van het jaar erna. */
export const expiryISO = (year: number) => `${year + 1}-07-01`;
export const startISO = (year: number) => `${year}-01-01`;

/** Verlof dat van het tegoed afgaat (in de praktijk: één week). */
export type VacationDay = {
  /** Datum waarop het verlof telt (bij een week: de maandag). */
  dateISO: string;
  hours: number;
  /** Nog niet voorbij (huidige of toekomstige week): telt als "ingepland", niet als "opgenomen". */
  planned?: boolean;
  label?: string;
  detail?: string;
};

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
  /** Opgenomen (voorbije weken). */
  used: number;
  /** Nu nog over: tegoed min opgenomen. */
  remaining: number;
  /** Ingepland verlof (huidige en komende weken) dat van dit tegoed afgaat. */
  plannedUsed: number;
  /** Verwachte rest als ook het ingeplande verlof is opgenomen. */
  forecastRemaining: number;
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
  /** Nu op te nemen: tegoed dat is ingegaan en nog niet vervallen, min wat al is opgenomen. */
  available: number;
  /** Opgenomen in voorbije weken. */
  takenPast: number;
  /** Ingepland in de huidige en komende weken (t/m het einde van het jaar van de verwachting). */
  plannedFuture: number;
  /** Verwachte rest op {forecastISO}: nu beschikbaar min het ingeplande verlof, zonder uren die dan vervallen zijn. */
  forecast: number;
  forecastISO: string;
  /** Eerstvolgende datum waarop uren vervallen, met het aantal uren dat dan nog over is. */
  expiring: { dateISO: string; hours: number } | null;
  days: DayAllocation[];
  /** Alle correcties, nieuwste eerst. */
  adjustments: AdjustmentEntry[];
};

/** Bepaalt welke tegoed-jaren verlof op deze datum mag gebruiken. */
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
  forecastISO: string = `${todayISO.slice(0, 4)}-12-31`,
): Balance {
  type Work = Bucket & { total: number };
  const map = new Map<number, Work>();
  const make = (input: BucketInput): Work => ({
    ...input,
    total: input.hours + (input.adjustment ?? 0),
    used: 0,
    remaining: 0,
    plannedUsed: 0,
    forecastRemaining: 0,
    future: false,
    expired: false,
    lost: 0,
  });
  for (const input of inputs) map.set(input.year, make(input));
  const left = (b: Work) => b.total - b.used - b.plannedUsed;

  const days: DayAllocation[] = [];
  for (const day of [...vacationDays].sort((a, b) => a.dateISO.localeCompare(b.dateISO))) {
    const planned = day.planned ?? day.dateISO > todayISO;
    const allocation: DayAllocation = { ...day, planned, taken: [] };
    let todo = day.hours;
    const years = eligibleYears(day.dateISO);
    // Heeft het nieuwste tegoed een peildatum na deze dag, dan is de stand al ingevuld zonder deze dag.
    const newest = map.get(years[years.length - 1]);
    if (newest?.countFromISO && day.dateISO < newest.countFromISO) {
      allocation.ignored = true;
      days.push(allocation);
      continue;
    }
    const add = (bucket: Work, hours: number) => {
      if (planned) bucket.plannedUsed += hours;
      else bucket.used += hours;
    };
    for (const year of years) {
      const bucket = map.get(year);
      if (!bucket || todo <= 0 || left(bucket) <= 0) continue;
      if (bucket.countFromISO && day.dateISO < bucket.countFromISO) continue;
      const take = Math.min(todo, left(bucket));
      add(bucket, take);
      allocation.taken.push({ year, hours: take });
      todo -= take;
    }
    if (todo > 0.0001) {
      // Geen tegoed meer: het tekort komt op het nieuwste tegoed te staan (negatief saldo).
      const year = years[years.length - 1];
      const bucket = map.get(year) ?? make({ hours: 0, year });
      map.set(year, bucket);
      add(bucket, todo);
      allocation.taken.push({ year, hours: todo });
    }
    days.push(allocation);
  }

  const buckets = [...map.values()].sort((a, b) => a.year - b.year);
  let available = 0;
  let forecast = 0;
  let expiring: Balance["expiring"] = null;
  for (const bucket of buckets) {
    bucket.used = round(bucket.used);
    bucket.plannedUsed = round(bucket.plannedUsed);
    bucket.remaining = round(bucket.total - bucket.used);
    bucket.forecastRemaining = round(bucket.total - bucket.used - bucket.plannedUsed);
    bucket.future = startISO(bucket.year) > todayISO;
    bucket.expired = expiryISO(bucket.year) <= todayISO;
    if (bucket.expired && bucket.remaining > 0) bucket.lost = bucket.remaining;
    if (!bucket.future && !(bucket.expired && bucket.remaining >= 0)) available += bucket.remaining;
    if (!bucket.expired && !bucket.future && bucket.remaining > 0 && !expiring) {
      expiring = { dateISO: expiryISO(bucket.year), hours: bucket.remaining };
    }
    // Verwachting: alleen tegoed dat op de verwachtingsdatum al is ingegaan en nog niet vervallen is (tekorten blijven staan).
    const started = startISO(bucket.year) <= forecastISO;
    const stillValid = expiryISO(bucket.year) > forecastISO;
    if (started && (stillValid || bucket.forecastRemaining < 0)) forecast += bucket.forecastRemaining;
  }

  let takenPast = 0;
  let plannedFuture = 0;
  for (const day of days) {
    const hours = day.taken.reduce((sum, t) => sum + t.hours, 0);
    if (day.planned) plannedFuture += hours;
    else takenPast += hours;
  }

  const sortedAdjustments = [...adjustments].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  return {
    buckets: buckets as Bucket[],
    available: round(available),
    takenPast: round(takenPast),
    plannedFuture: round(plannedFuture),
    forecast: round(forecast),
    forecastISO,
    expiring,
    days,
    adjustments: sortedAdjustments,
  };
}

/**
 * Laadt tegoeden, standaard weekuren, rooster en urenregistratie uit de database en rekent het saldo uit
 * voor de gevraagde medewerkers (of iedereen).
 *
 * Opgenomen verlof per week = standaard uren per week − uren in die week (min 0). Een dag telt voor de
 * geregistreerde uren; zonder registratie voor de uren van de geplande dienst (V telt dus 0 uur). Een
 * ziektedag (Z) telt voor de uren die iemand op die weekdag volgens het vaste rooster werkt, zodat ziekte geen verlof kost.
 * Weken zonder enige dienst of registratie tellen niet mee: daar is nog niets gepland.
 */
export async function loadBalances(todayISO: string, employeeIds?: string[]) {
  const filter = employeeIds ? { employeeId: { in: employeeIds } } : {};
  const [allowances, adjustmentRows, employees] = await Promise.all([
    prisma.leaveAllowance.findMany({ where: filter, include: { updatedBy: { select: { name: true, email: true } } } }),
    prisma.leaveAdjustment.findMany({ where: filter, include: { createdBy: { select: { name: true, email: true } } }, orderBy: { date: "desc" } }),
    prisma.employee.findMany({ where: employeeIds ? { id: { in: employeeIds } } : {}, select: { id: true, weeklyHours: true } }),
  ]);
  const weeklyHours = new Map(employees.map((e) => [e.id, e.weeklyHours]));

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
  const forecastISO = `${todayISO.slice(0, 4)}-12-31`;
  const rangeStart = earliest ? startOfWeek(dateFromISO(startISO(earliest))) : null;
  const rangeEnd = addDays(startOfWeek(dateFromISO(forecastISO)), 7);

  const [assignments, entries, templates] = rangeStart
    ? await Promise.all([
        prisma.shiftAssignment.findMany({ where: { ...filter, date: { gte: rangeStart, lt: rangeEnd } }, include: { shiftType: true } }),
        prisma.timeEntry.findMany({ where: { ...filter, date: { gte: rangeStart, lt: rangeEnd } }, select: { employeeId: true, date: true, hours: true } }),
        prisma.weeklyScheduleEntry.findMany({ where: filter, include: { shiftType: true } }),
      ])
    : [[], [], []];

  const templateHours = new Map<string, number>();
  for (const t of templates) templateHours.set(`${t.employeeId}_${t.weekday}`, t.shiftType.code === "V" ? 0 : shiftHours(t.shiftType));

  const assignmentsBy = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) assignmentsBy.set(`${a.employeeId}_${toISODate(a.date)}`, a);
  const entriesBy = new Map<string, number>();
  for (const e of entries) entriesBy.set(`${e.employeeId}_${toISODate(e.date)}`, e.hours);

  const result = new Map<string, Balance & { weeklyHours: number | null }>();
  const ids = employeeIds ?? [...new Set([...byEmployee.keys(), ...adjustmentsByEmployee.keys()])];
  for (const id of ids) {
    const contract = weeklyHours.get(id) ?? null;
    const weeks: VacationDay[] = [];
    if (contract !== null && contract > 0 && rangeStart && earliest !== null) {
      for (let monday = rangeStart; toISODate(monday) <= forecastISO; monday = addDays(monday, 7)) {
        const mondayISO = toISODate(monday);
        if (mondayISO < startISO(earliest)) continue;
        let worked = 0;
        let active = false;
        for (let i = 0; i < 7; i++) {
          const day = addDays(monday, i);
          const key = `${id}_${toISODate(day)}`;
          const assignment = assignmentsBy.get(key);
          const entry = entriesBy.get(key);
          if (assignment || entry !== undefined) active = true;
          if (entry !== undefined) worked += entry;
          else if (assignment?.shiftType.code === "Z") worked += templateHours.get(`${id}_${weekdayNumber(day)}`) ?? 0;
          else if (assignment) worked += shiftHours(assignment.shiftType);
        }
        if (!active) continue;
        const leave = round(Math.max(0, contract - worked));
        if (leave <= 0) continue;
        const sundayISO = toISODate(addDays(monday, 6));
        weeks.push({
          dateISO: mondayISO,
          hours: leave,
          planned: sundayISO >= todayISO,
          label: `Week ${isoWeek(monday)}`,
          detail: `${round(contract)} uur contract, ${round(worked)} uur ${sundayISO >= todayISO ? "gepland/gewerkt" : "gewerkt"}`,
        });
      }
    }
    const balance = computeBalance(byEmployee.get(id) ?? [], weeks, todayISO, adjustmentsByEmployee.get(id) ?? [], forecastISO);
    result.set(id, { ...balance, weeklyHours: contract });
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
