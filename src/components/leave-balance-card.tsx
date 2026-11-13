import { dateFromISO, formatDayMonth } from "@/lib/format";
import { expiryISO, fmtHours, type Balance } from "@/lib/leave-balance";

/** "2027-07-01" -> "30 juni 2027": de laatste dag dat het tegoed geldt. */
const dayBefore = (iso: string) => {
  const d = dateFromISO(iso);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${formatDayMonth(d)} ${d.getUTCFullYear()}`;
};
const dayMonthYear = (iso: string) => {
  const d = dateFromISO(iso);
  return `${formatDayMonth(d)} ${d.getUTCFullYear()}`;
};
const lastDay = (year: number) => dayBefore(expiryISO(year));

/** Overzicht van verlofuren: wat er nog is, wat er is opgenomen en wanneer uren vervallen. Voor medewerker en administratie. */
export function LeaveBalanceCard({ balance, todayISO }: { balance: Balance & { noTemplate?: boolean }; todayISO: string }) {
  const { buckets } = balance;
  if (buckets.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-foreground-muted">
        De administratie heeft nog geen verlofuren ingevuld.
      </div>
    );
  }

  const soon = balance.expiring && dateFromISO(balance.expiring.dateISO).getTime() - dateFromISO(todayISO).getTime() < 120 * 86400000;
  const visible = buckets.filter((b) => !(b.expired && b.remaining === 0 && b.used === 0));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Nog op te nemen</div>
          <div className={`text-3xl font-semibold tabular-nums ${balance.available < 0 ? "text-bad-text" : ""}`}>
            {fmtHours(balance.available)} <span className="text-base font-normal text-foreground-muted">uur</span>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="text-xs text-foreground-muted">Opgenomen</dt>
            <dd className="tabular-nums">{fmtHours(balance.takenPast)} uur</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Al ingepland, nog te komen</dt>
            <dd className="tabular-nums">{fmtHours(balance.plannedFuture)} uur</dd>
          </div>
        </dl>
      </div>

      {balance.available < 0 && (
        <p className="text-sm text-bad-text">Er is meer verlof ingepland dan er tegoed is.</p>
      )}
      {balance.expiring && (
        <p className={`text-sm ${soon ? "text-amber-700 dark:text-amber-300" : "text-foreground-muted"}`}>
          {fmtHours(balance.expiring.hours)} uur vervalt na {dayBefore(balance.expiring.dateISO)} als dat niet wordt opgenomen.
        </p>
      )}
      {balance.noTemplate && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Voor deze medewerker is geen vast rooster ingesteld, dus de verlofdagen tellen voor 0 uur mee.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="py-1.5 pr-4">Tegoed</th>
              <th className="py-1.5 pr-4 text-right">Uren</th>
              <th className="py-1.5 pr-4 text-right">Opgenomen</th>
              <th className="py-1.5 pr-4 text-right">Over</th>
              <th className="py-1.5">Geldig</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr key={b.year} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-4 font-medium">{b.year}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {fmtHours(b.hours + (b.adjustment ?? 0))}
                  {!!b.adjustment && (
                    <div className="text-xs text-foreground-muted">
                      {fmtHours(b.hours)} {b.adjustment > 0 ? "+" : "−"} {fmtHours(Math.abs(b.adjustment))} correctie
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{fmtHours(b.used)}</td>
                <td className={`py-1.5 pr-4 text-right tabular-nums ${b.remaining < 0 ? "text-bad-text" : ""}`}>
                  {b.expired && b.lost > 0 ? <span className="text-foreground-muted line-through">{fmtHours(b.lost)}</span> : fmtHours(b.remaining)}
                </td>
                <td className="py-1.5 text-foreground-muted">
                  {b.future ? `vanaf 1 januari ${b.year}` : b.expired ? `verlopen op ${lastDay(b.year)}` : `t/m ${lastDay(b.year)}`}
                  {b.countFromISO && <div className="text-xs">stand per {dayMonthYear(b.countFromISO)}</div>}
                  {b.note && <div className="text-xs">{b.note}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {balance.adjustments.length > 0 && (
        <div className="overflow-x-auto">
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">Correcties</h3>
          <table className="w-full text-sm">
            <tbody>
              {balance.adjustments.map((a) => (
                <tr key={a.id} className="border-b border-border align-top last:border-0">
                  <td className="whitespace-nowrap py-1.5 pr-4 text-foreground-muted">{dayMonthYear(a.dateISO)}</td>
                  <td className={`py-1.5 pr-4 text-right font-medium tabular-nums ${a.hours < 0 ? "text-bad-text" : ""}`}>
                    {a.hours > 0 ? "+" : "−"}{fmtHours(Math.abs(a.hours))}
                  </td>
                  <td className="py-1.5 pr-4 text-foreground-muted">tegoed {a.year}</td>
                  <td className="py-1.5">
                    {a.reason}
                    {a.byName && <span className="ml-1 text-xs text-foreground-muted">— {a.byName}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-foreground-muted">
        Verlofuren van een jaar gelden van 1 januari tot en met 30 juni van het jaar erna. Een V in het rooster telt
        voor de uren die je die weekdag normaal werkt en gaat eerst van het oudste tegoed af.
      </p>
    </div>
  );
}
