import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { dateFromISO, formatDayMonth, toISODate } from "@/lib/format";
import { fmtHours, loadBalances, overtimeEnabled } from "@/lib/leave-balance";
import { balanceView } from "@/lib/leave-view";
import { canManageHours } from "@/lib/roles";
import { ensureColorGroups, sortEmployees, todayAmsterdam } from "@/lib/schedule";
import { setOvertime } from "./actions";

const num = "px-3 py-1.5 text-right tabular-nums";

/**
 * Overwerk bijschrijven bij het verlof: voorvertoning per medewerker (wie krijgt hoeveel uur erbij) en de schakelaar.
 * De berekening is dezelfde als in het saldo; alleen met overwerk aan of uit.
 */
export default async function OverwerkPage() {
  const session = await auth();
  if (!session?.user || !canManageHours(session.user.role)) redirect("/rooster");

  const todayISO = toISODate(todayAmsterdam());
  const [enabled, employeesRaw, groups] = await Promise.all([
    overtimeEnabled(),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, colorGroup: true, experience: true } }),
    ensureColorGroups(),
  ]);
  const employees = sortEmployees(employeesRaw, groups);
  const ids = employees.map((e) => e.id);
  const [without, withOt] = await Promise.all([loadBalances(todayISO, ids, [], false), loadBalances(todayISO, ids, [], true)]);

  const rows = employees
    .map((e) => {
      const before = without.get(e.id)!;
      const after = withOt.get(e.id)!;
      const credited = after.overtime.filter((w) => w.status === "credited");
      const pending = after.overtime.filter((w) => w.status === "pending");
      return {
        e,
        before,
        after,
        credited,
        pending,
        creditedHours: credited.reduce((s, w) => s + w.hours, 0),
        pendingHours: pending.reduce((s, w) => s + w.hours, 0),
        yearEndBefore: before.buckets.length ? balanceView(before, todayISO).yearEnd : 0,
        yearEndAfter: after.buckets.length ? balanceView(after, todayISO).yearEnd : 0,
      };
    })
    .filter((r) => r.after.overtime.length > 0);
  const total = rows.reduce((s, r) => s + r.creditedHours, 0);
  const week = (iso: string) => formatDayMonth(dateFromISO(iso));

  return (
    <div className="flex max-w-4xl flex-col gap-3">
      <div>
        <Link href="/verlofuren" className="text-xs underline hover:no-underline">
          ← terug naar Verlofuren
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Overwerk bijschrijven bij het verlof</h1>
        <p className="text-sm text-foreground-muted">
          Werkt iemand in een week meer dan het contract, dan komen de extra uren als tegoed bij het verlof van het jaar van die week
          (en vervallen ze daarmee, op 30 juni van het jaar erna). Elke week telt apart, alleen voorbije weken waarvan de uren zijn
          goedgekeurd (de week of de maand), en pas vanaf de peildatum van het tegoed.
        </p>
      </div>

      <div className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${enabled ? "border-border bg-good text-good-text" : "border-border bg-surface"}`}>
        <span className="font-medium">{enabled ? "Staat aan: het overwerk telt mee in alle saldi." : "Staat uit: de saldi zijn nog zonder overwerk."}</span>
        <form action={setOvertime.bind(null, !enabled)} className="ml-auto">
          <button className={`rounded-md px-3 py-1.5 font-medium ${enabled ? "border border-border hover:bg-surface-muted" : "bg-accent text-accent-foreground"}`}>
            {enabled ? "Uitzetten" : `Aanzetten (${fmtHours(total)} uur voor ${rows.filter((r) => r.creditedHours > 0).length} medewerkers)`}
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-foreground-muted">Er zijn nog geen voorbije weken met meer gewerkte uren dan het contract.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium text-foreground-muted">
                <th className="px-3 py-2">Medewerker</th>
                <th className="px-3 py-2 text-right">Erbij</th>
                <th className="px-3 py-2 text-right" title="Overwerk in weken waarvan de uren nog niet zijn goedgekeurd">Wacht</th>
                <th className="px-3 py-2 text-right">Nu over</th>
                <th className="px-3 py-2 text-right">31 dec</th>
                <th className="px-3 py-2">Weken</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.e.id} className="border-b border-border align-top last:border-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/verlofuren/${r.e.id}`} className="font-medium hover:underline">
                      {r.e.name}
                    </Link>
                  </td>
                  <td className={`${num} font-semibold text-good-text`}>{r.creditedHours > 0 ? `+${fmtHours(r.creditedHours)}` : "–"}</td>
                  <td className={`${num} text-foreground-muted`}>{r.pendingHours > 0 ? fmtHours(r.pendingHours) : "–"}</td>
                  <td className={num}>
                    {fmtHours(r.before.available)}
                    {r.after.available !== r.before.available && <span className="text-foreground-muted"> → {fmtHours(r.after.available)}</span>}
                  </td>
                  <td className={num}>
                    {fmtHours(r.yearEndBefore)}
                    {r.yearEndAfter !== r.yearEndBefore && <span className="text-foreground-muted"> → {fmtHours(r.yearEndAfter)}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-foreground-muted">
                    {r.after.overtime.map((w) => (
                      <span key={w.dateISO} className={`mr-2 inline-block ${w.status === "credited" ? "text-good-text" : w.status === "ignored" ? "line-through" : ""}`} title={`${w.detail}${w.status === "pending" ? " · uren nog niet goedgekeurd" : w.status === "ignored" ? " · voor de peildatum" : ""}`}>
                        {w.label.replace("Week ", "wk ")} ({week(w.dateISO)}) +{fmtHours(w.hours)}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-foreground-muted">
        Groen = wordt bijgeschreven; grijs = de uren van die week zijn nog niet goedgekeurd; doorgestreept = voor de peildatum, telt niet mee.
        Nu over en 31 dec tonen het saldo zonder → met overwerk.
      </p>
    </div>
  );
}
