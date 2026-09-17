import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDayMonth, readableTextColor, weekdayFull } from "@/lib/format";
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
  searchParams: Promise<{ calendar?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null;

  const { calendar: calendarStatus } = await searchParams;

  const [user, employee] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    session.user.employeeId
      ? prisma.employee.findUnique({ where: { id: session.user.employeeId } })
      : null,
  ]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const in60Days = new Date(today);
  in60Days.setUTCDate(in60Days.getUTCDate() + 60);

  const upcoming = employee
    ? await prisma.shiftAssignment.findMany({
        where: { employeeId: employee.id, date: { gte: today, lt: in60Days } },
        include: { shiftType: true },
        orderBy: { date: "asc" },
      })
    : [];

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold">Mijn rooster</h1>
        <p className="text-sm text-foreground-muted">
          {employee ? employee.name : "Nog niet gekoppeld aan een medewerker."}
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
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
        <h2 className="text-sm font-semibold">Komende diensten (60 dagen)</h2>
        {!employee ? (
          <p className="mt-2 text-sm text-foreground-muted">
            Er is nog geen medewerker aan jouw account gekoppeld.
          </p>
        ) : upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-foreground-muted">
            Geen geplande diensten in de komende 60 dagen.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border bg-surface">
            {upcoming.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span
                  className="flex h-7 w-12 shrink-0 items-center justify-center rounded text-xs font-semibold"
                  style={{
                    background: a.shiftType.color,
                    color: readableTextColor(a.shiftType.color),
                  }}
                >
                  {a.shiftType.code}
                </span>
                <span className="w-28 shrink-0 capitalize text-foreground-muted">
                  {weekdayFull(a.date)} {formatDayMonth(a.date)}
                </span>
                <span>{a.shiftType.label}</span>
                {a.syncedAt && (
                  <span className="ml-auto text-xs text-foreground-muted">
                    gesynchroniseerd
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
