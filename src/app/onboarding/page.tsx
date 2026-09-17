import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { claimEmployee } from "./actions";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.employeeId) redirect("/rooster");

  const unclaimed = await prisma.employee.findMany({
    where: { active: true, user: null },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Wie ben jij?</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Kies je naam uit de medewerkerslijst, zodat je eigen rooster te
          zien is en je agenda-koppeling voor jou werkt.
        </p>

        <form action={claimEmployee} className="mt-6 flex flex-col gap-3">
          <select
            name="employeeId"
            required
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Kies je naam…
            </option>
            {unclaimed.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Bevestigen
          </button>
        </form>

        <p className="mt-6 text-xs text-foreground-muted">
          Sta je er niet (meer) bij, of klopt de lijst niet? Vraag een
          leidinggevende om de medewerkerslijst bij te werken.
        </p>
      </div>
    </div>
  );
}
