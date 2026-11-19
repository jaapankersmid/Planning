import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, formatDayMonth, toISODate, weekdayShort } from "@/lib/format";
import { fmtHours, loadBalance } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";
import { AdjustmentForm } from "@/components/adjustment-form";
import { ContractHoursEditor } from "@/components/contract-hours-editor";
import { BEGIN_ISO } from "@/lib/contract-rules";
import { AllowanceEditor } from "@/components/allowance-editor";
import { LeaveBalanceCard } from "@/components/leave-balance-card";
import { HoursOverrideEditor } from "@/components/hours-override-editor";
import { shiftHours } from "@/lib/hours";
import { sortShiftTypes } from "@/lib/shift-order";
import { InfoTip } from "@/components/info-tip";

/** De planning is pas ingevuld vanaf augustus 2026: voor 2026 geldt het tegoed als stand per 1 november. */
const defaultCountFrom = (year: number) => (year === 2026 ? "2026-11-01" : null);

export default async function VerlofurenDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const { employeeId } = await params;
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true, weeklyHours: true } });
  if (!employee) notFound();

  const today = todayAmsterdam();
  const todayISO = toISODate(today);
  const [balance, overrideRows, shiftTypes, contractRows, contractLog] = await Promise.all([
    loadBalance(employeeId, todayISO),
    prisma.shiftHoursOverride.findMany({
      where: { employeeId },
      include: { shiftType: { select: { code: true, label: true } } },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
    }),
    prisma.shiftType.findMany({ where: { active: true } }),
    prisma.contractHours.findMany({ where: { employeeId }, orderBy: { validFrom: "asc" } }),
    prisma.contractHoursChange.findMany({ where: { employeeId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const contractPeriods = contractRows.map((r) => ({ fromISO: toISODate(r.validFrom), hours: r.hours, byName: r.createdByName }));
  const logDate = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });
  const periodText = (d: Date) => (toISODate(d) === BEGIN_ISO ? "vanaf het begin" : `vanaf ${formatDayMonth(d)} ${d.getUTCFullYear()}`);
  const overrideShifts = sortShiftTypes(shiftTypes)
    .filter((t) => shiftHours(t) > 0)
    .map((t) => ({ id: t.id, label: `${t.code} · ${t.label} (gewoon ${fmtHours(shiftHours(t))} uur)`, standard: shiftHours(t) }));
  // Per dienst geldt de regel met de laatste ingangsdatum t/m vandaag.
  const currentRule = new Map<string, string>();
  for (const r of [...overrideRows].reverse()) if (toISODate(r.validFrom) <= todayISO) currentRule.set(r.shiftTypeId, r.id);

  // Jaren om in te vullen: alle jaren met tegoed, plus vorig, dit en volgend jaar.
  const thisYear = today.getUTCFullYear();
  const years = [...new Set([...balance.buckets.map((b) => b.year), thisYear - 1, thisYear, thisYear + 1])].sort((a, b) => b - a);
  const allowanceYears = new Set(balance.buckets.filter((b) => b.updatedAt || b.hours > 0).map((b) => b.year));
  const bucketByYear = new Map(balance.buckets.map((b) => [b.year, b]));

  const recentDays = [...balance.days].sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  const overtimeByDate = new Map(balance.overtime.map((w) => [w.dateISO, w]));
  // Weken met alleen overwerk (geen verlof) komen er als eigen regel bij.
  const overtimeOnly = balance.overtime.filter((w) => !balance.days.some((d) => d.dateISO === w.dateISO));
  const tableRows = [
    ...recentDays.map((d) => ({ kind: "leave" as const, d })),
    ...overtimeOnly.map((w) => ({ kind: "overtime" as const, w })),
  ].sort((a, b) => (b.kind === "leave" ? b.d.dateISO : b.w.dateISO).localeCompare(a.kind === "leave" ? a.d.dateISO : a.w.dateISO));
  const overtimeText = (w: (typeof balance.overtime)[number]) =>
    w.status === "credited"
      ? `bijgeschreven bij ${w.year}`
      : w.status === "pending"
        ? "wacht op goedkeuring van de uren"
        : w.status === "planned"
          ? "ingepland, voorlopig (telt in de verwachting)"
          : w.status === "off"
            ? "nog niet bijgeschreven (overwerk bijschrijven staat uit)"
            : "voor de peildatum, telt niet mee";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href="/verlofuren" className="text-xs underline hover:no-underline">
          ← terug naar het overzicht
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Verlofuren van {employee.name}</h1>
      </div>

      <LeaveBalanceCard balance={balance} todayISO={todayISO} />

      <div id="contract" className="flex scroll-mt-4 flex-col gap-3 rounded-lg border border-border bg-surface p-5">
<h2 className="flex items-center gap-2 text-sm font-semibold">
          Contracturen per week
          <InfoTip>
            Verlof per week = het contract van die week min wat er is gewerkt (of gepland staat); daarboven is het overwerk. Een
            ziektedag telt volgens het contract van die week. Verandert het contract, voeg dan een periode toe met de datum waarop het
            ingaat: eerdere weken blijven met het oude contract rekenen.
          </InfoTip>
        </h2>
        <ContractHoursEditor employeeId={employeeId} periods={contractPeriods} fallbackHours={employee.weeklyHours} todayISO={todayISO} />
        {contractLog.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-foreground-muted">Logboek ({contractLog.length})</summary>
            <ul className="mt-1 flex flex-col gap-0.5 text-foreground-muted">
              {contractLog.map((c) => (
                <li key={c.id}>
                  {logDate.format(c.createdAt)} · {c.changedByName ?? "onbekend"} · {periodText(c.validFrom)}:{" "}
                  {c.oldHours === null ? "nieuw" : `${fmtHours(c.oldHours)} uur`} → {c.newHours === null ? "verwijderd" : `${fmtHours(c.newHours)} uur`}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
<h2 className="flex items-center gap-2 text-sm font-semibold">
          Afwijkende diensturen
          <InfoTip>
            Telt een dienst voor {employee.name} als een ander aantal uren dan normaal (bv. A en O als 9 uur bij 3 dagen van 9 uur)?
            Stel het hier in met een ingangsdatum. Het geldt voor de uren, het verlof en de overzichten; de tijden en de bezetting in
            het rooster blijven gelijk. Een latere wijziging is een nieuwe regel.
          </InfoTip>
        </h2>
        {overrideRows.length > 0 && (
          <table className="w-full max-w-2xl text-sm">
            <thead>
              <tr className="text-left text-xs text-foreground-muted">
                <th className="py-1 pr-3 font-normal">Dienst</th>
                <th className="py-1 pr-3 text-right font-normal">Uren</th>
                <th className="py-1 pr-3 font-normal">Vanaf</th>
                <th className="py-1 font-normal">Ingesteld</th>
              </tr>
            </thead>
            <tbody>
              {overrideRows.map((r) => {
                const iso = toISODate(r.validFrom);
                const status = currentRule.get(r.shiftTypeId) === r.id ? "geldt nu" : iso > todayISO ? "komt nog" : "vervangen";
                return (
                  <tr key={r.id} className={`border-t border-border align-top ${status === "vervangen" ? "text-foreground-muted" : ""}`}>
                    <td className="py-1 pr-3 font-medium">{r.shiftType.code}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">{r.hours === null ? "gewoon" : `${fmtHours(r.hours)} uur`}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      {formatDayMonth(r.validFrom)} {r.validFrom.getUTCFullYear()}
                      <span className="ml-1.5 text-xs text-foreground-muted">({status})</span>
                    </td>
                    <td className="py-1 text-xs text-foreground-muted">
                      {r.createdByName ?? "–"}, {formatDayMonth(r.createdAt)} {r.createdAt.getUTCFullYear()}
                      {r.note ? ` · ${r.note}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <HoursOverrideEditor employeeId={employeeId} shifts={overrideShifts} todayISO={todayISO} />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
<h2 className="flex items-center gap-2 text-sm font-semibold">
          Tegoed per jaar invullen of aanpassen
          <InfoTip>Pas het aantal uren van het jaar aan en zet er een opmerking bij. Het saldo wordt direct opnieuw berekend.</InfoTip>
        </h2>
        {years.map((year) => {
          const b = bucketByYear.get(year);
          return (
            <div key={year} className="flex flex-col gap-1 border-t border-border pt-3 first:border-0 first:pt-0">
              <div className="text-sm font-medium">
                {year}
                {b && (
                  <span className="ml-2 text-xs font-normal text-foreground-muted">
                    opgenomen {fmtHours(b.used)} · over {fmtHours(b.remaining)}
                    {b.updatedByName ? ` · laatst aangepast door ${b.updatedByName}` : ""}
                  </span>
                )}
              </div>
              <AllowanceEditor key={`${year}-${b?.hours}-${b?.note}-${b?.countFromISO}`} employeeId={employeeId} year={year} hours={b ? b.hours : null} note={b?.note ?? null} countFrom={b ? (b.countFromISO ?? null) : defaultCountFrom(year)} exists={allowanceYears.has(year)} />
            </div>
          );
        })}
      </div>

      <AdjustmentForm employeeId={employeeId} years={years} todayISO={todayISO} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Verlof per week</th>
              <th className="px-4 py-2 text-right">Uren</th>
              <th className="px-4 py-2">Van tegoed</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-foreground-muted">
                  Nog geen verlof berekend. Vul de standaard uren per week in; weken waarin minder is gewerkt of gepland dan dat aantal tellen als verlof.
                </td>
              </tr>
            )}
            {tableRows.map((row) => {
              if (row.kind === "overtime") {
                const w = row.w;
                const date = dateFromISO(w.dateISO);
                return (
                  <tr key={`o-${w.dateISO}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-1.5">
                      <span className="font-medium">{w.label}</span>{" "}
                      <span className="text-foreground-muted">
                        vanaf {weekdayShort(date)} {formatDayMonth(date)} {date.getUTCFullYear()}
                      </span>
                      <div className="text-xs text-foreground-muted">{w.detail}</div>
                    </td>
                    <td className={`px-4 py-1.5 text-right tabular-nums ${w.status === "credited" ? "text-good-text" : "text-foreground-muted"}`}>
                      {w.status === "planned" ? "Ingepland overwerk" : "Overgewerkt"} +{fmtHours(w.hours)}
                    </td>
                    <td className="px-4 py-1.5 text-foreground-muted">{overtimeText(w)}</td>
                  </tr>
                );
              }
              const d = row.d;
              const date = dateFromISO(d.dateISO);
              const ot = overtimeByDate.get(d.dateISO);
              return (
                <tr key={d.dateISO} className="border-b border-border last:border-0">
                  <td className="px-4 py-1.5">
                    <span className="font-medium">{d.label ?? ""}</span>{" "}
                    <span className="text-foreground-muted">
                      vanaf {weekdayShort(date)} {formatDayMonth(date)} {date.getUTCFullYear()}
                    </span>
                    {d.planned && <span className="ml-2 text-xs text-foreground-muted">ingepland</span>}
                    {d.detail && <div className="text-xs text-foreground-muted">{d.detail}</div>}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{d.ignored ? <span className="text-foreground-muted">telt niet mee</span> : fmtHours(d.hours)}</td>
                  <td className="px-4 py-1.5 text-foreground-muted">
                    {d.ignored ? "voor de peildatum" : d.taken.map((t) => `${t.year}: ${fmtHours(t.hours)}`).join(", ") || "–"}
                    {ot && <div className="text-xs">Overgewerkt +{fmtHours(ot.hours)} ({overtimeText(ot)})</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
