import { prisma } from "@/lib/prisma";
import { requireAutoPlan } from "@/lib/auto-plan-guard";
import { ensureColorGroups, sortEmployees } from "@/lib/schedule";
import { addTag, deleteTag, moveTag, saveParticipation, saveTag } from "../actions";
import { PlanSubnav } from "@/components/plan-subnav";
import { sortShiftTypes } from "@/lib/shift-order";

export const dynamic = "force-dynamic";
const input = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export default async function PlanSettingsPage() {
  await requireAutoPlan();
  await ensureColorGroups();
  const [groups, tags, shiftTypesRaw, employeesRaw] = await Promise.all([
    prisma.colorGroup.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.planTag.findMany({ include: { employees: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.shiftType.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.employee.findMany({ where: { active: true } }),
  ]);
  const employees = sortEmployees(employeesRaw, groups);
  const shiftTypes = sortShiftTypes(shiftTypesRaw);
  const typeLabel = (t: (typeof shiftTypes)[number]) => `${t.code} · ${t.label}`;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Planvoorstel</h1>
        <p className="text-sm text-foreground-muted">Alleen voor jou zichtbaar.</p>
      </div>
      <PlanSubnav current="instellingen" />

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Welke kleurgroepen doen mee?</h2>
        <p className="mb-3 text-xs text-foreground-muted">Alleen medewerkers uit de aangevinkte groepen komen in het voorstel. De uren worden per groep eerlijk verdeeld.</p>
        <form action={saveParticipation} className="flex flex-wrap items-center gap-4">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="group" value={g.name} defaultChecked={g.planParticipates} className="h-4 w-4" />
              {g.name}
            </label>
          ))}
          <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Opslaan</button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Tags (taken)</h2>
        <p className="mb-3 text-xs text-foreground-muted">
          Bijvoorbeeld Balie of Uitlaten. Kies per tag welke dienst bij het toepassen in het rooster komt voor alleen de ochtend, alleen de middag en voor ochtend en middag samen. Zonder &quot;samen&quot; krijgt iemand per dag maar één dagdeel met deze tag.
        </p>
        <p className="mb-3 text-xs text-foreground-muted">
          <strong>Prioriteit:</strong> de bovenste tag wordt als eerste gevuld, daarna de volgende, ook als lagere tags daardoor leeg blijven. Verander de volgorde met ▲ en ▼. Nieuwe tags komen onderaan.
        </p>
        <form action={addTag} className="mb-4 flex gap-2">
          <input name="name" required maxLength={40} placeholder="Nieuwe tag, bv. Balie" className={`${input} w-64`} />
          <button className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted">Tag toevoegen</button>
        </form>
        <div className="flex flex-col gap-4">
          {tags.map((t, i) => (
            <form key={t.id} action={saveTag.bind(null, t.id)} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <span className="w-6 text-sm font-semibold tabular-nums text-foreground-muted" title="Prioriteit">{i + 1}.</span>
                  <button formAction={moveTag.bind(null, t.id, "up")} formNoValidate disabled={i === 0} title="Hogere prioriteit" aria-label={`${t.name} hogere prioriteit`} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted disabled:opacity-30">▲</button>
                  <button formAction={moveTag.bind(null, t.id, "down")} formNoValidate disabled={i === tags.length - 1} title="Lagere prioriteit" aria-label={`${t.name} lagere prioriteit`} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted disabled:opacity-30">▼</button>
                </div>
                <input name="name" defaultValue={t.name} required maxLength={40} className={`${input} w-56 font-semibold`} />
                {(["morning", "afternoon", "both"] as const).map((k) => {
                  const current = k === "morning" ? t.morningShiftTypeId : k === "afternoon" ? t.afternoonShiftTypeId : t.bothShiftTypeId;
                  return (
                    <label key={k} className="flex flex-col gap-1 text-xs text-foreground-muted">
                      {k === "morning" ? "Dienst voor ochtend" : k === "afternoon" ? "Dienst voor middag" : "Dienst voor ochtend + middag"}
                      <select name={k} defaultValue={current ?? ""} className={input}>
                        <option value="">{k === "both" ? "Geen (één dagdeel per dag)" : "Kies een dienst"}</option>
                        {shiftTypes.map((s) => <option key={s.id} value={s.id}>{typeLabel(s)}</option>)}
                      </select>
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-xs font-medium text-foreground-muted">Tijden van deze taak (voor het meetellen van bestaande diensten)</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                Ochtend <input type="time" name="morningStart" defaultValue={t.morningStart ?? ""} className={input} /> tot <input type="time" name="morningEnd" defaultValue={t.morningEnd ?? ""} className={input} />
                <span className="ml-3">Middag</span> <input type="time" name="afternoonStart" defaultValue={t.afternoonStart ?? ""} className={input} /> tot <input type="time" name="afternoonEnd" defaultValue={t.afternoonEnd ?? ""} className={input} />
              </div>
              <p className="mt-1 text-xs text-foreground-muted">Bijvoorbeeld uitlaten 08:00-10:00 en 15:30-17:00. Een bestaande dienst die deze tijden helemaal omvat, telt mee voor de behoefte. Leeg = de tijden van de ingestelde dienst.</p>
              <p className="mt-3 text-xs font-medium text-foreground-muted">Wie heeft deze tag?</p>
              <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-3">
                {employees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="employee" value={e.id} defaultChecked={t.employees.some((x) => x.employeeId === e.id)} className="h-4 w-4" />
                    {e.name}
                    {e.colorGroup && <span className="text-xs text-foreground-muted">({e.colorGroup})</span>}
                  </label>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">Opslaan</button>
                <button formAction={deleteTag.bind(null, t.id)} formNoValidate className="rounded-md border border-border px-3 py-2 text-sm text-red-700 hover:bg-surface-muted">Tag verwijderen</button>
              </div>
            </form>
          ))}
          {tags.length === 0 && <p className="text-sm text-foreground-muted">Nog geen tags.</p>}
        </div>
      </section>
    </div>
  );
}
