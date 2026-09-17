import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import seed from "../src/data/seed.json";

const prisma = new PrismaClient();

/**
 * Zet de app in één keer vol met echte gegevens uit Planning V2.0.xlsx:
 * de medewerkerslijst, de 16 shiftcodes met hun tijden/kleuren, en het
 * volledige rooster van september 2026 zoals dat al was ingevuld. Zo start
 * je meteen met een herkenbaar, werkend rooster in plaats van een lege app.
 *
 * Draaien met: npx prisma db seed  (of automatisch na `prisma migrate dev`)
 */
async function main() {
  console.log(`Diensttypen aanmaken (${seed.shiftTypes.length})...`);
  for (const s of seed.shiftTypes) {
    await prisma.shiftType.upsert({
      where: { code: s.code },
      update: {
        label: s.label,
        color: s.color,
        startTime: s.startTime,
        endTime: s.endTime,
        secondStartTime: s.secondStartTime,
        secondEndTime: s.secondEndTime,
        countsMorningWalk: s.countsMorningWalk,
        countsEveningWalk: s.countsEveningWalk,
      },
      create: {
        code: s.code,
        label: s.label,
        color: s.color,
        startTime: s.startTime,
        endTime: s.endTime,
        secondStartTime: s.secondStartTime,
        secondEndTime: s.secondEndTime,
        countsMorningWalk: s.countsMorningWalk,
        countsEveningWalk: s.countsEveningWalk,
      },
    });
  }

  console.log(`Medewerkers aanmaken (${seed.employees.length})...`);
  for (const e of seed.employees) {
    await prisma.employee.upsert({
      where: { externalId: e.externalId },
      update: {
        name: e.name,
        colorGroup: e.colorGroup,
        active: e.active,
        experience: e.experience ?? undefined,
      },
      create: {
        externalId: e.externalId,
        name: e.name,
        colorGroup: e.colorGroup,
        active: e.active,
        experience: e.experience ?? undefined,
      },
    });
  }

  const employeesByExternalId = new Map(
    (await prisma.employee.findMany()).map((e) => [e.externalId, e.id]),
  );
  const shiftTypesByCode = new Map(
    (await prisma.shiftType.findMany()).map((s) => [s.code, s.id]),
  );

  console.log(`Rooster september 2026 inladen (${seed.assignments.length} diensten)...`);
  let created = 0;
  for (const a of seed.assignments) {
    const employeeId = employeesByExternalId.get(a.employeeExternalId);
    const shiftTypeId = shiftTypesByCode.get(a.code);
    if (!employeeId || !shiftTypeId) continue;

    await prisma.shiftAssignment.upsert({
      where: {
        employeeId_date_shiftTypeId: {
          employeeId,
          date: new Date(a.date),
          shiftTypeId,
        },
      },
      update: {},
      create: {
        employeeId,
        date: new Date(a.date),
        shiftTypeId,
      },
    });
    created += 1;
  }

  console.log(`Klaar. ${created} dienst-toewijzingen verwerkt.`);

  // Eerste beheerder aanmaken/bijwerken, zodat er iemand kan inloggen om
  // daarna de rest van de accounts aan te maken. Alleen als de drie
  // omgevingsvariabelen gezet zijn — anders wordt deze stap overgeslagen
  // (handig als je alleen opnieuw de rooster-data wilt inladen).
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME ?? "Beheerder";

  if (adminEmail && adminPassword) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {}, // bestaat al -> wachtwoord niet overschrijven bij een herhaalde seed
      create: {
        email: adminEmail,
        name: adminName,
        role: "ADMIN",
        passwordHash: hashPassword(adminPassword),
        mustChangePassword: true,
      },
    });
    console.log(`Eerste beheerder klaar: ${adminEmail} (log in en wijzig het wachtwoord).`);
  } else {
    console.log(
      "Geen ADMIN_EMAIL/ADMIN_PASSWORD gezet — geen beheerdersaccount aangemaakt. " +
        "Zie README.md om er handmatig één aan te maken.",
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
