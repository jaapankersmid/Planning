import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { NavLinks } from "@/components/nav-links";
import { WidthBox } from "@/components/width-box";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || !session.user.active) {
    redirect("/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/wachtwoord-wijzigen");
  }

  if (session.user.role === "EMPLOYEE" && !session.user.employeeId) {
    redirect("/onboarding");
  }

  // Planners zien in het menu hoeveel verlofaanvragen op een beoordeling wachten.
  const pendingLeave =
    session.user.role === "ADMIN"
      ? await prisma.leaveRequest.count({ where: { status: "PENDING" } })
      : 0;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <WidthBox className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="order-1 flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">Bréborgh</span>
            {(session.user.role === "ADMIN" || session.user.role === "ACCOUNTING") && (
              <div className="flex overflow-hidden rounded-md border border-border text-xs font-medium">
                <a href="/naar-hub" className="px-2.5 py-1 text-foreground-muted hover:bg-surface-muted">Crematorium</a>
                <span className="bg-accent-soft px-2.5 py-1 text-accent">Rooster</span>
              </div>
            )}
          </div>
          <div className="order-2 ml-auto flex items-center gap-3 text-sm text-foreground-muted sm:order-3">
            <span className="max-w-[45vw] truncate">
              {session.user.name}
              {session.user.role === "ADMIN" ? " · planner" : session.user.role === "ACCOUNTING" ? " · administratie" : ""}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-muted">
                Uitloggen
              </button>
            </form>
          </div>
          <NavLinks
            role={session.user.role}
            pendingLeave={pendingLeave}
            className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1"
          />
        </WidthBox>
      </header>
      <main className="flex-1">
        <WidthBox className="px-4 py-6 sm:px-6">{children}</WidthBox>
      </main>
    </div>
  );
}
