import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { reconcileTemplate, todayAmsterdam } from "@/lib/schedule";
import Link from "next/link";
import {
  addDays,
  dateFromISO,
  isoWeek,
  isWeekend,
  monthName,
  readableTextColor,
  startOfWeek,
  toISODate,
} from "@/lib/format";
import { holidayOn } from "@/lib/holidays";
import { CalendarSyncPanel } from "@/components/calendar-sync-panel";

const CALENDAR_MESSAGES: Record<string, string> = {
  verbonden: "Google Calendar gekoppeld — de sync staat aan.",
  geweigerd: "Je hebt geen toestemming gegeven, dus er is niets gekoppeld.",
  mislukt: "Koppelen is niet gelukt. Probeer het nog eens.",
  "geen-refresh-token":
    "Google gaf geen doorlopende toestemming terug. Koppel opnieuw en kies bij Google voor volledige toegang.",
};

export default async function MijnRoosterPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string; start?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { calendar: calendarStatus, start } = await searchParams;

  const [user, employee] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    session.user.employeeId
      ? prisma.employee.findUnique({ where: { id: session.user.employeeId } })
      : null,
  ]);

  // Weekrooster-raster: standaard 6 weken vanaf de maandag van deze week.
  const WEEKS = 6;
  const today = todayAmsterdam();
  const todayISO = toISODate(today);
  const firstMonday = startOfWeek(
    /^\d{4}-\d{2}-\d{2}$/.test(start ?? "") ? dateFromISO(start!) : today,
  );
  const rangeEnd = addDays(firstMonday, WEEKS * 7);
  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(firstMonday, w * 7 + d)),
  );

  await reconcileTemplate(toISODate(firstMonday), toISODate(rangeEnd));

  const [assignments, holidays] = await Promise.all([
    employee
      ? prisma.shiftAssignment.findMany({
          where: { employeeId: employee.id, date: { gte: firstMonday, lt: rangeEnd } },
          include: { shiftType: true },
        })
      : [],
    prisma.holidayPeriod.findMany({
      where: { startDate: { lt: rangeEnd }, endDate: { gte: firstMonday } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  const byDay = new Map(assignments.map((a) => [toISODate(a.date), a]));
  const prevStart = toISODate(addDays(firstMonday, -WEEKS * 7));
  const nextStart = toISODate(addDays(firstMonday, WEEKS * 7));
  const hasUpcoming = assignments.some((a) => toISODate(a.date) >= todayISO);

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Mijn rooster</h1>
        <p className="text-sm text-foreground-muted">
          {employee ? employee.name : "Nog niet gekoppeld aan een medewerker."}
        </p>
      </div>

      <div className="max-w-2xl rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Google Calendar-koppeling</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Los van je inlog-account: geef hier apart toestemming zodat
          wijzigingen in het rooster meteen in je agenda verschijnen, zonder
          de vertraging die bij losse .ics-abonnementen hoort.
        </p>
        {calendarStatus && CALENDAR_MESSAGES[calendarStatus] && (
          <p className="mt-3 rounded-md bg-surface-muted px-3 py-2 text-xs">
            {CALENDAR_MESSAGES[calendarStatus]}
          </p>
        )}
        <div className="mt-4">
          <CalendarSyncPanel
            isConnected={!!user?.googleRefreshToken}
            initialEnabled={session.user.calendarSyncEnabled}
          />
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Mijn diensten
            <span className="ml-2 font-normal text-foreground-muted">
              week {isoWeek(firstMonday)} t/m {isoWeek(addDays(rangeEnd, -1))}
            </span>
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={`/rooster/mijn?start=${prevStart}`}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
            >
              ← eerder
            </Link>
            <Link
              href="/rooster/mijn"
              className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
            >
              vandaag
            </Link>
            <Link
              href={`/rooster/mijn?start=${nextStart}`}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted"
            >
              later →
            </Link>
          </div>
        </div>

        {!employee ? (
          <p className="mt-2 text-sm text-foreground-muted">
            Er is nog geen medewerker aan jouw account gekoppeld.
          </p>
        ) : (
          <>
            <div className="mt-3 overflow-hidden rounded-lg border border-border bg-surface">
              <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] border-b border-border bg-surface-muted text-center text-xs font-medium text-foreground-muted">
                <div className="px-1 py-2">wk</div>
                {["ma", "di", "wo", "do", "vr", "za", "zo"].map((d) => (
                  <div key={d} className="py-2">
                    {d}
                  </div>
                ))}
              </div>
              {weeks.map((week) => (
                <div
                  key={toISODate(week[0])}
                  className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] border-b border-border last:border-b-0"
                >
                  <div className="flex items-start justify-center px-1 py-1.5 text-xs font-medium tabular-nums text-foreground-muted">
                    {isoWeek(week[0])}
                  </div>
                  {week.map((day) => {
                    const iso = toISODate(day);
                    const a = byDay.get(iso);
                    const holiday = holidayOn(holidays, iso);
                    const isToday = iso === todayISO;
                    const past = iso < todayISO;
                    const showMonth = day.getUTCDate() === 1 || iso === toISODate(firstMonday);
                    return (
                      <div
                        key={iso}
                        className={`flex min-h-16 flex-col gap-1 border-l border-border p-1 sm:min-h-24 sm:p-1.5 ${
                          isWeekend(day) ? "bg-weekend" : holiday ? "bg-holiday" : ""
                        } ${past ? "opacity-55" : ""} ${isToday ? "ring-2 ring-inset ring-accent" : ""}`}
                        title={holiday ? `${holiday.name}` : undefined}
                      >
                        <div className="flex items-baseline justify-between gap-1 text-xs">
                          <span className={`font-semibold tabular-nums ${isToday ? "text-accent" : ""}`}>
                            {day.getUTCDate()}
                            {showMonth && (
                              <span className="ml-1 font-normal text-foreground-muted">
                                {monthName(day.getUTCMonth() + 1).slice(0, 3)}
                              </span>
                            )}
                          </span>
                          {a?.syncedAt && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-accent"
                              title="Staat in je Google-agenda"
                            />
                          )}
                        </div>
                        {a && (
                          <div
                            className="rounded px-1 py-1 text-center sm:text-left"
                            style={{
                              background: a.shiftType.color,
                              color: readableTextColor(a.shiftType.color),
                            }}
                          >
                            <div className="text-xs font-semibold sm:text-sm">{a.shiftType.code}</div>
                            <div className="hidden text-[11px] leading-tight sm:block">{a.shiftType.label}</div>
                            {a.shiftType.startTime && a.shiftType.endTime && (
                              <div className="hidden text-[11px] leading-tight opacity-90 sm:block">
                                {a.shiftType.startTime}–{a.shiftType.endTime}
                                {a.shiftType.secondStartTime && a.shiftType.secondEndTime
                                  ? ` · ${a.shiftType.secondStartTime}–${a.shiftType.secondEndTime}`
                                  : ""}
                              </div>
                            )}
                          </div>
                        )}
                        {!a && holiday && (
                          <div className="hidden text-[11px] leading-tight text-holiday-strong sm:block">
                            {holiday.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {!hasUpcoming && (
              <p className="mt-2 text-sm text-foreground-muted">
                Geen geplande diensten in deze weken.
              </p>
            )}
            <p className="mt-2 text-xs text-foreground-muted">
              Een groene stip bij een dag betekent dat de dienst in je Google-agenda staat. Vandaag heeft
              een gekleurde rand, dagen die al geweest zijn zijn lichter.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
