import { Fragment } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { colorGroupSwatch } from "@/lib/format";
import { ensureColorGroups, sortEmployees } from "@/lib/schedule";
import { setColorGroupTemplate } from "@/app/(app)/medewerkers/actions";
import { TemplateCell } from "@/components/template-cell";

const WEEKDAYS = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

export default async function VastRoosterPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const groups = await ensureColorGroups();
  const [employeesRaw, shiftTypes, entries] = await Promise.all([
    prisma.employee.findMany({ where: { active: true } }),
    prisma.shiftType.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.weeklyScheduleEntry.findMany(),
  ]);
  const employees = sortEmployees(employeesRaw, groups);
  const groupByName = new Map(groups.map((g) => [g.name, g]));
  const entryByKey = new Map(entries.map((e) => [`${e.employeeId}_${e.weekday}`, e.shiftTypeId]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Vast rooster</h1>
        <p className="max-w-2xl text-sm text-foreground-muted">
          Het weekrooster dat elke week hetzelfde terugkomt. Een wijziging hier wordt
          automatisch doorgevoerd in het rooster vanaf vandaag. Dagen die al geweest zijn
          en dagen die je handmatig in het rooster hebt ingesteld blijven ongemoeid.
          Per kleurgroep bepaal je met de knop bij de groepsnaam of het vaste rooster voor
          die groep geldt.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b border-r border-border bg-surface-muted px-3 py-2 text-left font-medium">
                Medewerker
              </th>
              {WEEKDAYS.map((d) => (
                <th key={d} className="border-b border-border px-1 py-2 text-center text-xs font-medium text-foreground-muted">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee, index) => {
              const showGroupHeader =
                index === 0 || employees[index - 1].colorGroup !== employee.colorGroup;
              const group = employee.colorGroup ? groupByName.get(employee.colorGroup) : undefined;
              return (
              <Fragment key={employee.id}>
              {showGroupHeader && (
                <tr className="border-b border-border bg-surface-muted/60">
                  <td colSpan={8} className="px-3 py-1.5">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            background: employee.colorGroup
                              ? (colorGroupSwatch[employee.colorGroup] ?? "#9aa39a")
                              : "#9aa39a",
                          }}
                        />
                        {employee.colorGroup ?? "Zonder kleurgroep"}
                      </span>
                      {group && (
                        <form action={setColorGroupTemplate.bind(null, group.id, group.usesTemplate !== true)}>
                          <button
                            className={`rounded-full px-2 py-0.5 font-medium ${
                              group.usesTemplate === true
                                ? "bg-accent-soft text-accent"
                                : "bg-surface text-foreground-muted ring-1 ring-border"
                            }`}
                            title="Klik om te wisselen"
                          >
                            {group.usesTemplate === true ? "vast rooster aan" : "vast rooster uit"}
                          </button>
                        </form>
                      )}
                      {group && group.usesTemplate !== true && (
                        <span className="text-foreground-muted">
                          Het vaste rooster geldt niet voor deze groep: wat je hieronder invult wordt pas
                          doorgevoerd als je de groep aanzet.
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              <tr className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-surface px-3 py-1.5 font-medium">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{
                      background: employee.colorGroup
                        ? (colorGroupSwatch[employee.colorGroup] ?? "#9aa39a")
                        : "#9aa39a",
                    }}
                  />
                  {employee.name}
                </td>
                {WEEKDAYS.map((_, i) => {
                  const weekday = i + 1;
                  const shiftTypeId = entryByKey.get(`${employee.id}_${weekday}`) ?? null;
                  return (
                    <td key={weekday} className={`p-0.5 ${weekday >= 6 ? "bg-surface-muted/60" : ""}`}>
                      <TemplateCell
                        key={`${employee.id}_${weekday}_${shiftTypeId}`}
                        employeeId={employee.id}
                        weekday={weekday}
                        initialShiftTypeId={shiftTypeId}
                        shiftTypes={shiftTypes}
                      />
                    </td>
                  );
                })}
              </tr>
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
