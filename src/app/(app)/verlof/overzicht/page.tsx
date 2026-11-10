import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { addDays, formatDayMonth, formatRange, toISODate } from "@/lib/format";
import { leaveDates } from "@/lib/leave";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import { LeaveForm } from "@/components/leave-form";
import { LeaveStatusBadge } from "@/components/leave-status";
import { addLeaveForEmployee, decideLeave, revokeLeave } from "./actions";

type Segment = { start: Date; end: Date; days: number; requestId: string | null };

export default async function VerlofOverzichtPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/verlof");

  // Dagen die al geweest zijn horen niet meer in dit overzicht: alleen vanaf vandaag.
  const today = todayAmsterdam();

  const groups = await ensureColorGroups();
  const [pending, approved, history, vAssignments, activeEmployees, allEmployees] =
    await Promise.all([
      prisma.leaveRequest.findMany({
        where: { status: "PENDING" },
        include: { employee: true, requestedBy: { select: { name: true } } },
        orderBy: { startDate: "asc" },
      }),
      prisma.leaveRequest.findMany({
        where: { status: "APPROVED", endDate: { gte: today } },
        include: { decidedBy: { select: { name: true } } },
      }),
      prisma.leaveRequest.findMany({
        where: { status: { not: "PENDING" }, endDate: { gte: today } },
        include: { employee: true, decidedBy: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
        take: 40,
      }),
      prisma.shiftAssignment.findMany({
        where: { date: { gte: today }, shiftType: { code: "V" } },
        select: { employeeId: true, date: true },
      }),
      prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true } }),
      prisma.employee.findMany(),
    ]);

  // Voor aanvragen in behandeling: hoeveel bestaande diensten worden vervangen?
  const pendingConflicts = new Map<string, number>();
  if (pending.length > 0) {
    const existing = await prisma.shiftAssignment.findMany({
      where: {
        employeeId: { in: pending.map((p) => p.employeeId) },
        date: {
          gte: pending.reduce((min, p) => (p.startDate < min ? p.startDate : min), pending[0].startDate),
          lte: pending.reduce((max, p) => (p.endDate > max ? p.endDate : max), pending[0].endDate),
        },
        shiftType: { code: { not: "V" } },
      },
      select: { employeeId: true, date: true },
    });
    for (const p of pending) {
      const dates = new Set(
        leaveDates(p.startDate, p.endDate, p.includeWeekends).map((d) => toISODate(d)),
      );
      pendingConflicts.set(
        p.id,
        existing.filter((e) => e.employeeId === p.employeeId && dates.has(toISODate(e.date))).length,
      );
    }
  }

  // Per dag: bij welke goedgekeurde aanvraag hoort deze V? (anders: handmatig in het rooster gezet)
  const requestByDay = new Map<string, (typeof approved)[number]>();
  for (const r of approved) {
    for (const d of leaveDates(r.startDate, r.endDate, r.includeWeekends)) {
      requestByDay.set(`${r.employeeId}_${toISODate(d)}`, r);
    }
  }
  const approvedById = new Map(approved.map((r) => [r.id, r]));

  const datesByEmployee = new Map<string, Date[]>();
  for (const a of vAssignments) {
    const list = datesByEmployee.get(a.employeeId) ?? [];
    list.push(a.date);
    datesByEmployee.set(a.employeeId, list);
  }

  const segmentsByEmployee = new Map<string, Segment[]>();
  for (const [employeeId, dates] of datesByEmployee) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const segments: Segment[] = [];
    for (const date of dates) {
      const requestId = requestByDay.get(`${employeeId}_${toISODate(date)}`)?.id ?? null;
      const last = segments[segments.length - 1];
      if (
        last &&
        last.requestId === requestId &&
        toISODate(addDays(last.end, 1)) === toISODate(date)
      ) {
        last.end = date;
        last.days += 1;
      } else {
        segments.push({ start: date, end: date, days: 1, requestId });
      }
    }
    segmentsByEmployee.set(employeeId, segments);
  }

  const peopleWithLeave = sortEmployees(
    allEmployees.filter((e) => segmentsByEmployee.has(e.id)),
    groups,
  );
  const totalDays = vAssignments.length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Verlofoverzicht</h1>
          <p className="text-sm text-foreground-muted">
            Aanvragen beoordelen en de vrije dagen (V) vanaf vandaag per persoon, met welke planner het goedkeurde.
          </p>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          Te beoordelen{" "}
          <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {pending.length}
          </span>
        </h2>
        {pending.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            Er zijn geen aanvragen die op een beoordeling wachten.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((r) => {
              const dayCount = leaveDates(r.startDate, r.endDate, r.includeWeekends).length;
              const conflicts = pendingConflicts.get(r.id) ?? 0;
              return (
                <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="text-sm">
                    <div className="font-medium">
                      {r.employee.name} · {formatRange(r.startDate, r.endDate)}
                    </div>
                    <div className="text-xs text-foreground-muted">
                      {dayCount} {dayCount === 1 ? "dag" : "dagen"}
                      {r.includeWeekends ? " (incl. weekend)" : " (zonder weekend)"}
                      {r.requestedBy?.name && ` · aangevraagd door ${r.requestedBy.name}`}
                    </div>
                    {r.note && <div className="mt-1 text-xs">“{r.note}”</div>}
                    {conflicts > 0 && (
                      <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        Let op: {conflicts} {conflicts === 1 ? "ingeplande dienst wordt" : "ingeplande diensten worden"} vervangen door V.
                      </div>
                    )}
                  </div>
                  <form action={decideLeave.bind(null, r.id)} className="flex flex-col gap-2 sm:w-72">
                    <input
                      name="note"
                      maxLength={300}
                      placeholder="Toelichting (niet verplicht)"
                      className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        name="decision"
                        value="approve"
                        className="flex-1 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
                      >
                        Goedkeuren
                      </button>
                      <button
                        name="decision"
                        value="reject"
                        className="flex-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
                      >
                        Afwijzen
                      </button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          Komende vrije dagen per persoon{" "}
          <span className="ml-1 text-xs font-normal text-foreground-muted">
            {totalDays} dagen · {peopleWithLeave.length} personen
          </span>
        </h2>
        {peopleWithLeave.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-foreground-muted">
            Er staan geen komende vrije dagen (V) in het rooster.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  <th className="px-4 py-2">Medewerker</th>
                  <th className="px-4 py-2">Dagen</th>
                  <th className="px-4 py-2">Periodes</th>
                </tr>
              </thead>
              <tbody>
                {peopleWithLeave.map((employee) => {
                  const segments = segmentsByEmployee.get(employee.id) ?? [];
                  const days = segments.reduce((sum, s) => sum + s.days, 0);
                  return (
                    <tr key={employee.id} className="border-b border-border align-top last:border-0">
                      <td className="whitespace-nowrap px-4 py-2 font-medium">{employee.name}</td>
                      <td className="px-4 py-2 tabular-nums">{days}</td>
                      <td className="px-4 py-2">
                        <ul className="flex flex-col gap-1">
                          {segments.map((s) => {
                            const request = s.requestId ? approvedById.get(s.requestId) : null;
                            return (
                              <li key={toISODate(s.start)} className="flex flex-wrap items-baseline gap-x-3">
                                <span className="tabular-nums">
                                  {s.days === 1
                                    ? formatDayMonth(s.start)
                                    : `${formatDayMonth(s.start)} t/m ${formatDayMonth(s.end)}`}
                                  <span className="ml-1 text-xs text-foreground-muted">
                                    ({s.days} {s.days === 1 ? "dag" : "dagen"})
                                  </span>
                                </span>
                                <span className="text-xs text-foreground-muted">
                                  {request
                                    ? `goedgekeurd door ${request.decidedBy?.name ?? "onbekend"}${
                                        request.decidedAt ? ` op ${formatDayMonth(request.decidedAt)}` : ""
                                      }`
                                    : "staat in het rooster (geen aanvraag)"}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Verlof vastleggen voor een medewerker</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            Is meteen goedgekeurd op jouw naam en komt als V in het rooster.
          </p>
          <LeaveForm action={addLeaveForEmployee} submitLabel="Vastleggen" employees={activeEmployees.sort((a, b) => a.name.localeCompare(b.name, "nl"))} />
        </section>
      </div>

      <section className="rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Beoordeelde aanvragen (lopend en komend)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
                <th className="px-4 py-2">Medewerker</th>
                <th className="px-4 py-2">Periode</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Beoordeeld door</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-foreground-muted">
                    Geen beoordeelde aanvragen voor komende dagen.
                  </td>
                </tr>
              )}
              {history.map((r) => (
                <tr key={r.id} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-2 font-medium">{r.employee.name}</td>
                  <td className="px-4 py-2">
                    {formatRange(r.startDate, r.endDate)}
                    {r.note && <div className="text-xs text-foreground-muted">{r.note}</div>}
                  </td>
                  <td className="px-4 py-2">
                    <LeaveStatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 text-foreground-muted">
                    {r.decidedBy
                      ? `${r.decidedBy.name}${r.decidedAt ? ` · ${formatDayMonth(r.decidedAt)}` : ""}`
                      : "—"}
                    {r.decisionNote && <div className="text-xs">{r.decisionNote}</div>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.status === "APPROVED" && r.endDate >= today && (
                      <form action={revokeLeave.bind(null, r.id)}>
                        <button className="text-xs underline hover:no-underline">intrekken</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
