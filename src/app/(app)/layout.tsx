import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
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

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-surface">
        <WidthBox className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-tight">
              Rooster
            </span>
            <NavLinks isAdmin={session.user.role === "ADMIN"} />
          </div>
          <div className="flex items-center gap-3 text-sm text-foreground-muted">
            <span>
              {session.user.name}
              {session.user.role === "ADMIN" ? " · planner" : ""}
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
        </WidthBox>
      </header>
      <main className="flex-1">
        <WidthBox className="px-4 py-6 sm:px-6">{children}</WidthBox>
      </main>
    </div>
  );
}
