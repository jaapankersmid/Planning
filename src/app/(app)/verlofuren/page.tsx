import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, formatDayMonth, toISODate } from "@/lib/format";
import { fmtHours, loadBalances } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import { GroupHeaderRow } from "@/components/group-header-row";

export default async function VerlofurenPage() {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const todayISO = toISODate(todayAmsterdam());
  const [employeesRaw, groups] = await Promise.all([
    prisma.employee.findMany({
      where: { active: true },
      select: { id: true, name: true, colorGroup: true, experience: true },
    }),
    ensureColorGroups(),
  ]);
  // Zelfde volgorde als in het rooster: kleurgroep, dan ervaring, dan naam.
  const employees = sortEmployees(employeesRaw, groups);
  const balances = await loadBalances(todayISO, employees.map((e) => e.id));

  const dayBefore = (iso: string) => {
    const d = dateFromISO(iso);
    d.setUTCDate(d.getUTCDate() - 1);
    return `${formatDayMonth(d)} ${d.getUTCFullYear()}`;
  };

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Verlofuren</h1>
        <p className="text-sm text-foreground-muted">
          Het tegoed van een jaar geldt van 1 januari tot en met 30 juni van het jaar erna. Open een medewerker om het
          tegoed in te vullen of aan te passen.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Medewerker</th>
              <th className="px-4 py-2 text-right">Uren/week</th>
              <th className="px-4 py-2 text-right">Opgenomen</th>
              <th className="px-4 py-2 text-right">Ingepland</th>
              <th className="px-4 py-2 text-right">Nu over</th>
              <th className="px-4 py-2 text-right">Eind {todayISO.slice(0, 4)}</th>
              <th className="px-4 py-2">Vervalt</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => {
              const b = balances.get(e.id)!;
              const empty = b.buckets.length === 0;
              return (
                <Fragment key={e.id}>
                {(i === 0 || employees[i - 1].colorGroup !== e.colorGroup) && <GroupHeaderRow group={e.colorGroup} colSpan={8} />}
                <tr className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{e.name}</td>
                  {empty ? (
                    <td colSpan={6} className="px-4 py-2 text-foreground-muted">
                      nog geen verlofuren ingevuld
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">
                        {b.weeklyHours ? fmtHours(b.weeklyHours) : <span className="text-amber-700 dark:text-amber-300" title="Standaard uren per week ontbreken">ontbreekt</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{fmtHours(b.takenPast)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{fmtHours(b.plannedFuture)}</td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums ${b.available < 0 ? "text-bad-text" : ""}`}>
                        {fmtHours(b.available)}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${b.forecast < 0 ? "text-bad-text" : ""}`}>{fmtHours(b.forecast)}</td>
                      <td className="px-4 py-2 text-foreground-muted">
                        {b.expiring ? `${fmtHours(b.expiring.hours)} uur na ${dayBefore(b.expiring.dateISO)}` : "–"}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-2 text-right">
                    <Link href={`/verlofuren/${e.id}`} className="text-xs underline hover:no-underline">
                      {empty ? "invullen" : "openen"}
                    </Link>
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-foreground-muted">
        Opgenomen verlof per week is de standaard uren per week min de gewerkte uren; voor weken die nog komen de geplande
        uren. De kolom Eind {todayISO.slice(0, 4)} is wat er naar verwachting overblijft als dat ingeplande verlof wordt opgenomen.
      </p>
    </div>
  );
}
