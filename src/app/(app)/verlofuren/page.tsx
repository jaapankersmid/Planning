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
import { ExpandableRow } from "@/components/expandable-row";
import { balanceView } from "@/lib/leave-view";

const input = "rounded-md border border-border bg-surface px-2 py-1 text-sm";
const COLS = 7; // pijltje + 6 kolommen
const num = "px-3 py-1.5 text-right tabular-nums";

const fmtISO = (iso: string) => {
  const d = dateFromISO(iso);
  return `${formatDayMonth(d)} ${d.getUTCFullYear()}`;
};

const neg = (n: number) => (n < 0 ? "text-bad-text" : "");

export default async function VerlofurenPage({ searchParams }: { searchParams: Promise<{ van?: string; tot?: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const todayISO = toISODate(todayAmsterdam());
  const year = Number(todayISO.slice(0, 4));
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
    <div className="flex max-w-4xl flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Verlofuren</h1>
          <p className="text-xs text-foreground-muted">
            Klik op een medewerker voor het verlof per week. ·{" "}
            <Link href="/verlofuren/overwerk" className="underline hover:no-underline">
              Overwerk bijschrijven
            </Link>
          </p>
        </div>
        <form className="flex flex-wrap items-center gap-2 text-sm">
          <input type="date" name="van" defaultValue={fromISO} className={input} aria-label="Periode van" />
          <span className="text-foreground-muted">t/m</span>
          <input type="date" name="tot" defaultValue={toISO} className={input} aria-label="Periode tot en met" />
          <button className="rounded-md bg-accent px-3 py-1 font-medium text-accent-foreground">Tonen</button>
          <span className="text-xs text-foreground-muted">csv:</span>
          <a href={`/verlofuren/export?${query}`} className="text-xs underline hover:no-underline">totalen</a>
          <a href={`/verlofuren/export?${query}&soort=weken`} className="text-xs underline hover:no-underline">per week</a>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium text-foreground-muted">
              <th className="w-5" />
              <th className="px-3 py-2">Medewerker</th>
              <th className="px-3 py-2 text-right" title={`Weken waarvan de maandag valt van ${fmtISO(fromISO)} t/m ${fmtISO(toISO)}`}>
                In periode
              </th>
              <th className="px-3 py-2 text-right" title="Dit verlofjaar: opgenomen in voorbije weken / ingepland in komende weken">
                Opgen. / gepland
              </th>
              <th className="px-3 py-2 text-right">Nu over</th>
              <th className="px-3 py-2 text-right" title={`Verwacht over op 31 december ${year}, en hoeveel daarvan in ${year + 1} (t/m 30 juni) wordt gebruikt of ingepland. Is het tegoed eind december op, dan staat er op.`}>
                31-12 / in {year + 1}
              </th>
              <th className="px-3 py-2 text-right" title="Verwacht aantal uren dat vervalt, na aftrek van ingepland verlof">
                Vervalt
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => {
              const b = balances.get(e.id)!;
              const empty = b.buckets.length === 0;
              const period = periods.get(e.id)!;
              const view = empty ? null : balanceView(b, todayISO);
              const name = (
                <td className="px-3 py-1.5">
                  <Link href={`/verlofuren/${e.id}`} className="font-medium hover:underline">
                    {e.name}
                  </Link>
                  {!empty && !b.weeklyHours && (
                    <span className="ml-2 text-xs text-amber-700 dark:text-amber-300" title="Standaard uren per week ontbreken">
                      uren/week ontbreekt
                    </span>
                  )}
                </td>
              );
              const cells = empty ? (
                <>
                  {name}
                  <td colSpan={COLS - 2} className="px-3 py-1.5 text-xs text-foreground-muted">
                    nog geen tegoed —{" "}
                    <Link href={`/verlofuren/${e.id}`} className="underline hover:no-underline">
                      invullen
                    </Link>
                  </td>
                </>
              ) : (
                <>
                  {name}
                  <td className={num}>
                    {period.total ? fmtHours(period.total) : <span className="text-foreground-muted">–</span>}
                    {period.planned > 0 && <span className="ml-1 text-xs text-foreground-muted" title="waarvan ingepland">({fmtHours(period.planned)})</span>}
                  </td>
                  <td className={`${num} text-foreground-muted`}>
                    {fmtHours(b.takenPast)} / {fmtHours(b.plannedFuture)}
                  </td>
                  <td className={`${num} font-semibold ${neg(b.available)}`}>{fmtHours(b.available)}</td>
                  <td className={num}>
                    <span className={neg(b.forecastYearEnd)}>{fmtHours(b.forecastYearEnd)}</span>
                    <span className="text-foreground-muted"> / </span>
                    {view?.nextYear ? (
                      <span title={`${fmtHours(view.nextYear.taken)} opgenomen, ${fmtHours(view.nextYear.planned)} ingepland van ${fmtHours(view.nextYear.of)} uur`}>
                        {fmtHours(view.nextYear.taken + view.nextYear.planned)} van {fmtHours(view.nextYear.of)}
                      </span>
                    ) : view?.usedUpThisYear ? (
                      <span className="text-xs text-foreground-muted">op</span>
                    ) : (
                      <span className="text-foreground-muted">–</span>
                    )}
                  </td>
                  <td
                    className={`${num} ${view?.expires ? "text-amber-700 dark:text-amber-300" : "text-foreground-muted"}`}
                    title={view?.expires ? `na ${dayBefore(view.expires.dateISO)}` : undefined}
                  >
                    {view?.expires ? (
                      <>
                        {fmtHours(view.expires.hours)}
                        <span className="ml-1 text-xs text-foreground-muted">{dayBefore(view.expires.dateISO).replace(/ \d{4}$/, "")}</span>
                      </>
                    ) : (
                      "–"
                    )}
                  </td>
                </>
              );
              const detail =
                period.weeks.length === 0 ? null : (
                  <div className="flex flex-wrap gap-1.5">
                    {period.weeks.map((w) => (
                      <span
                        key={w.dateISO}
                        title={`${w.label}, vanaf ${fmtISO(w.dateISO)}${w.detail ? ` · ${w.detail}` : ""}${w.ignored ? " · voor de peildatum, telt niet mee" : w.planned ? " · ingepland" : ""}`}
                        className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${
                          w.ignored
                            ? "border-border text-foreground-muted line-through"
                            : w.planned
                              ? "border-dashed border-accent/60 bg-surface"
                              : "border-border bg-surface"
                        }`}
                      >
                        <span className="text-foreground-muted">{(w.label ?? "").replace("Week ", "wk ")}</span> {fmtHours(w.hours)}
                      </span>
                    ))}
                  </div>
                );
              return (
                <Fragment key={e.id}>
                  {(i === 0 || employees[i - 1].colorGroup !== e.colorGroup) && <GroupHeaderRow group={e.colorGroup} colSpan={COLS} />}
                  <ExpandableRow cells={cells} detail={detail} colSpan={COLS} />
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface-muted font-semibold">
              <td />
              <td className="px-3 py-1.5">Totaal</td>
              <td className={num}>
                {fmtHours(periodTotal)}
                {periodPlanned > 0 && <span className="ml-1 text-xs font-normal text-foreground-muted">({fmtHours(periodPlanned)})</span>}
              </td>
              <td colSpan={COLS - 3} />
            </tr>
          </tfoot>
        </table>
      </div>

      <details className="text-xs text-foreground-muted">
        <summary className="cursor-pointer">Hoe wordt dit berekend?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Het tegoed van een jaar geldt van 1 januari tot en met 30 juni van het jaar erna. Klik op een naam om het tegoed in te vullen of aan te passen.</li>
          <li>Opgenomen verlof per week is de standaard uren per week min de gewerkte uren; voor komende weken de geplande uren. Een ziektedag telt altijd voor de uren uit het vaste rooster (ook als er uren zijn ingevuld), dus ziekte kost geen verlof.</li>
          <li>In periode: de weken waarvan de maandag in de gekozen periode valt. Tussen haakjes het deel dat nog ingepland is.</li>
          <li>31-12 / in volgend jaar: wat er eind december naar verwachting over is, en hoeveel daarvan in het volgende jaar (t/m 30 juni) wordt opgenomen of is ingepland. Is het tegoed eind december op, dan staat er op en vervalt er niets meer.</li>
          <li>Vervalt: alleen als er na aftrek van ingepland verlof echt iets vervalt, met de datum.</li>
          <li>In de weken: een gestippeld blokje is ingepland, doorgestreept telt niet mee (voor de peildatum).</li>
        </ul>
      </details>
    </div>
  );
}
