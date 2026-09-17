import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addMonths, daysInMonth, isWeekend, monthName, toISODate, weekdayShort } from "@/lib/format";

export default async function BezettingPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const month = Number(params.month) || now.getUTCMonth() + 1;

  const days = daysInMonth(year, month);
  const rangeStart = days[0];
  const rangeEnd = new Date(days[days.length - 1]);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const assignments = await prisma.shiftAssignment.findMany({
    where: { date: { gte: rangeStart, lt: rangeEnd } },
    include: { shiftType: true },
  });

  const byDay = new Map<
    string,
    { working: number; morningWalk: number; eveningWalk: number }
  >();
  for (const day of days) {
    byDay.set(toISODate(day), { working: 0, morningWalk: 0, eveningWalk: 0 });
  }
  for (const a of assignments) {
    const entry = byDay.get(toISODate(a.date));
    if (!entry) continue;
    entry.working += 1;
    if (a.shiftType.countsMorningWalk) entry.morningWalk += 1;
    if (a.shiftType.countsEveningWalk) entry.eveningWalk += 1;
  }

  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);

  const rows: Array<{
    label: string;
    key: "working" | "morningWalk" | "eveningWalk";
  }> = [
    { label: "Aan het werk", key: "working" },
    { label: "Uitlaten ochtend", key: "morningWalk" },
    { label: "Uitlaten avond", key: "eveningWalk" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            Bezetting — {monthName(month)} {year}
          </h1>
          <p className="text-sm text-foreground-muted">
            Automatisch geteld uit het rooster — vervangt de handmatige
            “Telling”-rijen uit Planning V2.0.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/bezetting?year=${prev.year}&month=${prev.month}`}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
          >
            ← vorige
          </Link>
          <Link
            href={`/bezetting?year=${next.year}&month=${next.month}`}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
          >
            volgende →
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-border bg-surface-muted px-3 py-2 text-left font-medium">
                &nbsp;
              </th>
              {days.map((day) => (
                <th
                  key={toISODate(day)}
                  className={`border-b border-border px-2 py-2 text-center text-xs font-medium ${
                    isWeekend(day) ? "bg-surface-muted" : ""
                  }`}
                >
                  <div className="text-foreground-muted">{weekdayShort(day)}</div>
                  <div>{day.getUTCDate()}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-1.5 font-medium whitespace-nowrap">
                  {row.label}
                </td>
                {days.map((day) => {
                  const entry = byDay.get(toISODate(day))!;
                  return (
                    <td
                      key={toISODate(day)}
                      className={`px-2 py-1.5 text-center tabular-nums ${
                        isWeekend(day) ? "bg-surface-muted/60" : ""
                      }`}
                    >
                      {entry[row.key] || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="max-w-2xl text-xs text-foreground-muted">
        Bezetting tegenover het aantal aanwezige honden (zoals in de
        tabbladen “Bezetting” en “Verdeling”) zit hier bewust nog niet in —
        dat vraagt een koppeling met het boekingssysteem van het pension, en
        was in de eerdere vergelijking al benoemd als apart vervolgstuk.
      </p>
    </div>
  );
}
