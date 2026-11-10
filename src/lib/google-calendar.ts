import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { createOAuthClient } from "@/lib/google-oauth";
import type { Employee, ShiftAssignment, ShiftType } from "@prisma/client";

const CALENDAR_SUMMARY = process.env.CALENDAR_NAME ?? "Werkrooster";

type AssignmentWithRelations = ShiftAssignment & {
  employee: Employee;
  shiftType: ShiftType;
};

/**
 * Bouwt een geauthenticeerde Google Calendar-client voor één specifieke
 * gebruiker, op basis van de refresh_token die is opgeslagen toen de
 * gebruiker de losstaande Calendar-koppeling aanzette (zie
 * src/app/api/google-calendar). Geeft `null` terug als er geen (werkende)
 * koppeling is — de aanroeper moet dat geval afhandelen zonder de rest van
 * de applicatie te laten crashen.
 */
async function getCalendarClientForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user?.googleRefreshToken) {
    return null;
  }

  const oauth2Client = createOAuthClient();

  oauth2Client.setCredentials({
    refresh_token: user.googleRefreshToken,
    access_token: user.googleAccessToken ?? undefined,
    expiry_date: user.googleTokenExpiresAt ? user.googleTokenExpiresAt * 1000 : undefined,
  });

  // Als googleapis tussentijds een nieuw access_token ophaalt, bewaren we dat
  // meteen, zodat we niet bij elke aanroep opnieuw hoeven te verversen.
  oauth2Client.on("tokens", (tokens) => {
    void prisma.user
      .update({
        where: { id: user.id },
        data: {
          googleAccessToken: tokens.access_token ?? undefined,
          googleTokenExpiresAt: tokens.expiry_date
            ? Math.floor(tokens.expiry_date / 1000)
            : undefined,
          googleRefreshToken: tokens.refresh_token ?? undefined,
        },
      })
      .catch(() => {
        /* best effort — een gemiste cache is geen reden om de sync te laten falen */
      });
  });

  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Zoekt de aparte "Werkrooster"-agenda van deze gebruiker, of maakt er één
 * aan als die nog niet bestaat. We zetten diensten bewust in een eigen
 * agenda i.p.v. de hoofdagenda, zodat ze niet tussen privéafspraken belanden
 * en in Google Calendar apart aan/uit te vinken zijn.
 */
async function ensureWorkCalendar(
  userId: string,
  calendar: NonNullable<Awaited<ReturnType<typeof getCalendarClientForUser>>>,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.googleCalendarId) {
    try {
      await calendar.calendars.get({ calendarId: user.googleCalendarId });
      return user.googleCalendarId;
    } catch {
      // De agenda bestaat niet meer (bv. handmatig verwijderd) — opnieuw aanmaken.
    }
  }

  const created = await calendar.calendars.insert({
    requestBody: {
      summary: CALENDAR_SUMMARY,
      timeZone: "Europe/Amsterdam",
    },
  });

  const calendarId = created.data.id;
  if (!calendarId) {
    throw new Error("Google gaf geen agenda-id terug bij het aanmaken.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { googleCalendarId: calendarId },
  });

  return calendarId;
}

function toEventTimes(date: Date, startTime: string | null, endTime: string | null) {
  const day = date.toISOString().slice(0, 10); // YYYY-MM-DD (UTC-datum, we slaan datums zonder tijd op)

  if (!startTime || !endTime) {
    // Geen tijd bekend voor deze diensttype -> hele dag, zodat er nooit een
    // verkeerde tijd in iemands agenda verschijnt.
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + 1);
    return {
      start: { date: day },
      end: { date: next.toISOString().slice(0, 10) },
    };
  }

  return {
    start: { dateTime: `${day}T${startTime}:00`, timeZone: "Europe/Amsterdam" },
    end: { dateTime: `${day}T${endTime}:00`, timeZone: "Europe/Amsterdam" },
  };
}

function eventDescription(assignment: AssignmentWithRelations) {
  const parts = [assignment.shiftType.label];
  if (assignment.shiftType.secondStartTime && assignment.shiftType.secondEndTime) {
    parts.push(
      `Tweede blok: ${assignment.shiftType.secondStartTime}–${assignment.shiftType.secondEndTime}`,
    );
  }
  if (assignment.note) parts.push(assignment.note);
  parts.push("Automatisch gesynchroniseerd vanuit het rooster.");
  return parts.join("\n");
}

/**
 * Zet één dienst-toewijzing als event in de Google Calendar van de gekoppelde
 * medewerker (indien die de koppeling heeft aangezet). Maakt een nieuw event
 * aan, of werkt het bestaande event bij als deze toewijzing al eerder is
 * gesynchroniseerd. Geeft stil `null` terug als er niets te doen is, zodat
 * dit veilig na elke roosterwijziging aangeroepen kan worden.
 */
export async function syncAssignmentToCalendar(assignmentId: string) {
  const assignment = await prisma.shiftAssignment.findUnique({
    where: { id: assignmentId },
    include: { employee: { include: { user: true } }, shiftType: true },
  });

  const user = assignment?.employee.user;
  if (!assignment || !user || !user.calendarSyncEnabled) return null;

  const calendar = await getCalendarClientForUser(user.id);
  if (!calendar) return null;

  const calendarId = await ensureWorkCalendar(user.id, calendar);

  const eventBody = {
    summary: `${assignment.shiftType.code} · ${assignment.shiftType.label}`,
    description: eventDescription(assignment),
    ...toEventTimes(assignment.date, assignment.shiftType.startTime, assignment.shiftType.endTime),
  };

  try {
    if (assignment.googleEventId) {
      await calendar.events.update({
        calendarId,
        eventId: assignment.googleEventId,
        requestBody: eventBody,
      });
    } else {
      const created = await calendar.events.insert({
        calendarId,
        requestBody: eventBody,
      });
      await prisma.shiftAssignment.update({
        where: { id: assignment.id },
        data: { googleEventId: created.data.id, syncedAt: new Date() },
      });
      return created.data.id;
    }
  } catch (error: unknown) {
    const status = (error as { code?: number; status?: number })?.code ??
      (error as { code?: number; status?: number })?.status;
    if (status === 404 || status === 410) {
      // Event bestond niet meer aan Google's kant (bv. handmatig verwijderd) — opnieuw aanmaken.
      const created = await calendar.events.insert({ calendarId, requestBody: eventBody });
      await prisma.shiftAssignment.update({
        where: { id: assignment.id },
        data: { googleEventId: created.data.id, syncedAt: new Date() },
      });
      return created.data.id;
    }
    throw error;
  }

  await prisma.shiftAssignment.update({
    where: { id: assignment.id },
    data: { syncedAt: new Date() },
  });
  return assignment.googleEventId;
}

/** Verwijdert het Google Calendar-event bij een toewijzing die is (of gaat worden) gewist. */
export async function removeAssignmentFromCalendar(
  assignmentId: string,
  googleEventId: string | null,
  userId: string | null,
) {
  if (!googleEventId || !userId) return;

  const calendar = await getCalendarClientForUser(userId);
  if (!calendar) return;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.googleCalendarId) return;

  try {
    await calendar.events.delete({ calendarId: user.googleCalendarId, eventId: googleEventId });
  } catch (error: unknown) {
    const status = (error as { code?: number; status?: number })?.code ??
      (error as { code?: number; status?: number })?.status;
    if (status !== 404 && status !== 410) throw error;
  }
}

/** Vertaalt een foutmelding van Google naar iets waar je mee verder kunt. */
export function describeGoogleError(error: unknown) {
  const e = error as {
    code?: number | string;
    status?: number;
    message?: string;
    errors?: { reason?: string; message?: string }[];
    response?: { data?: { error?: string | { message?: string; errors?: { reason?: string }[] } } };
  };
  const data = e?.response?.data?.error;
  const reason =
    e?.errors?.[0]?.reason ??
    (typeof data === "object" ? data?.errors?.[0]?.reason : undefined) ??
    (typeof data === "string" ? data : undefined);
  const message = (typeof data === "object" ? data?.message : undefined) ?? e?.message ?? String(error);
  const status = typeof e?.code === "number" ? e.code : e?.status;
  const text = `${reason ?? ""} ${message}`.toLowerCase();

  let hint: string | null = null;
  if (text.includes("invalid_grant")) {
    hint = "De koppeling is verlopen of ingetrokken. Klik op ontkoppelen en verbind opnieuw.";
  } else if (text.includes("accessnotconfigured") || text.includes("has not been used") || text.includes("is disabled")) {
    hint = "De Google Calendar API staat nog niet aan in je Google Cloud-project (APIs & Services → Library → Google Calendar API → Enable).";
  } else if (text.includes("insufficient") || text.includes("scope")) {
    hint = "De gegeven toestemming is te beperkt. Ontkoppel en verbind opnieuw, en vink bij Google alle toestemmingen aan.";
  } else if (text.includes("ratelimit") || status === 429) {
    hint = "Google vindt dat er te snel verzoeken komen. Probeer het over een paar minuten opnieuw.";
  } else if (status === 401) {
    hint = "Google accepteert de inlog niet meer. Ontkoppel en verbind opnieuw.";
  }
  return { status, reason, message, hint };
}

function isRateLimit(error: unknown) {
  const { status, reason } = describeGoogleError(error);
  return status === 429 || (status === 403 && /ratelimit/i.test(reason ?? ""));
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= 3 || !isRateLimit(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

/**
 * Duwt alle (huidige en toekomstige) diensten van één medewerker naar hun
 * Google Calendar. Handig als iemand de koppeling voor het eerst aanzet, of
 * na een periode waarin de sync uitstond. Stopt vroeg als de eerste diensten
 * allemaal op dezelfde fout stuklopen, en geeft die fout terug.
 */
export async function syncAllAssignmentsForEmployee(employeeId: string) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const assignments = await prisma.shiftAssignment.findMany({
    where: { employeeId, date: { gte: today } },
    orderBy: { date: "asc" },
    select: { id: true },
  });

  const results: { gelukt: number; mislukt: number; fout?: string } = { gelukt: 0, mislukt: 0 };
  for (const { id } of assignments) {
    try {
      await withRetry(() => syncAssignmentToCalendar(id));
      results.gelukt += 1;
    } catch (error) {
      results.mislukt += 1;
      const info = describeGoogleError(error);
      console.error("Kalender-sync mislukt:", info.status, info.reason, info.message);
      results.fout ??= `${info.status ? `[${info.status}] ` : ""}${info.message}${info.hint ? ` — ${info.hint}` : ""}`;
      // Stuk op de eerste diensten? Dan heeft doorgaan geen zin.
      if (results.gelukt === 0 && results.mislukt >= 3) {
        results.mislukt = assignments.length;
        break;
      }
    }
  }
  return results;
}
