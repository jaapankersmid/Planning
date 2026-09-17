import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  addMonths,
  colorGroupSwatch,
  daysInMonth,
  isWeekend,
  monthName,
  readableTextColor,
  toISODate,
  weekdayShort,
} from "@/lib/format";
import { ShiftCell } from "@/components/shift-cell";

export default async function RoosterPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";

  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const month = Number(params.month) || now.getUTCMonth() + 1;

  const days = daysInMonth(year, month);
  const rangeStart = days[0];
  const rangeEnd = new Date(days[days.length - 1]);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const [employees, shiftTypes, assignments] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      orderBy: [{ colorGroup: "asc" }, { name: "asc" }],
    }),
    prisma.shiftType.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
    }),
    prisma.shiftAssignment.findMany({
      where: { date: { gte: rangeStart, lt: rangeEnd } },
    }),
  ]);

  const assignmentByKey = new Map(
    assignments.map((a) => [`${a.employeeId}_${toISODate(a.date)}`, a.shiftTypeId]),
  );

  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">
            {monthName(month)} {year}
          </h1>
          <p className="text-sm text-foreground-muted">
            {employees.length} actieve medewerkers
            {isAdmin ? " · klik op een vakje om een dienst te wijzigen" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/rooster?year=${prev.year}&month=${prev.month}`}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
          >
            ← vorige
          </Link>
          <Link
            href={`/rooster?year=${next.year}&month=${next.month}`}
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
                Medewerker
              </th>
              {days.map((day) => (
                <th
                  key={toISODate(day)}
                  className={`border-b border-border px-1 py-2 text-center text-xs font-medium ${
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
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-1.5 font-medium whitespace-nowrap">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{
                      background: employee.colorGroup
                        ? colorGroupSwatch[employee.colorGroup]
                        : "#9aa39a",
                    }}
                  />
                  {employee.name}
                </td>
                {days.map((day) => {
                  const dateISO = toISODate(day);
                  const key = `${employee.id}_${dateISO}`;
                  return (
                    <td
                      key={key}
                      className={`p-0.5 ${isWeekend(day) ? "bg-surface-muted/60" : ""}`}
                    >
                      <ShiftCell
                        employeeId={employee.id}
                        dateISO={dateISO}
                        initialShiftTypeId={assignmentByKey.get(key) ?? null}
                        shiftTypes={shiftTypes}
                        canEdit={isAdmin}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
