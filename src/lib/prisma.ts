import { PrismaClient } from "@prisma/client";

// Standaard singleton-patroon voor Prisma in Next.js: in development herlaadt
// Next.js modules bij elke wijziging, wat anders telkens een nieuwe
// PrismaClient (en dus een nieuwe connectiepool) zou aanmaken.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
