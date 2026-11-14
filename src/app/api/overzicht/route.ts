import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_COLOR_GROUPS, todayAmsterdam } from "@/lib/schedule";
import { verifySso } from "@/lib/sso";

export const dynamic = "force-dynamic";

// Samenvatting voor het Hub-dashboard. Alleen bereikbaar met een ondertekend bewijs
// (aud "overzicht") van de Hub; zonder geldig bewijs: 401.
export async function GET(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!verifySso(token, "overzicht")) return NextResponse.json({ error: "geen toegang" }, { status: 401 });

  const today = todayAmsterdam();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [assignments, leave, timesheetsSubmitted] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { date: today, employee: { active: true } },
      include: { employee: { select: { name: true, colorGroup: true } }, shiftType: true },
    }),
    prisma.leaveRequest.findMany({
      where: { status: "PENDING" },
      include: { employee: { select: { name: true } } },
      orderBy: { startDate: "asc" },
      take: 10,
    }),
    prisma.timesheet.count({ where: { status: "SUBMITTED" } }),
  ]);

  const WORKING_EXCLUDED = new Set(["V"]);
  const groupRank = (g: string | null) => {
    const i = g ? DEFAULT_COLOR_GROUPS.indexOf(g) : -1;
    return i === -1 ? DEFAULT_COLOR_GROUPS.length : i;
  };
  // Eerst op dienst (begintijd, dan code), daarbinnen op kleurgroep en naam.
  const working = assignments
    .filter((a) => !WORKING_EXCLUDED.has(a.shiftType.code))
    .sort(
      (a, b) =>
        (a.shiftType.startTime ?? "99:99").localeCompare(b.shiftType.startTime ?? "99:99") ||
        a.shiftType.code.localeCompare(b.shiftType.code) ||
        groupRank(a.employee.colorGroup) - groupRank(b.employee.colorGroup) ||
        a.employee.name.localeCompare(b.employee.name, "nl"),
    );

  return NextResponse.json({
    today: iso(today),
    working: working.map((a) => ({
      name: a.employee.name,
      colorGroup: a.employee.colorGroup ?? "",
      code: a.shiftType.code,
      label: a.shiftType.label,
      color: a.shiftType.color,
      time: a.shiftType.startTime && a.shiftType.endTime ? `${a.shiftType.startTime}–${a.shiftType.endTime}` : "",
    })),
    pendingLeave: leave.map((l) => ({ name: l.employee.name, start: iso(l.startDate), end: iso(l.endDate) })),
    timesheetsSubmitted,
  });
}
