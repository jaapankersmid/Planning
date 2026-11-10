import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { colorGroupSwatch } from "@/lib/format";
import { ensureColorGroups, sortEmployees } from "@/lib/schedule";
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
  const entryByKey = new Map(entries.map((e) => [`${e.employeeId}_${e.weekday}`, e.shiftTypeId]));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Vast rooster</h1>
        <p className="max-w-2xl text-sm text-foreground-muted">
          Het weekrooster dat elke week hetzelfde terugkomt. Een wijziging hier wordt
          automatisch doorgevoerd in het rooster vanaf vandaag. Dagen die al geweest zijn
          en dagen die je handmatig in het rooster hebt ingesteld blijven ongemoeid.
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
            {employees.map((employee) => (
              <tr key={employee.id} className="border-b border-border last:border-0">
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
