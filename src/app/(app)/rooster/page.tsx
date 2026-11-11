import type { CSSProperties } from "react";
import Link from "next/link";
import { headers } from "next/headers";
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
import { formatHours, shiftHours } from "@/lib/hours";
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
const NAME_COLUMN_PHONE = 84;
const HOURS_COLUMN = 64;

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
  // Op een telefoon is een hele maand te krap: zonder expliciete keuze openen we dan de weekweergave.
  const userAgent = (await headers()).get("user-agent") ?? "";
  const isPhone = /iPhone|iPod|Android.+Mobile/i.test(userAgent);
  const weekView =
    params.weergave === "week" || (!params.weergave && !params.year && !params.month && isPhone);

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

  const [employeesRaw, shiftTypes, assignments, templateEntries, holidays, availabilityRows] = await Promise.all([
    prisma.employee.findMany({ where: { active: true } }),
    prisma.shiftType.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
      include: {
        shiftType: {
          select: {
            code: true,
            paidHours: true,
            countsMorning: true,
            countsAfternoon: true,
            startTime: true,
            endTime: true,
            secondStartTime: true,
            secondEndTime: true,
          },
        },
      },
    }),
    prisma.weeklyScheduleEntry.findMany(),
    prisma.holidayPeriod.findMany({
      where: { startDate: { lt: rangeEnd }, endDate: { gte: rangeStart } },
      orderBy: { startDate: "asc" },
    }),
    // Beschikbaarheid is alleen interessant voor de planner.
    isAdmin
      ? prisma.availability.findMany({ where: { date: { gte: rangeStart, lt: rangeEnd } } })
      : Promise.resolve([]),
  ]);
  const availabilityByKey = new Map(
    availabilityRows.map((a) => [`${a.employeeId}_${toISODate(a.date)}`, a.status]),
  );
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
  // Uren per medewerker in de getoonde periode (alleen voor de planner), uit de tijden van de diensttypen.
  const hoursByEmployee = new Map<string, number>();
  if (isAdmin) {
    for (const a of assignments) {
      hoursByEmployee.set(a.employeeId, (hoursByEmployee.get(a.employeeId) ?? 0) + shiftHours(a.shiftType));
    }
  }
  const hoursLabel = weekView ? "Uren deze week" : "Uren deze maand";
  // Weekenden krijgen een duidelijke kleur en een dikke rand: links om zaterdag, rechts om zondag.
  const weekendEdge = (day: Date) =>
    day.getUTCDay() === 6
      ? "border-l-2 border-l-weekend-border"
      : day.getUTCDay() === 0
        ? "border-r-2 border-r-weekend-border"
        : "";
  // Alleen voor medewerkers waarvoor het vaste rooster telt (kleurgroep staat aan en er is een vast
  // rooster ingevuld) tonen we afwijkingen met een oranje rand.
  const groupsWithoutTemplate = new Set(
    groups.filter((g) => g.usesTemplate !== true).map((g) => g.name),
  );
  const employeesWithTemplate = new Set(templateEntries.map((e) => e.employeeId));
  const followsTemplate = (employee: { id: string; colorGroup: string | null }) =>
    employeesWithTemplate.has(employee.id) &&
    !(employee.colorGroup && groupsWithoutTemplate.has(employee.colorGroup));
  const shiftCodeById = new Map(shiftTypes.map((s) => [s.id, s.code]));

  const cellMin = weekView ? 96 : 30;
  const cellMinPhone = weekView ? 44 : 30;
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
          className="w-full min-w-(--min-phone) table-fixed border-collapse text-sm sm:min-w-(--min-desktop)"
          style={
            {
              "--min-desktop": `${NAME_COLUMN + days.length * cellMin + (isAdmin ? HOURS_COLUMN : 0)}px`,
              "--min-phone": `${NAME_COLUMN_PHONE + days.length * cellMinPhone + (isAdmin ? HOURS_COLUMN : 0)}px`,
            } as CSSProperties
          }
        >
          <colgroup>
            <col className="w-(--name-phone) sm:w-(--name-desktop)" style={{ "--name-phone": `${NAME_COLUMN_PHONE}px`, "--name-desktop": `${NAME_COLUMN}px` } as CSSProperties} />
            {days.map((day) => (
              <col key={toISODate(day)} />
            ))}
            {isAdmin && <col style={{ width: HOURS_COLUMN }} />}
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
                {isAdmin && <th className="sticky right-0 z-10 border-b border-l border-border bg-surface-muted" />}
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
                      {weekView ? (
                        <>
                          <span className="sm:hidden">{weekdayShort(day)}</span>
                          <span className="hidden sm:inline">{weekdayFull(day)}</span>
                        </>
                      ) : (
                        weekdayShort(day)
                      )}
                    </div>
                    <div>
                      {weekView ? (
                        <>
                          <span className="sm:hidden">{day.getUTCDate()}</span>
                          <span className="hidden sm:inline">{formatDayMonth(day)}</span>
                        </>
                      ) : (
                        day.getUTCDate()
                      )}
                    </div>
                  </th>
                );
              })}
              {isAdmin && (
                <th
                  title={hoursLabel}
                  className="sticky right-0 z-10 border-b border-l border-border bg-surface-muted px-1 py-1.5 text-center text-xs font-semibold"
                >
                  Uren
                  <div className="text-[10px] font-normal text-foreground-muted">{weekView ? "week" : "maand"}</div>
                </th>
              )}
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
                {isAdmin && <td className="sticky right-0 z-10 border-l border-border bg-surface-muted" />}
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
                  const deviates =
                    followsTemplate(employee) && dateISO >= todayISO && shiftTypeId !== templateId;
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
                        availability={availabilityByKey.get(key) ?? null}
                      />
                    </td>
                  );
                })}
                {isAdmin && (
                  <td
                    title={`${hoursLabel}: ${formatHours(hoursByEmployee.get(employee.id) ?? 0)}`}
                    className="sticky right-0 z-10 border-l border-border bg-surface px-1 text-center text-[13px] font-semibold tabular-nums"
                  >
                    {formatHours(hoursByEmployee.get(employee.id) ?? 0)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </DualScroll>

      {holidays.length > 0 && (
        <p className="text-xs text-foreground-muted">
          Lichtgroen is een vakantieperiode.
          {anyWish && " Bij een wensaantal is de bezetting groen als dat gehaald is en rood als het eronder blijft."}
        </p>
      )}

      {isAdmin && (
        <p className="text-xs text-foreground-muted">
          De uren rechts zijn het totaal van de getoonde {weekView ? "week" : "maand"}, berekend uit de tijden van de
          diensten, zonder de pauzes van 10:00–10:30, 12:30–13:00 en 15:00–15:30. O en CrA tellen als 8 uur (aan te passen bij Diensten); V en Z tellen niet mee.
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

      {isAdmin && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
          <span>Opgegeven beschikbaarheid (stipje linksonder in het vakje):</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#16a34a" }} />hele dag</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#0ea5e9" }} />ochtend</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} />middag</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: "#dc2626" }} />niet beschikbaar (rode rand = toch ingepland)</span>
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
