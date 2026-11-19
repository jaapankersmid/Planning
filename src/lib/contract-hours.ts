import { prisma } from "@/lib/prisma";
import { toISODate } from "@/lib/format";
import { currentContract, type ContractRule } from "@/lib/contract-rules";

export { BEGIN_ISO, contractOn, currentContract, mondayOfISO, sickDayHours, type ContractRule } from "@/lib/contract-rules";

/** Contractregels per medewerker, oplopend op ingangsdatum. */
export async function loadContractRules(employeeIds?: string[]): Promise<Map<string, ContractRule[]>> {
  const rows = await prisma.contractHours.findMany({
    where: employeeIds ? { employeeId: { in: employeeIds } } : {},
    orderBy: { validFrom: "asc" },
    select: { employeeId: true, validFrom: true, hours: true },
  });
  const map = new Map<string, ContractRule[]>();
  for (const r of rows) {
    const list = map.get(r.employeeId) ?? [];
    list.push({ fromISO: toISODate(r.validFrom), hours: r.hours });
    map.set(r.employeeId, list);
  }
  return map;
}

/** Zet Employee.weeklyHours gelijk aan het contract dat vandaag geldt (na een wijziging van de periodes). */
export async function syncWeeklyHours(employeeId: string, todayISO: string) {
  const rules = (await loadContractRules([employeeId])).get(employeeId) ?? [];
  if (rules.length === 0) return;
  const { hours } = currentContract(rules, todayISO, null);
  await prisma.employee.update({ where: { id: employeeId }, data: { weeklyHours: hours } });
}
