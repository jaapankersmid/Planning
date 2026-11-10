import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Standaard singleton-patroon voor Prisma in Next.js: in development herlaadt
// Next.js modules bij elke wijziging, wat anders telkens een nieuwe
// PrismaClient (en dus een nieuwe connectiepool) zou aanmaken.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  // Prisma 7 praat via een driver-adapter met Postgres.
  const adapter = new PrismaPg(process.env.DATABASE_URL ?? "");
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
