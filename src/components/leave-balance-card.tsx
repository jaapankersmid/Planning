import { dateFromISO, formatDayMonth } from "@/lib/format";
import { expiryISO, fmtHours, type Balance, type Bucket } from "@/lib/leave-balance";

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

/** Het gebruik van één tegoed in één kalenderjaar, bv. "40 (8 opgenomen + 32 ingepland)". */
function UsageCell({ bucket, year }: { bucket: Bucket; year: number }) {
  const usage = bucket.usage.find((u) => u.year === year);
  const total = (usage?.taken ?? 0) + (usage?.planned ?? 0);
  if (!usage || total === 0) return <span className="text-foreground-muted">–</span>;
  return (
    <>
      <span className="font-medium tabular-nums">{fmtHours(total)}</span>
      <div className="text-xs text-foreground-muted">
        {usage.taken > 0 && `${fmtHours(usage.taken)} opgenomen`}
        {usage.taken > 0 && usage.planned > 0 && " + "}
        {usage.planned > 0 && `${fmtHours(usage.planned)} ingepland`}
      </div>
    </>
  );
}

/** Overzicht van verlofuren: wat er nog is, wat er is opgenomen en ingepland, en wat wanneer vervalt. Voor medewerker en administratie. */
export function LeaveBalanceCard({
  balance,
  todayISO,
  compact = false,
}: {
  balance: Balance & { weeklyHours?: number | null };
  todayISO: string;
  /** Mijn verlof: alleen de kern, de tabel per jaar en de uitleg ingeklapt. */
  compact?: boolean;
}) {
  const { buckets } = balance;
  if (buckets.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-foreground-muted">
        De administratie heeft nog geen verlofuren ingevuld.
      </div>
    );
  }

  const thisYear = Number(todayISO.slice(0, 4));
  const soon = balance.expiring && dateFromISO(balance.expiring.dateISO).getTime() - dateFromISO(todayISO).getTime() < 120 * 86400000;
  const visible = buckets.filter((b) => !(b.expired && b.remaining === 0 && b.used === 0));

  if (compact) {
    const warn =
      balance.available < 0
        ? "Je hebt meer verlof opgenomen dan je tegoed."
        : balance.forecastYearEnd < 0 || balance.forecast < 0
          ? "Met je ingeplande verlof kom je onder nul."
          : null;
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className={`text-2xl font-semibold tabular-nums ${balance.available < 0 ? "text-bad-text" : ""}`}>
            {fmtHours(balance.available)} <span className="text-sm font-normal text-foreground-muted">uur over</span>
          </div>
          <div className="text-xs text-foreground-muted tabular-nums">
            {fmtHours(balance.takenPast)} opgenomen · {fmtHours(balance.plannedFuture)} ingepland
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-surface-muted px-2 py-1.5">
            <dt className="text-foreground-muted">Verwacht 31 dec</dt>
            <dd className={`text-sm font-semibold tabular-nums ${balance.forecastYearEnd < 0 ? "text-bad-text" : ""}`}>{fmtHours(balance.forecastYearEnd)} uur</dd>
          </div>
          <div className="rounded-md bg-surface-muted px-2 py-1.5">
            <dt className="text-foreground-muted">Verwacht {dayMonthYear(balance.forecastISO).replace(/ d{4}$/, "")}</dt>
            <dd className={`text-sm font-semibold tabular-nums ${balance.forecast < 0 ? "text-bad-text" : ""}`}>{fmtHours(balance.forecast)} uur</dd>
          </div>
        </dl>
        {warn && <p className="text-xs text-bad-text">{warn}</p>}
        {balance.expiring && balance.expiring.forecastHours > 0 && (
          <p className={`text-xs ${soon ? "text-amber-700 dark:text-amber-300" : "text-foreground-muted"}`}>
            {fmtHours(balance.expiring.forecastHours)} uur vervalt na {dayBefore(balance.expiring.dateISO)} als je die niet opneemt.
          </p>
        )}
        {(balance.weeklyHours ?? 0) <= 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">Je uren per week zijn nog niet ingevuld; vraag de administratie.</p>
        )}
        <details className="text-xs">
          <summary className="cursor-pointer text-foreground-muted">Per jaar{balance.adjustments.length > 0 ? " en correcties" : ""}</summary>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-left text-foreground-muted">
                <th className="py-1 pr-2 font-normal">Tegoed</th>
                <th className="py-1 pr-2 text-right font-normal">Uren</th>
                <th className="py-1 pr-2 text-right font-normal">Over</th>
                <th className="py-1 font-normal">Geldig</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((b) => (
                <tr key={b.year} className="border-t border-border align-top">
                  <td className="py-1 pr-2 font-medium">{b.year}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtHours(b.hours + (b.adjustment ?? 0))}</td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${b.remaining < 0 ? "text-bad-text" : ""}`}>
                    {b.expired && b.lost > 0 ? <span className="text-foreground-muted line-through">{fmtHours(b.lost)}</span> : fmtHours(b.remaining)}
                  </td>
                  <td className="py-1 text-foreground-muted">
                    {b.future ? `vanaf 1 jan ${b.year}` : b.expired ? "verlopen" : `t/m ${lastDay(b.year)}`}
                  </td>
                </tr>
              ))}
              {balance.adjustments.map((a) => (
                <tr key={a.id} className="border-t border-border align-top text-foreground-muted">
                  <td className="py-1 pr-2" colSpan={2}>Correctie {dayMonthYear(a.dateISO)}</td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${a.hours < 0 ? "text-bad-text" : ""}`}>
                    {a.hours > 0 ? "+" : "−"}{fmtHours(Math.abs(a.hours))}
                  </td>
                  <td className="py-1">{a.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-foreground-muted">
            Een jaartegoed geldt t/m 30 juni van het jaar erna. Verlof per week = je uren per week
            {balance.weeklyHours ? ` (${fmtHours(balance.weeklyHours)})` : ""} min wat je werkt; het oudste tegoed gaat eerst op.
          </p>
        </details>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-foreground-muted">Nog op te nemen</div>
          <div className={`text-3xl font-semibold tabular-nums ${balance.available < 0 ? "text-bad-text" : ""}`}>
            {fmtHours(balance.available)} <span className="text-base font-normal text-foreground-muted">uur</span>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-foreground-muted">Opgenomen</dt>
            <dd className="tabular-nums">{fmtHours(balance.takenPast)} uur</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Ingepland t/m {dayMonthYear(balance.forecastISO)}</dt>
            <dd className="tabular-nums">{fmtHours(balance.plannedFuture)} uur</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Verwacht over op 31 december {thisYear}</dt>
            <dd className={`font-semibold tabular-nums ${balance.forecastYearEnd < 0 ? "text-bad-text" : ""}`}>{fmtHours(balance.forecastYearEnd)} uur</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Verwacht over op {dayMonthYear(balance.forecastISO)}</dt>
            <dd className={`font-semibold tabular-nums ${balance.forecast < 0 ? "text-bad-text" : ""}`}>{fmtHours(balance.forecast)} uur</dd>
          </div>
        </dl>
      </div>

      {balance.available < 0 && <p className="text-sm text-bad-text">Er is meer verlof opgenomen dan er tegoed was.</p>}
      {balance.available >= 0 && (balance.forecastYearEnd < 0 || balance.forecast < 0) && (
        <p className="text-sm text-bad-text">Met het ingeplande verlof komt het saldo onder nul.</p>
      )}
      {balance.expiring && (
        <p className={`text-sm ${soon ? "text-amber-700 dark:text-amber-300" : "text-foreground-muted"}`}>
          Van het tegoed dat vervalt na {dayBefore(balance.expiring.dateISO)} is nu nog {fmtHours(balance.expiring.hours)} uur over.
          {balance.expiring.forecastHours > 0
            ? ` Met het ingeplande verlof tot en met die dag vervalt naar verwachting ${fmtHours(balance.expiring.forecastHours)} uur.`
            : " Met het ingeplande verlof tot en met die dag is dat tegoed op."}
        </p>
      )}
      {(balance.weeklyHours ?? 0) <= 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          De standaard uren per week zijn nog niet ingevuld, dus er kan geen opgenomen verlof worden berekend.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="py-1.5 pr-4">Tegoed</th>
              <th className="py-1.5 pr-4 text-right">Uren</th>
              <th className="py-1.5 pr-4">Gebruikt in het jaar zelf</th>
              <th className="py-1.5 pr-4">Meegenomen naar het jaar erna (t/m 30 juni)</th>
              <th className="py-1.5 pr-4 text-right">Nu over</th>
              <th className="py-1.5 pr-4 text-right">Verwacht over op 30 juni</th>
              <th className="py-1.5">Geldig</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((b) => (
              <tr key={b.year} className="border-b border-border align-top last:border-0">
                <td className="py-1.5 pr-4 font-medium">{b.year}</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {fmtHours(b.hours + (b.adjustment ?? 0))}
                  {!!b.adjustment && (
                    <div className="text-xs text-foreground-muted">
                      {fmtHours(b.hours)} {b.adjustment > 0 ? "+" : "−"} {fmtHours(Math.abs(b.adjustment))} correctie
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-4">
                  <div className="text-xs text-foreground-muted">in {b.year}</div>
                  <UsageCell bucket={b} year={b.year} />
                </td>
                <td className="py-1.5 pr-4">
                  <div className="text-xs text-foreground-muted">in {b.year + 1}</div>
                  <UsageCell bucket={b} year={b.year + 1} />
                </td>
                <td className={`py-1.5 pr-4 text-right tabular-nums ${b.remaining < 0 ? "text-bad-text" : ""}`}>
                  {b.expired && b.lost > 0 ? <span className="text-foreground-muted line-through">{fmtHours(b.lost)}</span> : fmtHours(b.remaining)}
                </td>
                <td className={`py-1.5 pr-4 text-right tabular-nums ${b.forecastRemaining < 0 ? "text-bad-text" : ""}`}>
                  {b.expired ? (
                    <span className="text-foreground-muted">–</span>
                  ) : (
                    <>
                      {fmtHours(b.forecastRemaining)}
                      {b.forecastRemaining > 0 && <div className="text-xs text-foreground-muted">vervalt daarna</div>}
                    </>
                  )}
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
        Verlofuren van een jaar gelden van 1 januari tot en met 30 juni van het jaar erna: wat je in dat jaar niet opneemt, neem je mee
        naar de eerste helft van het volgende jaar. Opgenomen verlof per week is de standaard uren per week
        {balance.weeklyHours ? ` (${fmtHours(balance.weeklyHours)} uur)` : ""} min de uren die je die week hebt gewerkt; voor weken die nog
        komen de uren uit het rooster. Het gaat eerst van het oudste tegoed af.
      </p>
    </div>
  );
}
