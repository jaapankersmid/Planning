import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { CreateUserForm } from "@/components/create-user-form";
import { ResetPasswordButton } from "@/components/reset-password-button";
import { MailStatusPanel } from "@/components/mail-status-panel";
import { isMailConfigured } from "@/lib/mail";
import { pendingNotificationCount } from "@/lib/notifications";
import { pendingAvailabilityCount } from "@/lib/planner-alerts";
import { AutoSelect } from "@/components/auto-select";
import { RoleSelect } from "@/components/role-select";
import { ROLE_OPTIONS } from "@/lib/roles";
import { linkEmployee, setUserActive } from "./actions";

export default async function GebruikersPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const [users, unclaimedEmployees, allEmployees] = await Promise.all([
    prisma.user.findMany({
      include: { employee: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.employee.findMany({
      where: { active: true, user: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, user: { select: { id: true } } },
    }),
  ]);

  const pendingMails = (await pendingNotificationCount()) + (await pendingAvailabilityCount());
  const delayMinutes = Number(process.env.NOTIFY_DELAY_MINUTES) || 10;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Gebruikers</h1>
        <p className="text-sm text-foreground-muted">
          Inlogaccounts voor de app — los van de medewerkerslijst die in het
          rooster staat. Alleen mensen met een account hier kunnen inloggen.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Rechten per rol</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Alleen planners kunnen hier rollen wijzigen en gebruikers beheren.
        </p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[8rem_1fr]">
          {ROLE_OPTIONS.map((r) => (
            <div key={r.value} className="contents">
              <dt className="font-medium">{r.label}</dt>
              <dd className="text-foreground-muted">{r.description}</dd>
            </div>
          ))}
        </dl>
      </div>

      <MailStatusPanel configured={isMailConfigured()} pending={pendingMails} delayMinutes={delayMinutes} />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Naam</th>
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Medewerker</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{u.name}</td>
                <td className="px-4 py-2 text-foreground-muted">{u.email}</td>
                <td className="px-4 py-2">
                  <RoleSelect
                    key={`${u.id}_${u.role}`}
                    userId={u.id}
                    userName={u.name ?? u.email}
                    initialRole={u.role}
                    disabled={u.id === session.user.id}
                  />
                </td>
                <td className="px-4 py-2">
                  <AutoSelect
                    key={`${u.id}_${u.employeeId}`}
                    ariaLabel={`Medewerker van ${u.name}`}
                    initialValue={u.employeeId ?? ""}
                    emptyLabel="— niet gekoppeld"
                    options={allEmployees
                      // Medewerkers die al bij een ander account horen laten we niet kiezen.
                      .filter((e) => !e.user || e.user.id === u.id)
                      .map((e) => ({ value: e.id, label: e.name }))}
                    action={linkEmployee.bind(null, u.id)}
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.active
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-muted text-foreground-muted"
                      }`}
                    >
                      {u.active ? "actief" : "uitgezet"}
                    </span>
                    {u.mustChangePassword && (
                      <span className="w-fit text-xs text-foreground-muted">
                        moet wachtwoord wijzigen
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-end gap-1.5">
                    <ResetPasswordButton userId={u.id} />
                    <form action={setUserActive.bind(null, u.id, !u.active)}>
                      <button className="text-xs underline hover:no-underline">
                        {u.active ? "uitzetten" : "activeren"}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserForm unclaimedEmployees={unclaimedEmployees} />
    </div>
  );
}
