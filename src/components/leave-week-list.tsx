import { dateFromISO, formatDayMonth, weekdayShort } from "@/lib/format";
import { fmtHours, type Balance } from "@/lib/leave-balance";

/** Eén regel in de lijst per week: verlof (opgenomen of ingepland) of overwerk. */
export type WeekRow = {
  dateISO: string;
  label: string;
  detail: string;
  kind: "leave" | "overtime";
  hours: number;
  planned: boolean;
  /** Van welk tegoed het verlof afgaat, of bij welk tegoed het overwerk hoort. */
  from: string;
  status?: "credited" | "pending" | "planned";
};

/**
 * Verlof- en overwerkweken van één medewerker, uit dezelfde berekening als het saldo (balance.days en balance.overtime).
 * Weken voor de peildatum (telt niet mee) blijven weg.
 */
export function weekRows(balance: Balance): WeekRow[] {
  const rows: WeekRow[] = [];
  for (const d of balance.days) {
    if (d.ignored) continue;
    rows.push({
      dateISO: d.dateISO,
      label: d.label ?? "",
      detail: d.detail ?? "",
      kind: "leave",
      hours: d.hours,
      planned: !!d.planned,
      from: d.taken.map((t) => `${t.year}: ${fmtHours(t.hours)}`).join(", "),
    });
  }
  for (const w of balance.overtime ?? []) {
    if (w.status === "ignored") continue;
    rows.push({ dateISO: w.dateISO, label: w.label, detail: w.detail, kind: "overtime", hours: w.hours, planned: w.status === "planned", from: String(w.year), status: w.status });
  }
  return rows;
}

const weekStart = (iso: string) => {
  const d = dateFromISO(iso);
  return `${weekdayShort(d)} ${formatDayMonth(d)} ${d.getUTCFullYear()}`;
};

function Row({ r }: { r: WeekRow }) {
  const overtime = r.kind === "overtime";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 px-3 py-1.5">
      <span className="font-medium">{r.label}</span>
      <span className="text-xs text-foreground-muted">vanaf {weekStart(r.dateISO)}</span>
      <span
        className={`ml-auto font-medium tabular-nums ${overtime ? (r.status === "credited" ? "text-good-text" : "text-foreground-muted") : ""}`}
      >
        {overtime ? `+${fmtHours(r.hours)} u` : `${fmtHours(r.hours)} u`}
      </span>
      <span className="w-full text-xs text-foreground-muted">
        {overtime ? (
          <>
            <span className={r.status === "credited" ? "text-good-text" : ""}>
              {r.status === "planned"
                ? `Ingepland overwerk +${fmtHours(r.hours)} u (voorlopig: telt in de verwachting, pas in je saldo als de uren zijn goedgekeurd)`
                : `Overgewerkt +${fmtHours(r.hours)} u (${r.status === "credited" ? `bijgeschreven bij ${r.from}` : "wacht op goedkeuring van de uren"})`}
            </span>
            {r.detail && ` · ${r.detail}`}
          </>
        ) : (
          <>
            {r.planned ? "ingepland" : "opgenomen"}
            {r.detail && ` · ${r.detail}`}
            {r.from && ` · van ${r.from}`}
          </>
        )}
      </span>
    </li>
  );
}

/** Mijn verlof per week: eerst de komende weken, dan de voorbije van dit jaar (nieuwste boven), eerdere ingeklapt. */
export function LeaveWeekList({ balance, todayISO }: { balance: Balance; todayISO: string }) {
  const rows = weekRows(balance);
  const yearStart = `${todayISO.slice(0, 4)}-01-01`;
  const upcoming = rows.filter((r) => r.planned).sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const past = rows.filter((r) => !r.planned).sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  const thisYear = past.filter((r) => r.dateISO >= yearStart);
  const earlier = past.filter((r) => r.dateISO < yearStart);
  const list = "divide-y divide-border rounded-lg border border-border bg-surface text-sm";

  if (rows.length === 0) {
    return <p className="text-sm text-foreground-muted">Nog geen weken met verlof of overwerk.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-foreground-muted">Komende weken</h3>
          <ul className={list}>
            {upcoming.map((r) => (
              <Row key={`${r.kind}-${r.dateISO}`} r={r} />
            ))}
          </ul>
        </div>
      )}
      {thisYear.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-foreground-muted">Afgelopen weken</h3>
          <ul className={list}>
            {thisYear.map((r) => (
              <Row key={`${r.kind}-${r.dateISO}`} r={r} />
            ))}
          </ul>
        </div>
      )}
      {earlier.length > 0 && (
        <details className="flex flex-col gap-1">
          <summary className="cursor-pointer text-xs text-foreground-muted">Toon eerdere weken ({earlier.length})</summary>
          <ul className={`mt-1 ${list}`}>
            {earlier.map((r) => (
              <Row key={`${r.kind}-${r.dateISO}`} r={r} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
