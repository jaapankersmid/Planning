import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 leest configuratie (schema-locatie, migraties, seed-commando) uit
// dit bestand i.p.v. uit package.json. Zie prisma/schema.prisma voor het
// datamodel en prisma/seed.ts voor het inladen van de echte Planning
// V2.0-gegevens (medewerkers, shiftcodes, september-rooster).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
