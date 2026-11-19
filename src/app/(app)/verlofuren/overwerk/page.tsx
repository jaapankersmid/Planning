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
import { InfoTip } from "@/components/info-tip";

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
  const [without, withOt] = await Promise.all([loadBalances(todayISO, ids, { withOvertime: false }), loadBalances(todayISO, ids, { withOvertime: true })]);

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
        plannedHours: after.overtime.filter((w) => w.status === "planned").reduce((s, w) => s + w.hours, 0),
        yearEndBefore: before.buckets.length ? balanceView(before, todayISO).yearEnd : 0,
        yearEndAfter: after.buckets.length ? balanceView(after, todayISO).yearEnd : 0,
      };
    })
    .filter((r) => r.after.overtime.length > 0);
  const total = rows.reduce((s, r) => s + r.creditedHours, 0);
  const week = (iso: string) => formatDayMonth(dateFromISO(iso));
  const weekList = (list: { label: string; dateISO: string }[]) => list.map((w) => `${w.label.replace("Week ", "wk ")} (${week(w.dateISO)})`).join(", ");

  /** Waarom (een deel van) het overwerk van deze medewerker er niet bij komt. */
  const whyNot = (r: (typeof rows)[number]) => {
    const out: string[] = [];
    if (!enabled && r.creditedHours > 0) out.push(`overwerk bijschrijven staat uit: +${fmtHours(r.creditedHours)} uur komt er pas bij als je het aanzet`);
    if (r.pending.length) out.push(`${weekList(r.pending)}: uren nog niet goedgekeurd (keur de week of de maand goed bij Uren)`);
    const ignored = r.after.overtime.filter((w) => w.status === "ignored");
    if (ignored.length) out.push(`${weekList(ignored)}: voor de peildatum van het tegoed, telt niet mee`);
    const planned = r.after.overtime.filter((w) => w.status === "planned");
    if (planned.length) out.push(`${weekList(planned)}: week nog niet voorbij (ingepland, telt pas na goedkeuring)`);
    return out;
  };

  // Bij deze medewerkers kan geen overwerk worden berekend (dan staat er ook niets in de tabel).
  const notComputed = employees
    .map((e) => {
      const b = withOt.get(e.id)!;
      const reasons: string[] = [];
      if (b.buckets.length === 0) reasons.push("geen tegoed of correctie ingevuld");
      if (!b.weeklyHours || b.weeklyHours <= 0) reasons.push("geen contracturen (of 0 uur)");
      return { e, reasons };
    })
    .filter((x) => x.reasons.length > 0);

  return (
    <div className="flex max-w-4xl flex-col gap-3">
      <div>
        <Link href="/verlofuren" className="text-xs underline hover:no-underline">
          ← terug naar Verlofuren
        </Link>
        <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold">
          Overwerk bijschrijven bij het verlof
          <InfoTip>
            <span className="flex flex-col gap-1.5">
              <span>
                Werkt iemand in een week meer dan het contract van die week, dan komen de extra uren bij het verlof van dat jaar (en
                vervallen ze daarmee, op 30 juni van het jaar erna).
              </span>
              <span>
                Elke week telt apart, alleen voorbije weken waarvan de uren zijn goedgekeurd (week of maand), en pas vanaf de
                peildatum van het tegoed. Weken die nog komen tellen alleen in de verwachting.
              </span>
              <span>
                Groen = wordt bijgeschreven; grijs = uren nog niet goedgekeurd; schuin = ingepland; doorgestreept = voor de
                peildatum. Nu over en 31 dec: zonder → met overwerk.
              </span>
            </span>
          </InfoTip>
        </h1>
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
                <th className="px-3 py-2 text-right" title="Ingepland overwerk in weken die nog komen (volgens het rooster); telt alleen in de verwachting">Ingepland</th>
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
                  <td className={`${num} text-foreground-muted`}>{r.plannedHours > 0 ? `+${fmtHours(r.plannedHours)}` : "–"}</td>
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
                      <span key={w.dateISO} className={`mr-2 inline-block ${w.status === "credited" ? "text-good-text" : w.status === "ignored" ? "line-through" : w.status === "planned" ? "italic" : ""}`} title={`${w.detail}${w.status === "pending" ? " · uren nog niet goedgekeurd" : w.status === "ignored" ? " · voor de peildatum" : w.status === "planned" ? " · ingepland, voorlopig" : ""}`}>
                        {w.label.replace("Week ", "wk ")} ({week(w.dateISO)}) +{fmtHours(w.hours)}
                      </span>
                    ))}
                    {whyNot(r).length > 0 && (
                      <div className="mt-1 text-amber-700 dark:text-amber-300">
                        <span className="font-medium">Waarom niet?</span> {whyNot(r).join("; ")}.
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {notComputed.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-foreground-muted">
            Bij {notComputed.length} {notComputed.length === 1 ? "medewerker" : "medewerkers"} wordt geen overwerk berekend
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs">
            {notComputed.map(({ e, reasons }) => (
              <li key={e.id}>
                <Link href={`/verlofuren/${e.id}`} className="font-medium hover:underline">
                  {e.name}
                </Link>
                <span className="text-foreground-muted">: {reasons.join(" en ")}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
