import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAutoPlan } from "@/lib/auto-plan-guard";
import { addDays, dateFromISO, isoWeek, startOfWeek, toISODate, weekdayShort } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";
import { copyPreviousWeek, saveNeeds } from "../actions";
import { PlanSubnav } from "@/components/plan-subnav";
import { InfoTip } from "@/components/info-tip";

export const dynamic = "force-dynamic";

export default async function PlanNeedsPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  await requireAutoPlan();
  const { start } = await searchParams;
  const monday = startOfWeek(/^\d{4}-\d{2}-\d{2}$/.test(start ?? "") ? dateFromISO(start!) : todayAmsterdam());
  const startISO = toISODate(monday);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const [tags, needs] = await Promise.all([
    prisma.planTag.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.planNeed.findMany({ where: { date: { gte: monday, lt: addDays(monday, 7) } } }),
  ]);
  const value = (tagId: string, part: string, iso: string) => needs.find((n) => n.tagId === tagId && n.part === part && toISODate(n.date) === iso)?.count;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Planvoorstel</h1>
      </div>
      <PlanSubnav current="behoefte" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          Hoeveel mensen zijn er nodig? <span className="font-normal text-foreground-muted">week {isoWeek(monday)}</span>
          <InfoTip>Leeg of 0 betekent: niemand nodig.</InfoTip>
        </h2>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/planvoorstel/behoefte?start=${toISODate(addDays(monday, -7))}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">← vorige week</Link>
          <Link href="/planvoorstel/behoefte" className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">deze week</Link>
          <Link href={`/planvoorstel/behoefte?start=${toISODate(addDays(monday, 7))}`} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-muted">volgende week →</Link>
        </div>
      </div>
      {tags.length === 0 ? (
        <p className="text-sm text-foreground-muted">Maak eerst tags aan bij Tags en kleurgroepen.</p>
      ) : (
        <form action={saveNeeds} className="flex flex-col gap-3">
          <input type="hidden" name="start" value={startISO} />
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-xs text-foreground-muted">
                  <th className="px-3 py-2 text-left font-medium">Tag</th>
                  {days.map((d) => (
                    <th key={toISODate(d)} className="px-2 py-2 text-center font-medium">{weekdayShort(d)} {d.getUTCDate()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tags.flatMap((t) =>
                  (["MORNING", "AFTERNOON"] as const).map((part) => (
                    <tr key={`${t.id}${part}`} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-1.5 font-medium">{t.name} <span className="font-normal text-foreground-muted">{part === "MORNING" ? "ochtend" : "middag"}</span></td>
                      {days.map((d) => {
                        const iso = toISODate(d);
                        return (
                          <td key={iso} className="px-1 py-1 text-center">
                            <input type="number" min={0} max={50} name={`n_${t.id}_${part}_${iso}`} defaultValue={value(t.id, part, iso) ?? ""} className="w-14 rounded-md border border-border bg-surface px-2 py-1 text-center" />
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Opslaan</button>
            <button formAction={copyPreviousWeek} formNoValidate className="rounded-md border border-border px-3 py-2 text-sm hover:bg-surface-muted" title="Alleen als deze week nog leeg is">Overnemen van vorige week</button>
          </div>
        </form>
      )}
    </div>
  );
}
