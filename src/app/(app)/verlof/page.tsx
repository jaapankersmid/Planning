import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatRange, toISODate } from "@/lib/format";
import { leaveDates } from "@/lib/leave";
import { todayAmsterdam } from "@/lib/schedule";
import { loadBalance } from "@/lib/leave-balance";
import { LeaveBalanceCard } from "@/components/leave-balance-card";
import { LeaveForm } from "@/components/leave-form";
import { LeaveStatusBadge } from "@/components/leave-status";
import { cancelOwnRequest, requestLeave } from "./actions";

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
    include: { decidedBy: { select: { name: true } } },
    orderBy: { startDate: "desc" },
  });
  const todayISO = toISODate(todayAmsterdam());
  const balance = await loadBalance(employeeId, todayISO);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Mijn verlof</h1>
        <p className="text-sm text-foreground-muted">
          Vraag hier vrij aan. Een planner moet het goedkeuren; daarna staan de dagen als V (Vrij) in
          het rooster.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Mijn verlofuren</h2>
        <LeaveBalanceCard balance={balance} todayISO={todayISO} />
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Verlof aanvragen</h2>
        <LeaveForm action={requestLeave} submitLabel="Aanvragen" minDate={todayISO} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Periode</th>
              <th className="px-4 py-2">Dagen</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-foreground-muted">
                  Je hebt nog geen verlof aangevraagd.
                </td>
              </tr>
            )}
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-border align-top last:border-0">
                <td className="px-4 py-2">
                  <div className="font-medium">{formatRange(r.startDate, r.endDate)}</div>
                  {r.note && <div className="text-xs text-foreground-muted">{r.note}</div>}
                </td>
                <td className="px-4 py-2 tabular-nums">
                  {leaveDates(r.startDate, r.endDate, r.includeWeekends).length}
                </td>
                <td className="px-4 py-2">
                  <LeaveStatusBadge status={r.status} />
                  {(r.status === "APPROVED" || r.status === "REJECTED") && r.decidedBy && (
                    <div className="mt-1 text-xs text-foreground-muted">
                      door {r.decidedBy.name}
                      {r.decisionNote ? ` — ${r.decisionNote}` : ""}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  {r.status === "PENDING" && (
                    <form action={cancelOwnRequest.bind(null, r.id)}>
                      <button className="text-xs underline hover:no-underline">intrekken</button>
                    </form>
                  )}
                  {r.status === "APPROVED" && r.endDate >= todayAmsterdam() && (
                    <span className="text-xs text-foreground-muted">wijzigen? vraag een planner</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
