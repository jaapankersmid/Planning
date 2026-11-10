import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  addDays,
  addMonths,
  colorGroupSwatch,
  dateFromISO,
  daysInMonth,
  formatDayMonth,
  isoWeek,
  isWeekend,
  monthName,
  readableTextColor,
  startOfWeek,
  toISODate,
  weekdayFull,
  weekdayShort,
} from "@/lib/format";
import { holidayOn, holidaySegments } from "@/lib/holidays";
import { ShiftCell } from "@/components/shift-cell";
import { DualScroll } from "@/components/dual-scroll";
import {
  ensureColorGroups,
  ensureCoverageDefaults,
  reconcileTemplate,
  sortEmployees,
  todayAmsterdam,
  weekdayNumber,
} from "@/lib/schedule";

const NAME_COLUMN = 132;

export default async function RoosterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; weergave?: string; datum?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const today = todayAmsterdam();
  const todayISO = toISODate(today);
  const weekView = params.weergave === "week";

  let days: Date[];
  let title: string;
  let subtitle: string;
  let prevHref: string;
  let nextHref: string;
  let monthHref: string;
  let weekHref: string;

  if (weekView) {
    const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.datum ?? "")
      ? dateFromISO(params.datum!)
      : today;
    const monday = startOfWeek(anchor);
    days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const sunday = days[6];
    title = `Week ${isoWeek(monday)}`;
    subtitle = `${formatDayMonth(monday)} t/m ${formatDayMonth(sunday)} ${sunday.getUTCFullYear()}`;
    prevHref = `/rooster?weergave=week&datum=${toISODate(addDays(monday, -7))}`;
    nextHref = `/rooster?weergave=week&datum=${toISODate(addDays(monday, 7))}`;
    const middle = addDays(monday, 3);
    monthHref = `/rooster?year=${middle.getUTCFullYear()}&month=${middle.getUTCMonth() + 1}`;
    weekHref = `/rooster?weergave=week&datum=${toISODate(monday)}`;
  } else {
    const year = Number(params.year) || today.getUTCFullYear();
    const month = Number(params.month) || today.getUTCMonth() + 1;
    days = daysInMonth(year, month);
    title = `${monthName(month)} ${year}`;
    subtitle = "";
    const prev = addMonths(year, month, -1);
    const next = addMonths(year, month, 1);
    prevHref = `/rooster?year=${prev.year}&month=${prev.month}`;
    nextHref = `/rooster?year=${next.year}&month=${next.month}`;
    const showsToday = today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month;
    monthHref = `/rooster?year=${year}&month=${month}`;
    weekHref = `/rooster?weergave=week&datum=${showsToday ? todayISO : toISODate(days[0])}`;
  }

  const rangeStart = days[0];
  const rangeEnd = addDays(days[days.length - 1], 1);

  // Vul het vaste rooster aan voor dit bereik (alleen vanaf vandaag, nooit over handmatige dagen heen).
  await reconcileTemplate(toISODate(rangeStart), toISODate(rangeEnd));
  const groups = await ensureColorGroups();
  await ensureCoverageDefaults();

  const [employeesRaw, shiftTypes, assignments, templateEntries, holidays] = await Promise.all([
    prisma.employee.findMany({ where: { active: true } }),
    prisma.shiftType.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      include: { shiftType: { select: { countsMorning: true, countsAfternoon: true } } },
    }),
    prisma.weeklyScheduleEntry.findMany(),
    prisma.holidayPeriod.findMany({
      where: { startDate: { lt: rangeEnd }, endDate: { gte: rangeStart } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const segments = holidaySegments(days, holidays);
  const anyWish = holidays.some((h) => h.wantMorning !== null || h.wantAfternoon !== null);

  const employees = sortEmployees(employeesRaw, groups);
  const assignmentByKey = new Map(
    assignments.map((a) => [`${a.employeeId}_${toISODate(a.date)}`, a.shiftTypeId]),
  );
  const templateByKey = new Map(
    templateEntries.map((e) => [`${e.employeeId}_${e.weekday}`, e.shiftTypeId]),
  );
  // Bezetting per dag: hoeveel van de zichtbare medewerkers staan in de ochtend (8:00-12:30) resp. middag (15:30-19:30)?
  // Groepen die niet meetellen (standaard Rood en Blauw) laten we hier buiten beschouwing.
  const excludedGroups = new Set(
    groups.filter((g) => g.countsInCoverage === false).map((g) => g.name),
  );
  const visibleIds = new Set(
    employees
      .filter((e) => !(e.colorGroup && excludedGroups.has(e.colorGroup)))
      .map((e) => e.id),
  );
  const coverage = new Map<string, { morning: number; afternoon: number }>();
  for (const a of assignments) {
    if (!visibleIds.has(a.employeeId)) continue;
    const iso = toISODate(a.date);
    const entry = coverage.get(iso) ?? { morning: 0, afternoon: 0 };
    if (a.shiftType.countsMorning) entry.morning += 1;
    if (a.shiftType.countsAfternoon) entry.afternoon += 1;
    coverage.set(iso, entry);
  }
  // Weekenden krijgen een duidelijke kleur en een dikke rand: links om zaterdag, rechts om zondag.
  const weekendEdge = (day: Date) =>
    day.getUTCDay() === 6
      ? "border-l-2 border-l-weekend-border"
      : day.getUTCDay() === 0
        ? "border-r-2 border-r-weekend-border"
        : "";
  const shiftCodeById = new Map(shiftTypes.map((s) => [s.id, s.code]));

  const cellMin = weekView ? 96 : 30;
  const tabLink = (active: boolean) =>
    `px-3 py-1.5 ${active ? "bg-accent-soft font-medium text-accent" : "hover:bg-surface-muted"}`;
  const todayHref = weekView
    ? `/rooster?weergave=week&datum=${todayISO}`
    : `/rooster?year=${today.getUTCFullYear()}&month=${today.getUTCMonth() + 1}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {title}
            {subtitle && (
              <span className="ml-2 text-sm font-normal text-foreground-muted">{subtitle}</span>
            )}
          </h1>
          <p className="text-sm text-foreground-muted">
            {employees.length} actieve medewerkers
            {isAdmin ? " · klik op een vakje om een dienst te wijzigen" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="flex overflow-hidden rounded-md border border-border">
            <Link href={monthHref} className={tabLink(!weekView)}>
              Maand
            </Link>
            <Link href={weekHref} className={`border-l border-border ${tabLink(weekView)}`}>
              Week
            </Link>
          </div>
          <Link href={prevHref} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
            ← vorige
          </Link>
          <Link href={todayHref} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
            vandaag
          </Link>
          <Link href={nextHref} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
            volgende →
          </Link>
        </div>
      </div>

      <DualScroll>
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{ minWidth: NAME_COLUMN + days.length * cellMin }}
        >
          <colgroup>
            <col style={{ width: NAME_COLUMN }} />
            {days.map((day) => (
              <col key={toISODate(day)} />
            ))}
          </colgroup>
          <thead>
            {holidays.length > 0 && (
              <tr>
                <th className="sticky left-0 z-10 border-b border-r border-border bg-surface-muted px-3 py-1 text-left text-xs font-medium text-holiday-strong">
                  Vakantie
                </th>
                {segments.map((segment, i) =>
                  segment.holiday ? (
                    <th
                      key={`h${i}`}
                      colSpan={segment.span}
                      title={segment.holiday.name}
                      className="overflow-hidden text-ellipsis whitespace-nowrap border-x-2 border-b border-x-holiday-strong border-b-border bg-holiday px-1 py-1 text-center text-xs font-semibold text-holiday-strong"
                    >
                      {segment.holiday.name}
                    </th>
                  ) : (
                    <th key={`h${i}`} colSpan={segment.span} className="border-b border-border" />
                  ),
                )}
              </tr>
            )}
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-border bg-surface-muted px-3 py-2 text-left font-medium">
                Medewerker
              </th>
              {days.map((day) => {
                const iso = toISODate(day);
                return (
                  <th
                    key={iso}
                    className={`border-b border-border px-0.5 py-1.5 text-center text-xs font-medium ${weekendEdge(day)} ${
                      iso === todayISO
                        ? "bg-accent-soft text-accent"
                        : isWeekend(day)
                          ? "bg-weekend"
                          : holidayOn(holidays, iso)
                            ? "bg-holiday"
                            : ""
                    }`}
                  >
                    <div className={iso === todayISO ? "" : "text-foreground-muted"}>
                      {weekView ? weekdayFull(day) : weekdayShort(day)}
                    </div>
                    <div>{weekView ? formatDayMonth(day) : day.getUTCDate()}</div>
                  </th>
                );
              })}
            </tr>
            {(
              [
                { label: "Ochtend", hours: "8:00–12:30", key: "morning" },
                { label: "Middag", hours: "15:30–19:30", key: "afternoon" },
              ] as const
            ).map((row) => (
              <tr key={row.key} className="border-b border-border bg-surface-muted/50">
                <th className="sticky left-0 z-10 border-r border-border bg-surface-muted px-2 py-1 text-left text-[13px] font-semibold leading-tight">
                  Bezetting {row.label.toLowerCase()}
                  <span className="block text-[11px] font-normal text-foreground-muted">{row.hours}</span>
                </th>
                {days.map((day) => {
                  const iso = toISODate(day);
                  const count = coverage.get(iso)?.[row.key] ?? 0;
                  const holiday = holidayOn(holidays, iso);
                  const wish = holiday
                    ? row.key === "morning"
                      ? holiday.wantMorning
                      : holiday.wantAfternoon
                    : null;
                  const reached = wish === null ? null : count >= wish;
                  return (
                    <td
                      key={iso}
                      title={
                        wish === null
                          ? undefined
                          : `${holiday!.name}: wens ${wish}, ingepland ${count} (${reached ? "gehaald" : `nog ${wish - count} nodig`})`
                      }
                      className={`px-0.5 py-1 text-center font-semibold tabular-nums ${weekendEdge(day)} ${
                        reached === null
                          ? isWeekend(day)
                            ? "bg-weekend"
                            : holiday
                              ? "bg-holiday"
                              : ""
                          : reached
                            ? "bg-good text-good-text"
                            : "bg-bad text-bad-text"
                      } ${weekView ? "text-base" : "text-[13px]"}`}
                    >
                      {count}
                      {weekView && wish !== null && (
                        <span className="text-xs font-normal"> / {wish}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 overflow-hidden text-ellipsis whitespace-nowrap border-r border-border bg-surface px-2 py-0.5 text-[13px] font-medium">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{
                      background: employee.colorGroup
                        ? (colorGroupSwatch[employee.colorGroup] ?? "#9aa39a")
                        : "#9aa39a",
                    }}
                  />
                  {employee.name}
                </td>
                {days.map((day) => {
                  const dateISO = toISODate(day);
                  const key = `${employee.id}_${dateISO}`;
                  const shiftTypeId = assignmentByKey.get(key) ?? null;
                  const templateId =
                    templateByKey.get(`${employee.id}_${weekdayNumber(day)}`) ?? null;
                  // Afwijking van het vaste rooster tonen we alleen voor vandaag en later.
                  const deviates = dateISO >= todayISO && shiftTypeId !== templateId;
                  return (
                    <td
                      key={key}
                      className={`p-px ${weekendEdge(day)} ${
                        isWeekend(day) ? "bg-weekend" : holidayOn(holidays, dateISO) ? "bg-holiday" : ""
                      }`}
                    >
                      <ShiftCell
                        key={`${key}_${shiftTypeId}`}
                        employeeId={employee.id}
                        dateISO={dateISO}
                        initialShiftTypeId={shiftTypeId}
                        shiftTypes={shiftTypes}
                        canEdit={isAdmin}
                        deviates={deviates}
                        templateLabel={templateId ? (shiftCodeById.get(templateId) ?? "?") : "vrij"}
                        compact={!weekView}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>

      {holidays.length > 0 && (
        <p className="text-xs text-foreground-muted">
          Paars is een vakantieperiode.
          {anyWish && " Bij een wensaantal is de bezetting groen als dat gehaald is en rood als het eronder blijft."}
        </p>
      )}

      {isAdmin && (
        <p className="text-xs text-foreground-muted">
          Een oranje rand betekent dat de dag afwijkt van het{" "}
          <Link href="/vast-rooster" className="underline hover:no-underline">
            vaste rooster
          </Link>
          ; met ↺ zet je de dag terug naar het vaste rooster.
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        {shiftTypes.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1"
          >
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: s.color, color: readableTextColor(s.color) }}
            />
            <span className="font-medium">{s.code}</span>
            <span className="text-foreground-muted">{s.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
