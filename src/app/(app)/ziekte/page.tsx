import { Fragment } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, formatDayMonth, toISODate } from "@/lib/format";
import { fmtHours, parsePeriod } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import { loadSickness } from "@/lib/sickness";
import { GroupHeaderRow } from "@/components/group-header-row";
import { InfoTip } from "@/components/info-tip";

const input = "rounded-md border border-border bg-surface px-3 py-2 text-sm";
const fmtISO = (iso: string) => {
  const d = dateFromISO(iso);
  return `${formatDayMonth(d)} ${d.getUTCFullYear()}`;
};

/** Ziekteoverzicht uit het rooster (Z). Alleen voor planners en administratie. */
export default async function ZiektePage({ searchParams }: { searchParams: Promise<{ van?: string; tot?: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const todayISO = toISODate(todayAmsterdam());
  const { fromISO, toISO } = parsePeriod(await searchParams, todayISO);
  const query = new URLSearchParams({ van: fromISO, tot: toISO }).toString();
  const year = todayISO.slice(0, 4);

  const [employeesRaw, groups] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, colorGroup: true, experience: true, weeklyHours: true } }),
    ensureColorGroups(),
  ]);
  const employees = sortEmployees(employeesRaw, groups);
  const sickness = await loadSickness(employees.map((e) => e.id), fromISO, toISO, todayISO);

  let totalDays = 0;
  let totalHours = 0;
  let yearDays = 0;
  let yearHours = 0;
  for (const s of sickness.values()) {
    totalDays += s.inRange.days;
    totalHours += s.inRange.hours;
    yearDays += s.thisYear.days;
    yearHours += s.thisYear.hours;
  }
  const withPeriods = employees.filter((e) => sickness.get(e.id)!.periods.length > 0);

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          Ziekte
          <InfoTip>
            <span className="flex flex-col gap-1.5">
              <span>Uit het rooster (dienst Z), zonder reden of diagnose. Alleen voor planners en administratie.</span>
              <span>
                De uren van een ziektedag volgen het contract van die week, verdeeld naar het vaste rooster. Aaneengesloten
                ziektedagen vormen één periode; vrije dagen ertussen (geen dienst of V, hooguit 4) onderbreken die niet.
              </span>
              <span>Een periode over de rand van de gekozen periode staat er met de echte datums; de totalen tellen alleen de dagen binnen de periode.</span>
            </span>
          </InfoTip>
        </h1>
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
        <a href={`/ziekte/export?${query}`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted">
          Csv totalen
        </a>
        <a href={`/ziekte/export?${query}&soort=periodes`} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted">
          Csv periodes
        </a>
      </form>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Medewerker</th>
              <th className="px-4 py-2 text-right">Uren/week</th>
              <th className="px-4 py-2 text-right">Dagen in periode</th>
              <th className="px-4 py-2 text-right">Uren in periode</th>
              <th className="px-4 py-2 text-right">Dagen {year}</th>
              <th className="px-4 py-2 text-right">Uren {year}</th>
              <th className="px-4 py-2">Nu</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => {
              const s = sickness.get(e.id)!;
              const current = s.periods.find((p) => p.ongoing);
              return (
                <Fragment key={e.id}>
                  {(i === 0 || employees[i - 1].colorGroup !== e.colorGroup) && <GroupHeaderRow group={e.colorGroup} colSpan={7} />}
                  <tr className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{e.name}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{e.weeklyHours ? fmtHours(e.weeklyHours) : "–"}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums">{s.inRange.days || "–"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{s.inRange.days ? fmtHours(s.inRange.hours) : "–"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{s.thisYear.days || "–"}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-foreground-muted">{s.thisYear.days ? fmtHours(s.thisYear.hours) : "–"}</td>
                    <td className="px-4 py-2">
                      {s.ongoing ? (
                        <span className="rounded bg-bad px-1.5 py-0.5 text-xs font-medium text-bad-text">
                          ziek{current ? ` sinds ${fmtISO(current.startISO)}` : ""}
                        </span>
                      ) : (
                        ""
                      )}
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
              <td className="px-4 py-2 text-right tabular-nums">{totalDays}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtHours(totalHours)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{yearDays}</td>
              <td className="px-4 py-2 text-right tabular-nums">{fmtHours(yearHours)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">
          Ziekteperiodes, {fmtISO(fromISO)} t/m {fmtISO(toISO)}
        </h2>
        {withPeriods.length === 0 && <p className="text-sm text-foreground-muted">Niemand ziek geweest in deze periode.</p>}
        {withPeriods.map((e) => {
          const s = sickness.get(e.id)!;
          return (
            <details key={e.id} className="border-t border-border pt-2 first-of-type:border-0">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{e.name}</span>
                <span className="ml-2 text-foreground-muted">
                  {s.periods.length === 1 ? "1 periode" : `${s.periods.length} periodes`}, {s.inRange.days} {s.inRange.days === 1 ? "dag" : "dagen"} in de gekozen periode
                </span>
              </summary>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {s.periods.map((p) => (
                    <tr key={p.startISO}>
                      <td className="py-1 pr-3">
                        {p.startISO === p.endISO && !p.ongoing ? fmtISO(p.startISO) : `${fmtISO(p.startISO)} t/m ${p.ongoing && p.endISO < todayISO ? "nu" : fmtISO(p.endISO)}`}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">
                        {p.days} {p.days === 1 ? "dag" : "dagen"}
                      </td>
                      <td className="py-1 pr-3 text-right tabular-nums">{fmtHours(p.hours)} uur</td>
                      <td className="py-1 text-xs">{p.ongoing ? <span className="font-medium text-bad-text">nog ziek</span> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          );
        })}
      </div>

    </div>
  );
}
