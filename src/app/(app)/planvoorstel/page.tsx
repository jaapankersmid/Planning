import Link from "next/link";
import { requireAutoPlan } from "@/lib/auto-plan-guard";
import { generatePlan, loadPlanInput } from "@/lib/auto-plan";
import { addDays, dateFromISO, isoWeek, startOfWeek, toISODate } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";
import { PlanProposal } from "@/components/plan-proposal";
import { PlanSubnav } from "@/components/plan-subnav";

export const dynamic = "force-dynamic";
const input = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export default async function PlanProposalPage({ searchParams }: { searchParams: Promise<{ start?: string; weken?: string; maak?: string }> }) {
  await requireAutoPlan();
  const sp = await searchParams;
  const monday = startOfWeek(/^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "") ? dateFromISO(sp.start!) : addDays(todayAmsterdam(), 7));
  const weeks = Math.min(4, Math.max(1, Number(sp.weken) || 1));
  const startISO = toISODate(monday);
  const make = sp.maak === "1";
  const loaded = make ? await loadPlanInput(startISO, weeks * 7) : null;
  const plan = loaded ? generatePlan(loaded) : null;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Planvoorstel</h1>
        <p className="text-sm text-foreground-muted">Alleen voor jou zichtbaar. Het voorstel verandert het rooster pas als je het toepast.</p>
      </div>
      <PlanSubnav current="voorstel" />

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Eerste dag (maandag van de week)
          <input type="date" name="start" defaultValue={startISO} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground-muted">
          Aantal weken
          <select name="weken" defaultValue={String(weeks)} className={input}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <input type="hidden" name="maak" value="1" />
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Voorstel maken</button>
        <span className="text-xs text-foreground-muted">week {isoWeek(monday)} t/m {isoWeek(addDays(monday, weeks * 7 - 1))}</span>
      </form>

      {loaded && plan && (
        <>
          {loaded.groups.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">Er is nog geen kleurgroep aangevinkt. Doe dat bij <Link href="/planvoorstel/instellingen" className="underline">Tags en kleurgroepen</Link>.</p>}
          {!loaded.hasTags && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">Er zijn nog geen tags. Maak ze aan bij <Link href="/planvoorstel/instellingen" className="underline">Tags en kleurgroepen</Link>.</p>}
          {loaded.needs.length === 0 && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">Voor deze periode is nog geen behoefte ingevuld. Vul die in bij <Link href={`/planvoorstel/behoefte?start=${startISO}`} className="underline">Behoefte</Link>.</p>}
          <PlanProposal
            key={`${startISO}-${weeks}`}
            items={plan.items}
            gaps={plan.gaps}
            tags={loaded.tags.map((t) => ({ id: t.id, name: t.name }))}
            employees={loaded.employees}
            baseHours={loaded.baseHours}
            hours={plan.hours}
          />
        </>
      )}
    </div>
  );
}
