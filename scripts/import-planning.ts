import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import data from "../src/data/planning-import.json";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL ?? ""),
});

/**
 * Leest de stand van Planning V2.0 (oktober 2026 t/m maart 2027, het vaste
 * weekrooster, de personeelslijst en de kleurgroep-volgorde) in de database.
 * Veilig om opnieuw te draaien: de maanden in het bestand worden volledig
 * vervangen door de Excel-stand; andere maanden blijven ongemoeid.
 */
async function main() {
  console.log("Kleurgroepen...");
  for (const [sortOrder, name] of data.colorGroups.entries()) {
    await prisma.colorGroup.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder },
    });
  }

  console.log("Diensttypen...");
  for (const s of data.shiftTypes) {
    await prisma.shiftType.upsert({ where: { code: s.code }, update: {}, create: s });
  }
  const shiftTypes = new Map(
    (await prisma.shiftType.findMany()).map((s) => [s.code, s.id]),
  );

  console.log(`Medewerkers (${data.employees.length})...`);
  const employeeIds = new Map<string, string>();
  for (const e of data.employees) {
    const employee = await prisma.employee.upsert({
      where: { externalId: e.externalId },
      update: {
        name: e.name,
        colorGroup: e.colorGroup,
        active: e.active,
        experience: e.experience,
      },
      create: e,
    });
    employeeIds.set(e.externalId, employee.id);
  }

  console.log("Vast weekrooster...");
  await prisma.weeklyScheduleEntry.deleteMany();
  await prisma.weeklyScheduleEntry.createMany({
    data: data.template.map((t) => ({
      employeeId: employeeIds.get(t.externalId)!,
      weekday: t.weekday,
      shiftTypeId: shiftTypes.get(t.code)!,
    })),
  });

  console.log("Rooster per maand...");
  for (const { year, month } of data.months) {
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 1));
    await prisma.shiftAssignment.deleteMany({ where: { date: { gte: from, lt: to } } });
    await prisma.dayOverride.deleteMany({ where: { date: { gte: from, lt: to } } });
  }

  const missing = new Set<string>();
  const rows = data.assignments.flatMap((a) => {
    const shiftTypeId = shiftTypes.get(a.code);
    if (!shiftTypeId) {
      missing.add(a.code);
      return [];
    }
    return [
      {
        employeeId: employeeIds.get(a.externalId)!,
        date: new Date(`${a.date}T00:00:00.000Z`),
        shiftTypeId,
        source: a.source as "MANUAL" | "TEMPLATE",
      },
    ];
  });
  await prisma.shiftAssignment.createMany({ data: rows, skipDuplicates: true });
  await prisma.dayOverride.createMany({
    data: data.overrides.map((o) => ({
      employeeId: employeeIds.get(o.externalId)!,
      date: new Date(`${o.date}T00:00:00.000Z`),
    })),
    skipDuplicates: true,
  });

  console.log(`Klaar: ${rows.length} diensten ingelezen.`);
  if (missing.size) console.warn("Onbekende diensttypen overgeslagen:", [...missing].join(", "));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
