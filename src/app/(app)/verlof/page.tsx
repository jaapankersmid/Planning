import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatRange, toISODate } from "@/lib/format";
import { describePartRequest, isShiftRequest, leaveDates, partialLeaveShifts } from "@/lib/leave";
import { isWorking, timesOf, type ShiftTypeLite } from "@/lib/shift-swap";
import { todayAmsterdam } from "@/lib/schedule";
import { loadBalance } from "@/lib/leave-balance";
import { LeaveBalanceCard } from "@/components/leave-balance-card";
import { LeaveRequestForm } from "@/components/leave-request-form";
import { LeaveStatusBadge } from "@/components/leave-status";
import { cancelOwnRequest } from "./actions";

export default async function VerlofPage() {
  const session = await auth();
  if (!session?.user) return null;
  const employeeId = session.user.employeeId;
  const isAdmin = session.user.role === "ADMIN";

  if (!employeeId) {
    return (
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-lg font-semibold">Mijn verlof</h1>
        <p className="text-sm text-foreground-muted">
          Je account is nog niet aan een medewerker gekoppeld, dus je kunt hier geen verlof aanvragen.
          {isAdmin && (
            <>
              {" "}Koppel jezelf bij{" "}
              <Link href="/gebruikers" className="underline hover:no-underline">
                Gebruikers
              </Link>
              , of bekijk het{" "}
              <Link href="/verlof/overzicht" className="underline hover:no-underline">
                verlofoverzicht
              </Link>
              .
            </>
          )}
        </p>
      </div>
    );
  }

  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId },
    include: { decidedBy: { select: { name: true } }, shiftType: { select: { code: true } }, swapShiftType: { select: { code: true, label: true } } },
    orderBy: { startDate: "desc" },
  });
  const todayISO = toISODate(todayAmsterdam());
  const partShifts = await partialLeaveShifts(employeeId);
  const allTypes: ShiftTypeLite[] = await prisma.shiftType.findMany({ orderBy: { code: "asc" } });
  const swapOptions = allTypes.filter((t) => t.active && isWorking(t)).map((t) => ({ id: t.id, label: `${t.code} · ${t.label} (${timesOf(t)})` }));
  const balance = await loadBalance(employeeId, todayISO);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Mijn verlof</h1>
        <p className="text-xs text-foreground-muted">Een planner keurt je aanvraag goed; daarna staat het in je rooster.</p>
      </div>

      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold">Mijn verlofuren</h2>
          <LeaveBalanceCard balance={balance} todayISO={todayISO} compact />
        </div>

        <div className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold">Vrij vragen</h2>
          <div className="rounded-lg border border-border bg-surface p-4">
            <LeaveRequestForm shifts={partShifts} swapOptions={swapOptions} minDate={todayISO} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-semibold">Mijn aanvragen</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-foreground-muted">Je hebt nog geen verlof aangevraagd.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface text-sm">
            {requests.map((r) => {
              const part = describePartRequest(r);
              const days = isShiftRequest(r) ? null : leaveDates(r.startDate, r.endDate, r.includeWeekends).length;
              const decided = (r.status === "APPROVED" || r.status === "REJECTED") && r.decidedBy;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                  <span className="font-medium">{formatRange(r.startDate, r.endDate)}</span>
                  <span className="text-xs text-foreground-muted">{part ?? `${days} ${days === 1 ? "dag" : "dagen"}`}</span>
                  <LeaveStatusBadge status={r.status} />
                  <span className="ml-auto text-xs">
                    {r.status === "PENDING" && (
                      <form action={cancelOwnRequest.bind(null, r.id)}>
                        <button className="underline hover:no-underline">intrekken</button>
                      </form>
                    )}
                  </span>
                  {(r.note || decided) && (
                    <span className="w-full text-xs text-foreground-muted">
                      {r.note}
                      {r.note && decided ? " · " : ""}
                      {decided && `${r.status === "APPROVED" ? "goedgekeurd" : "afgewezen"} door ${r.decidedBy!.name}${r.decisionNote ? `: ${r.decisionNote}` : ""}`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-foreground-muted">Goedgekeurd verlof wijzigen? Vraag een planner.</p>
      </div>
    </div>
  );
}
