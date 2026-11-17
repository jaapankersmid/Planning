import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, formatDayMonth, toISODate } from "@/lib/format";
import { fmtHours, loadBalances, parsePeriod, periodLeave } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import { GroupHeaderRow } from "@/components/group-header-row";

const input = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

const fmtISO = (iso: string) => {
  const d = dateFromISO(iso);
  return `${formatDayMonth(d)} ${d.getUTCFullYear()}`;
};

export default async function VerlofurenPage({ searchParams }: { searchParams: Promise<{ van?: string; tot?: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const todayISO = toISODate(todayAmsterdam());
  const { fromISO, toISO } = parsePeriod(await searchParams, todayISO);
  const query = new URLSearchParams({ van: fromISO, tot: toISO }).toString();
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

  const periods = new Map(employees.map((e) => [e.id, periodLeave(balances.get(e.id)!, fromISO, toISO)]));
  let periodTotal = 0;
  let periodPlanned = 0;
  for (const p of periods.values()) {
    periodTotal += p.total;
    periodPlanned += p.planned;
  }

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Verlofuren</h1>
        <p className="text-sm text-foreground-muted">
          Het tegoed van een jaar geldt van 1 januari tot en met 30 juni van het jaar erna. Open een medewerker om het
          tegoed in te vullen of aan te passen.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Periode van
          <input type="date" name="van" defaultValue={fromISO} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          tot en met
          <input type="date" name="tot" defaultValue={toISO} className={input} />
        </label>
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Tonen</button>
        <a href={`/verlofuren/export?${query}`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted">
          Csv totalen
        </a>
        <a href={`/verlofuren/export?${query}&soort=weken`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted">
          Csv per week
        </a>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Medewerker</th>
              <th className="px-4 py-2 text-right">Uren/week</th>
              <th className="px-4 py-2 text-right" title={`Weken waarvan de maandag valt van ${fmtISO(fromISO)} t/m ${fmtISO(toISO)}`}>
                Verlof in periode
              </th>
              <th className="px-4 py-2 text-right">Opgenomen</th>
              <th className="px-4 py-2 text-right">Ingepland</th>
              <th className="px-4 py-2 text-right">Nu over</th>
              <th className="px-4 py-2 text-right">31 dec {todayISO.slice(0, 4)}</th>
              <th className="px-4 py-2 text-right">30 juni {Number(todayISO.slice(0, 4)) + 1}</th>
              <th className="px-4 py-2">Vervalt</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => {
              const b = balances.get(e.id)!;
              const empty = b.buckets.length === 0;
              const period = periods.get(e.id)!;
              return (
                <Fragment key={e.id}>
                {(i === 0 || employees[i - 1].colorGroup !== e.colorGroup) && <GroupHeaderRow group={e.colorGroup} colSpan={10} />}
                <tr className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{e.name}</td>
                  {empty ? (
                    <td colSpan={8} className="px-4 py-2 text-foreground-muted">
                      nog geen verlofuren ingevuld
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">
                        {b.weeklyHours ? fmtHours(b.weeklyHours) : <span className="text-amber-700 dark:text-amber-300" title="Standaard uren per week ontbreken">ontbreekt</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        <span className="font-semibold">{fmtHours(period.total)}</span>
                        {period.planned > 0 && <span className="block text-xs text-foreground-muted">waarvan {fmtHours(period.planned)} ingepland</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{fmtHours(b.takenPast)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{fmtHours(b.plannedFuture)}</td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums ${b.available < 0 ? "text-bad-text" : ""}`}>
                        {fmtHours(b.available)}
                      </td>
                      <td className={`px-4 py-2 text-right tabular-nums ${b.forecastYearEnd < 0 ? "text-bad-text" : ""}`}>{fmtHours(b.forecastYearEnd)}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${b.forecast < 0 ? "text-bad-text" : ""}`}>{fmtHours(b.forecast)}</td>
                      <td className="px-4 py-2 text-foreground-muted">
                        {b.expiring ? `${fmtHours(b.expiring.forecastHours)} uur na ${dayBefore(b.expiring.dateISO)}` : "–"}
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
          <tfoot>
            <tr className="border-t border-border bg-surface-muted font-semibold">
              <td className="px-4 py-2">Totaal</td>
              <td />
              <td className="px-4 py-2 text-right tabular-nums">
                {fmtHours(periodTotal)}
                {periodPlanned > 0 && <span className="block text-xs font-normal text-foreground-muted">waarvan {fmtHours(periodPlanned)} ingepland</span>}
              </td>
              <td colSpan={7} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">
          Verlof per week, {fmtISO(fromISO)} t/m {fmtISO(toISO)}
        </h2>
        {employees.map((e) => {
          const period = periods.get(e.id)!;
          if (period.weeks.length === 0) return null;
          return (
            <details key={e.id} className="border-t border-border pt-2 first-of-type:border-0">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{e.name}</span>
                <span className="ml-2 text-foreground-muted">
                  {fmtHours(period.total)} uur in {period.weeks.filter((w) => !w.ignored).length} weken
                </span>
              </summary>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {period.weeks.map((w) => (
                    <tr key={w.dateISO} className={w.ignored ? "text-foreground-muted line-through" : ""}>
                      <td className="py-1 pr-3">{w.label}</td>
                      <td className="py-1 pr-3 text-foreground-muted">vanaf {fmtISO(w.dateISO)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{fmtHours(w.hours)} uur</td>
                      <td className="py-1 pr-3 text-xs text-foreground-muted">{w.detail}</td>
                      <td className="py-1 text-xs text-foreground-muted">{w.ignored ? "voor de peildatum, telt niet mee" : w.planned ? "ingepland" : "opgenomen"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
        {[...periods.values()].every((p) => p.weeks.length === 0) && <p className="text-sm text-foreground-muted">Geen verlof in deze periode.</p>}
      </div>

      <p className="text-xs text-foreground-muted">
        Opgenomen verlof per week is de standaard uren per week min de gewerkte uren; voor weken die nog komen de geplande
        uren. Een ziektedag telt voor de uren uit het vaste rooster, zodat ziekte geen verlof kost. Bij Verlof in periode tellen
        de weken waarvan de maandag in de periode valt. De kolommen 31 dec en 30 juni zijn wat er naar verwachting overblijft
        als het ingeplande verlof tot die dag wordt opgenomen; wat er op 30 juni nog over is, vervalt daarna. Bij Vervalt staat
        de verwachting, dus na aftrek van ingepland verlof.
      </p>
    </div>
  );
}
