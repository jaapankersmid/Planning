import Link from "next/link";
import { addMonths, monthName } from "@/lib/format";

/** Vorige / huidige / volgende maand voor pagina's met ?year=&month= in de URL. */
export function MonthNav({ basePath, year, month, extra = "" }: { basePath: string; year: number; month: number; extra?: string }) {
  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);
  const link = "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${basePath}?year=${prev.year}&month=${prev.month}${extra}`} className={link}>
        ← vorige
      </Link>
      <span className="min-w-36 text-center text-sm font-medium">
        {monthName(month)} {year}
      </span>
      <Link href={`${basePath}${extra ? `?${extra.slice(1)}` : ""}`} className={link}>
        deze maand
      </Link>
      <Link href={`${basePath}?year=${next.year}&month=${next.month}${extra}`} className={link}>
        volgende →
      </Link>
    </div>
  );
}
