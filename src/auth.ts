import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

// Inloggen met een zelf aangemaakt account (e-mail + wachtwoord) i.p.v. een
// externe provider zoals Google. Dit vereist de JWT-sessiestrategie — Auth.js
// ondersteunt database-sessies bewust niet voor de Credentials-provider,
// omdat er geen provider is die de gebruiker "aanmaakt" bij het inloggen.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Wachtwoord", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active) return null;

        const valid = verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          active: user.active,
          employeeId: user.employeeId,
          calendarSyncEnabled: user.calendarSyncEnabled,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is alleen gezet vlak na het inloggen. Op elk volgend verzoek
      // lezen we role/employeeId/calendarSyncEnabled opnieuw uit de database,
      // zodat een rolwijziging of nieuwe koppeling niet wacht tot de
      // volgende keer inloggen (JWT-sessies zijn anders "bevroren").
      const userId = user?.id ?? token.id;
      if (typeof userId === "string") {
        const fresh = await prisma.user.findUnique({ where: { id: userId } });
        // Ook bij een inmiddels uitgezet account laten we `active: false` in
        // het token staan — de layout stuurt dan naar /login, in plaats van
        // dat we hier een leeg token proberen terug te geven.
        token.id = fresh?.id ?? userId;
        token.role = fresh?.role ?? token.role;
        token.active = fresh?.active ?? false;
        token.employeeId = fresh?.employeeId ?? null;
        token.calendarSyncEnabled = fresh?.calendarSyncEnabled ?? false;
        token.mustChangePassword = fresh?.mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.active = token.active;
        session.user.employeeId = token.employeeId;
        session.user.calendarSyncEnabled = token.calendarSyncEnabled;
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },
});
