import { dateFromISO, formatDayMonth } from "@/lib/format";
import { expiryISO, fmtHours, type Balance } from "@/lib/leave-balance";
import { balanceView, type BalanceView, type BucketView } from "@/lib/leave-view";
import { InfoTip } from "@/components/info-tip";

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
const neg = (n: number) => (n < 0 ? "text-bad-text" : "");

/** "12 van 20 uur (4 opgenomen + 8 ingepland)". */
function NextYearUse({ next }: { next: NonNullable<BucketView["nextYear"]> }) {
  const used = next.taken + next.planned;
  return (
    <>
      <span className="font-medium tabular-nums">
        {fmtHours(used)} van {fmtHours(next.of)}
      </span>
      {used > 0 && (
        <div className="text-xs text-foreground-muted">
          {next.taken > 0 && `${fmtHours(next.taken)} opgenomen`}
          {next.taken > 0 && next.planned > 0 && " + "}
          {next.planned > 0 && `${fmtHours(next.planned)} ingepland`}
        </div>
      )}
    </>
  );
}

/** Meldingen onder de kerncijfers: tekort, wat vervalt, ontbrekende uren per week. */
function Notes({ balance, view, todayISO, small }: { balance: Balance & { weeklyHours?: number | null }; view: BalanceView; todayISO: string; small?: boolean }) {
  const size = small ? "text-xs" : "text-sm";
  const soon = view.expires && dateFromISO(view.expires.dateISO).getTime() - dateFromISO(todayISO).getTime() < 120 * 86400000;
  const short = balance.available < 0 || view.yearEnd < 0 || balance.forecast < 0;
  return (
    <>
      {balance.available < 0 ? (
        <p className={`${size} text-bad-text`}>Er is meer verlof opgenomen dan er tegoed was.</p>
      ) : (
        short && (
          <p className={`${size} text-bad-text`}>
            Met het ingeplande verlof komt het saldo onder nul
            {view.yearEnd < 0 ? ` (${fmtHours(view.yearEnd)} uur eind ${view.year})` : ""}.
            {view.nextBucket && view.yearEnd < 0 && (
              <span className="text-foreground-muted">
                {" "}
                Het tegoed van {view.nextBucket.year} ({fmtHours(view.nextBucket.total)} uur) geldt vanaf 1 januari {view.nextBucket.year}.
              </span>
            )}
          </p>
        )
      )}
      {view.expires && (
        <p className={`${size} ${soon ? "text-amber-700 dark:text-amber-300" : "text-foreground-muted"}`}>
          {fmtHours(view.expires.hours)} uur vervalt na {dayBefore(view.expires.dateISO)} als dat niet wordt opgenomen.
        </p>
      )}
      {(balance.weeklyHours ?? 0) <= 0 && (
        <p className={`${size} text-amber-700 dark:text-amber-300`}>
          De standaard uren per week zijn nog niet ingevuld, dus er kan geen opgenomen verlof worden berekend.
        </p>
      )}
    </>
  );
}

/** Tweede kerncijfer naast "31 december": gebruik in het volgende jaar, of dat het tegoed al op is. */
function NextYearBlock({ view, cls, valueCls }: { view: BalanceView; cls: string; valueCls: string }) {
  if (view.nextYear) {
    const used = view.nextYear.taken + view.nextYear.planned;
    return (
      <div className={cls}>
        <dt className="text-xs text-foreground-muted">Gebruikt in {view.nextYear.year}</dt>
        <dd className={`${valueCls} tabular-nums`}>
          {fmtHours(used)} van {fmtHours(view.nextYear.of)} uur
        </dd>
      </div>
    );
  }
  if (view.usedUpThisYear) {
    return (
      <div className={cls}>
        <dt className="text-xs text-foreground-muted">Tegoed {view.year}</dt>
        <dd className={`${valueCls} text-foreground-muted`}>op in {view.year}</dd>
      </div>
    );
  }
  return null;
}

/** Regels onder de kerncijfers: volgend jaar (tegoed, ingepland, over) en bijgeschreven overwerk. */
function ExtraLines({ view, small, weeksHref }: { view: BalanceView; small?: boolean; weeksHref?: string }) {
  const size = small ? "text-xs" : "text-sm";
  const line = view.nextYearLine;
  if (!line && view.overtimeThisYear <= 0 && view.overtimePending <= 0 && view.overtimePlanned <= 0) return null;
  return (
    <div className={`flex flex-col gap-0.5 ${size}`}>
      {line && (
        <p className="tabular-nums">
          {line.total !== null ? (
            <>
              <span className="font-medium">{line.year}</span> <span className="text-foreground-muted">(vanaf 1 januari)</span>: {fmtHours(line.total)} uur
              {" · "}
              {fmtHours(line.planned)} uur ingepland
              {line.left !== null && (
                <>
                  {" · "}
                  <span className={neg(line.left)}>{fmtHours(line.left)} uur verwacht over</span>
                </>
              )}
            </>
          ) : (
            <>
              Ingepland in {line.year}: {fmtHours(line.planned)} uur
            </>
          )}
          {weeksHref && line.planned > 0 && (
            <a href={weeksHref} className="ml-1.5 text-xs text-foreground-muted underline hover:no-underline">
              per week
            </a>
          )}
        </p>
      )}
      {view.overtimeThisYear > 0 && (
        <p className="tabular-nums text-good-text">Bijgeschreven overwerk {view.year}: +{fmtHours(view.overtimeThisYear)} uur</p>
      )}
      {view.overtimePlanned > 0 && (
        <p className="tabular-nums text-foreground-muted">
          Ingepland overwerk {view.year}: +{fmtHours(view.overtimePlanned)} uur (telt mee in de verwachting, in het saldo pas na goedkeuring van de uren)
        </p>
      )}
      {view.overtimePending > 0 && (
        <p className="tabular-nums text-foreground-muted">
          Overwerk {view.year} dat nog wacht op goedkeuring van de uren: {fmtHours(view.overtimePending)} uur
        </p>
      )}
    </div>
  );
}

/** Overzicht van verlofuren: wat er nog is, wat er is opgenomen en ingepland, en wat wanneer vervalt. Voor medewerker en administratie. */
export function LeaveBalanceCard({
  balance,
  todayISO,
  compact = false,
  weeksHref,
}: {
  balance: Balance & { weeklyHours?: number | null };
  todayISO: string;
  /** Link naar de lijst per week (Mijn verlof). */
  weeksHref?: string;
  /** Mijn verlof: alleen de kern, de tabel per jaar en de uitleg ingeklapt. */
  compact?: boolean;
}) {
  if (balance.buckets.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5 text-sm text-foreground-muted">
        De administratie heeft nog geen verlofuren ingevuld.
      </div>
    );
  }

  const view = balanceView(balance, todayISO);
  const visible = view.buckets.filter((v) => !(v.bucket.expired && v.bucket.remaining === 0 && v.bucket.used === 0));

  if (compact) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className={`text-2xl font-semibold tabular-nums ${neg(balance.available)}`}>
            {fmtHours(balance.available)} <span className="text-sm font-normal text-foreground-muted">uur over</span>
          </div>
          <div className="text-xs text-foreground-muted tabular-nums">
            {fmtHours(balance.takenPast)} opgenomen · {fmtHours(balance.plannedFuture)} ingepland
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-surface-muted px-2 py-1.5">
            <dt className="text-foreground-muted">Verwacht 31 dec</dt>
            <dd className={`text-sm font-semibold tabular-nums ${neg(view.yearEnd)}`}>{fmtHours(view.yearEnd)} uur</dd>
          </div>
          <NextYearBlock view={view} cls="rounded-md bg-surface-muted px-2 py-1.5" valueCls="text-sm font-semibold" />
        </dl>
        <ExtraLines view={view} small weeksHref={weeksHref} />
        <Notes balance={balance} view={view} todayISO={todayISO} small />
        <details className="text-xs">
          <summary className="cursor-pointer text-foreground-muted">Per jaar{balance.adjustments.length > 0 ? " en correcties" : ""}</summary>
          <table className="mt-2 w-full">
            <thead>
              <tr className="text-left text-foreground-muted">
                <th className="py-1 pr-2 font-normal">Tegoed</th>
                <th className="py-1 pr-2 text-right font-normal">Uren</th>
                <th className="py-1 pr-2 text-right font-normal">31 dec</th>
                <th className="py-1 pr-2 font-normal">Jaar erna</th>
                <th className="py-1 font-normal">Geldig</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((v) => (
                <tr key={v.bucket.year} className="border-t border-border align-top">
                  <td className="py-1 pr-2 font-medium">{v.bucket.year}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {fmtHours(v.total)}
                    {!!v.bucket.overtime && <div className="text-good-text">+{fmtHours(v.bucket.overtime)} overwerk</div>}
                  </td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${neg(v.endOfYear ?? 0)}`}>{v.endOfYear === null ? "–" : fmtHours(v.endOfYear)}</td>
                  <td className="py-1 pr-2">
                    {v.nextYear ? (
                      <>
                        {fmtHours(v.nextYear.taken + v.nextYear.planned)} van {fmtHours(v.nextYear.of)} in {v.nextYear.year}
                        {v.expires > 0 && <div className="text-amber-700 dark:text-amber-300">{fmtHours(v.expires)} {v.bucket.expired ? "vervallen" : "vervalt"}</div>}
                      </>
                    ) : v.usedUp ? (
                      <span className="text-foreground-muted">op in {v.bucket.year}</span>
                    ) : (
                      "–"
                    )}
                  </td>
                  <td className="py-1 text-foreground-muted">
                    {v.bucket.future ? `vanaf 1 jan ${v.bucket.year}` : v.bucket.expired ? "verlopen" : `t/m ${lastDay(v.bucket.year)}`}
                  </td>
                </tr>
              ))}
              {balance.adjustments.map((a) => (
                <tr key={a.id} className="border-t border-border align-top text-foreground-muted">
                  <td className="py-1 pr-2" colSpan={2}>Correctie {dayMonthYear(a.dateISO)}</td>
                  <td className={`py-1 pr-2 text-right tabular-nums ${a.hours < 0 ? "text-bad-text" : ""}`}>
                    {a.hours > 0 ? "+" : "−"}{fmtHours(Math.abs(a.hours))}
                  </td>
                  <td className="py-1" colSpan={2}>{a.reason}</td>
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
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">
            Nog op te nemen
            <InfoTip label="Hoe werkt het verlofsaldo?">
              Verlofuren van een jaar gelden t/m 30 juni van het jaar erna. Verlof per week = het contract van die week min de gewerkte
              uren; voor weken die nog komen de uren uit het rooster. Het oudste tegoed gaat eerst op. Is een tegoed eind december al
              op, dan vervalt er op 30 juni ook niets meer.
            </InfoTip>
          </div>
          <div className={`text-3xl font-semibold tabular-nums ${neg(balance.available)}`}>
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
            <dt className="text-xs text-foreground-muted">Verwacht over op 31 december {view.year}</dt>
            <dd className={`font-semibold tabular-nums ${neg(view.yearEnd)}`}>{fmtHours(view.yearEnd)} uur</dd>
          </div>
          <NextYearBlock view={view} cls="" valueCls="font-semibold" />
        </dl>
      </div>

      <ExtraLines view={view} />
      <Notes balance={balance} view={view} todayISO={todayISO} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="py-1.5 pr-4">Tegoed</th>
              <th className="py-1.5 pr-4 text-right">Uren</th>
              <th className="py-1.5 pr-4">Gebruikt in het jaar zelf</th>
              <th className="py-1.5 pr-4 text-right">Over op 31 december</th>
              <th className="py-1.5 pr-4">Gebruikt in het jaar erna (t/m 30 juni)</th>
              <th className="py-1.5 pr-4 text-right">Nu over</th>
              <th className="py-1.5">Geldig</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((v) => {
              const b = v.bucket;
              const ownUsed = v.inYear.taken + v.inYear.planned;
              return (
                <tr key={b.year} className="border-b border-border align-top last:border-0">
                  <td className="py-1.5 pr-4 font-medium">{b.year}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {fmtHours(v.total)}
                    {(!!b.adjustment || !!b.overtime) && (
                      <div className="text-xs text-foreground-muted">
                        {fmtHours(b.hours)}
                        {!!b.adjustment && ` ${b.adjustment > 0 ? "+" : "−"} ${fmtHours(Math.abs(b.adjustment))} correctie`}
                        {!!b.overtime && ` + ${fmtHours(b.overtime)} overwerk`}
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 pr-4">
                    {ownUsed === 0 ? (
                      <span className="text-foreground-muted">–</span>
                    ) : (
                      <>
                        <span className="font-medium tabular-nums">{fmtHours(ownUsed)}</span>
                        <div className="text-xs text-foreground-muted">
                          {v.inYear.taken > 0 && `${fmtHours(v.inYear.taken)} opgenomen`}
                          {v.inYear.taken > 0 && v.inYear.planned > 0 && " + "}
                          {v.inYear.planned > 0 && `${fmtHours(v.inYear.planned)} ingepland`}
                        </div>
                      </>
                    )}
                  </td>
                  <td className={`py-1.5 pr-4 text-right tabular-nums ${neg(v.endOfYear ?? 0)}`}>
                    {v.endOfYear === null ? <span className="text-foreground-muted">–</span> : fmtHours(v.endOfYear)}
                    {v.usedUp && <div className="text-xs text-foreground-muted">op in {b.year}</div>}
                  </td>
                  <td className="py-1.5 pr-4">
                    {v.nextYear ? (
                      <>
                        <div className="text-xs text-foreground-muted">in {v.nextYear.year}</div>
                        <NextYearUse next={v.nextYear} />
                        {v.expires > 0 && (
                          <div className="text-xs text-amber-700 dark:text-amber-300">
                            {fmtHours(v.expires)} uur {b.expired ? "vervallen" : `vervalt na ${lastDay(b.year)}`}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-foreground-muted">–</span>
                    )}
                  </td>
                  <td className={`py-1.5 pr-4 text-right tabular-nums ${neg(b.remaining)}`}>
                    {b.expired && b.lost > 0 ? <span className="text-foreground-muted line-through">{fmtHours(b.lost)}</span> : fmtHours(b.remaining)}
                  </td>
                  <td className="py-1.5 text-foreground-muted">
                    {b.future ? `vanaf 1 januari ${b.year}` : b.expired ? `verlopen op ${lastDay(b.year)}` : `t/m ${lastDay(b.year)}`}
                    {b.countFromISO && <div className="text-xs">stand per {dayMonthYear(b.countFromISO)}</div>}
                    {b.note && <div className="text-xs">{b.note}</div>}
                  </td>
                </tr>
              );
            })}
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
    </div>
  );
}
