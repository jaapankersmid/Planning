import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 leest configuratie (schema-locatie, database-URL, seed-commando)
// uit dit bestand i.p.v. uit package.json of schema.prisma. Zie
// prisma/schema.prisma voor het datamodel en prisma/seed.ts voor het inladen
// van de echte Planning V2.0-gegevens.
//
// Bewust process.env.DATABASE_URL en niet de env()-helper: tijdens
// `prisma generate` (bv. bij het bouwen van de Docker-image) bestaat de
// variabele nog niet, en env() zou dan een fout geven.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
