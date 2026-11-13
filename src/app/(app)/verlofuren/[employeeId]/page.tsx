import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, formatDayMonth, toISODate, weekdayShort } from "@/lib/format";
import { fmtHours, loadBalance } from "@/lib/leave-balance";
import { canManageHours } from "@/lib/roles";
import { todayAmsterdam } from "@/lib/schedule";
import { AdjustmentForm } from "@/components/adjustment-form";
import { AllowanceEditor } from "@/components/allowance-editor";
import { LeaveBalanceCard } from "@/components/leave-balance-card";

/** De planning is pas ingevuld vanaf augustus 2026: voor 2026 geldt het tegoed als stand per 1 november. */
const defaultCountFrom = (year: number) => (year === 2026 ? "2026-11-01" : null);

export default async function VerlofurenDetailPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const { employeeId } = await params;
  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { name: true } });
  if (!employee) notFound();

  const today = todayAmsterdam();
  const todayISO = toISODate(today);
  const balance = await loadBalance(employeeId, todayISO);

  // Jaren om in te vullen: alle jaren met tegoed, plus vorig, dit en volgend jaar.
  const thisYear = today.getUTCFullYear();
  const years = [...new Set([...balance.buckets.map((b) => b.year), thisYear - 1, thisYear, thisYear + 1])].sort((a, b) => b - a);
  const allowanceYears = new Set(balance.buckets.filter((b) => b.updatedAt || b.hours > 0).map((b) => b.year));
  const bucketByYear = new Map(balance.buckets.map((b) => [b.year, b]));

  const recentDays = [...balance.days].sort((a, b) => b.dateISO.localeCompare(a.dateISO)).filter((d) => d.hours > 0 || d.dateISO >= `${thisYear - 1}-01-01`);

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href="/verlofuren" className="text-xs underline hover:no-underline">
          ← terug naar het overzicht
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Verlofuren van {employee.name}</h1>
      </div>

      <LeaveBalanceCard balance={balance} todayISO={todayISO} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
        <div>
          <h2 className="text-sm font-semibold">Tegoed per jaar invullen of aanpassen</h2>
          <p className="text-xs text-foreground-muted">
            Verandert er iets in het contract of de uren, pas dan het aantal uren van het betreffende jaar aan en zet er een
            opmerking bij. Het saldo wordt direct opnieuw berekend.
          </p>
        </div>
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
              <th className="px-4 py-2">Verlofdag (V)</th>
              <th className="px-4 py-2 text-right">Uren</th>
              <th className="px-4 py-2">Van tegoed</th>
            </tr>
          </thead>
          <tbody>
            {recentDays.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-foreground-muted">
                  Nog geen verlofdagen in het rooster.
                </td>
              </tr>
            )}
            {recentDays.map((d) => {
              const date = dateFromISO(d.dateISO);
              return (
                <tr key={d.dateISO} className="border-b border-border last:border-0">
                  <td className="px-4 py-1.5">
                    {weekdayShort(date)} {formatDayMonth(date)} {date.getUTCFullYear()}
                    {d.dateISO > todayISO && <span className="ml-2 text-xs text-foreground-muted">gepland</span>}
                  </td>
                  <td className="px-4 py-1.5 text-right tabular-nums">{d.ignored ? <span className="text-foreground-muted">telt niet mee</span> : d.hours === 0 ? <span className="text-foreground-muted">0 (geen werkdag)</span> : fmtHours(d.hours)}</td>
                  <td className="px-4 py-1.5 text-foreground-muted">{d.ignored ? "voor de peildatum" : d.taken.map((t) => `${t.year}: ${fmtHours(t.hours)}`).join(", ") || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
