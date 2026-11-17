import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDays, addMonths, daysInMonth, monthName, startOfWeek, toISODate } from "@/lib/format";
import { holidayOn } from "@/lib/holidays";
import { todayAmsterdam } from "@/lib/schedule";
import { AvailabilityGrid, type GridDay } from "@/components/availability-grid";

export default async function BeschikbaarheidPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  const employeeId = session.user.employeeId;

  if (!employeeId) {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-lg font-semibold">Mijn beschikbaarheid</h1>
        <p className="text-sm text-foreground-muted">
          Je account is nog niet aan een medewerker gekoppeld, dus je kunt hier geen beschikbaarheid doorgeven.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const today = todayAmsterdam();
  const year = Number(params.year) || today.getUTCFullYear();
  const month = Number(params.month) || today.getUTCMonth() + 1;
  const days = daysInMonth(year, month);
  const gridStart = startOfWeek(days[0]);
  const gridEnd = addDays(startOfWeek(days[days.length - 1]), 7);

  const [rows, leave, holidays] = await Promise.all([
    prisma.availability.findMany({ where: { employeeId, date: { gte: gridStart, lt: gridEnd } } }),
    prisma.shiftAssignment.findMany({
      where: { employeeId, date: { gte: gridStart, lt: gridEnd }, shiftType: { code: "V" } },
      select: { date: true },
    }),
    prisma.holidayPeriod.findMany({ where: { startDate: { lt: gridEnd }, endDate: { gte: gridStart } } }),
  ]);
  const statusByDay = new Map(rows.map((r) => [toISODate(r.date), r.status]));
  const leaveDays = new Set(leave.map((l) => toISODate(l.date)));

  const weeks: GridDay[][] = [];
  for (let d = new Date(gridStart); d < gridEnd; d = addDays(d, 7)) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(d, i);
        const iso = toISODate(day);
        return {
          iso,
          day: day.getUTCDate(),
          inMonth: day.getUTCMonth() + 1 === month,
          weekend: day.getUTCDay() === 0 || day.getUTCDay() === 6,
          past: day < today,
          leave: leaveDays.has(iso),
          holiday: holidayOn(holidays, iso)?.name ?? null,
          status: statusByDay.get(iso) ?? null,
        };
      }),
    );
  }

  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            Mijn beschikbaarheid
            <span className="ml-2 text-sm font-normal text-foreground-muted">
              {monthName(month)} {year}
            </span>
          </h1>
          <p className="text-sm text-foreground-muted">
            Geef per dag door wanneer je kunt werken. De planner ziet dit bij het inplannen.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/beschikbaarheid?year=${prev.year}&month=${prev.month}`}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
          >
            ← vorige
          </Link>
          <Link href="/beschikbaarheid" className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">
            vandaag
          </Link>
          <Link
            href={`/beschikbaarheid?year=${next.year}&month=${next.month}`}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
          >
            volgende →
          </Link>
        </div>
      </div>

      <AvailabilityGrid key={`${year}-${month}-${rows.length}`} weeks={weeks} year={year} month={month} />
    </div>
  );
}
