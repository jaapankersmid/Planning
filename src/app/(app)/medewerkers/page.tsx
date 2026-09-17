import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { colorGroupSwatch } from "@/lib/format";
import { addEmployee, setEmployeeActive, unlinkEmployeeAccount } from "./actions";

const COLOR_GROUPS = Object.keys(colorGroupSwatch);

export default async function MedewerkersPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const employees = await prisma.employee.findMany({
    include: { user: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Medewerkers</h1>
        <p className="text-sm text-foreground-muted">
          {employees.filter((e) => e.active).length} actief van de{" "}
          {employees.length} in totaal.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Naam</th>
              <th className="px-4 py-2">Kleurgroep</th>
              <th className="px-4 py-2">Account</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium">{e.name}</td>
                <td className="px-4 py-2">
                  {e.colorGroup && (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: colorGroupSwatch[e.colorGroup] }}
                      />
                      {e.colorGroup}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-foreground-muted">
                  {e.user ? (
                    <span className="inline-flex items-center gap-2">
                      {e.user.email ?? "gekoppeld"}
                      <form action={unlinkEmployeeAccount.bind(null, e.id)}>
                        <button className="text-xs underline hover:no-underline">
                          ontkoppelen
                        </button>
                      </form>
                    </span>
                  ) : (
                    "— niet gekoppeld"
                  )}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      e.active
                        ? "bg-accent-soft text-accent"
                        : "bg-surface-muted text-foreground-muted"
                    }`}
                  >
                    {e.active ? "actief" : "inactief"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={setEmployeeActive.bind(null, e.id, !e.active)}>
                    <button className="text-xs underline hover:no-underline">
                      {e.active ? "op inactief zetten" : "activeren"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-sm rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Nieuwe medewerker</h2>
        <form action={addEmployee} className="mt-3 flex flex-col gap-3">
          <input
            name="name"
            required
            placeholder="Naam"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <select
            name="colorGroup"
            defaultValue=""
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">Geen kleurgroep</option>
            {COLOR_GROUPS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Toevoegen
          </button>
        </form>
      </div>
    </div>
  );
}
