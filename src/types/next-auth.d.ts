import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

// Breidt de standaard NextAuth-types uit met onze eigen velden, zodat
// `session.user.role` etc. overal typeveilig beschikbaar zijn.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      active: boolean;
      employeeId: string | null;
      calendarSyncEnabled: boolean;
      mustChangePassword: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    active: boolean;
    employeeId: string | null;
    calendarSyncEnabled: boolean;
    mustChangePassword: boolean;
  }
}

// De `jwt`-callback in Auth.js v5 typeert zijn `token`-parameter via het JWT
// dat `@auth/core/jwt` zelf declareert, niet via de re-export op
// "next-auth/jwt" — dus we breiden hem hier rechtstreeks uit. (De
// "next-auth/jwt"-augmentatie hieronder blijft staan voor code die daar wél
// expliciet `import type { JWT } from "next-auth/jwt"` gebruikt.)
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    active: boolean;
    employeeId: string | null;
    calendarSyncEnabled: boolean;
    mustChangePassword: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    active: boolean;
    employeeId: string | null;
    calendarSyncEnabled: boolean;
    mustChangePassword: boolean;
  }
}
