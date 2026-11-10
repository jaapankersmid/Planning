import "dotenv/config";
/**
 * Los script om een account aan te maken zonder een wachtwoord in .env te
 * hoeven zetten — handig voor de eerste beheerder op een productieserver.
 * Draaien met:
 *   npx tsx scripts/create-user.ts --email=jaap@bedrijf.nl --name="Jaap" --role=ADMIN
 * Zonder --password wordt er automatisch een tijdelijk wachtwoord gegenereerd
 * en getoond (en moet er bij de eerste login een nieuwe gekozen worden).
 */
import { PrismaClient, type Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { generateTempPassword, hashPassword } from "../src/lib/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg(process.env.DATABASE_URL ?? ""),
});

function readArg(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main() {
  const email = readArg("email")?.trim().toLowerCase();
  const name = readArg("name") ?? email;
  const role = (readArg("role") ?? "ADMIN") as Role;
  const explicitPassword = readArg("password");

  if (!email) {
    console.error(
      'Gebruik: npx tsx scripts/create-user.ts --email=jaap@bedrijf.nl --name="Jaap" --role=ADMIN',
    );
    process.exit(1);
  }
  if (role !== "ADMIN" && role !== "EMPLOYEE") {
    console.error('--role moet "ADMIN" of "EMPLOYEE" zijn.');
    process.exit(1);
  }

  const password = explicitPassword ?? generateTempPassword();

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      active: true,
    },
    create: {
      email,
      name,
      role,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    },
  });

  console.log(`Account klaar voor ${user.email} (rol: ${user.role}).`);
  if (!explicitPassword) {
    console.log(`Tijdelijk wachtwoord: ${password}`);
  }
  console.log("Bij de eerste keer inloggen wordt om een eigen wachtwoord gevraagd.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
