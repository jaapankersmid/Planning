import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { colorGroupSwatch } from "@/lib/format";
import { ensureColorGroups, sortEmployees } from "@/lib/schedule";
import { AutoSelect } from "@/components/auto-select";
import {
  addEmployee,
  moveColorGroup,
  setEmployeeActive,
  setColorGroupCoverage,
  setEmployeeColorGroup,
  unlinkEmployeeAccount,
} from "./actions";

export default async function MedewerkersPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const groups = await ensureColorGroups();
  const employeesRaw = await prisma.employee.findMany({ include: { user: true } });
  // Actieve medewerkers eerst, in dezelfde volgorde als in het rooster.
  const employees = [
    ...sortEmployees(employeesRaw.filter((e) => e.active), groups),
    ...sortEmployees(employeesRaw.filter((e) => !e.active), groups),
  ];
  const memberCount = new Map<string, number>();
  for (const e of employeesRaw) {
    if (e.active && e.colorGroup) {
      memberCount.set(e.colorGroup, (memberCount.get(e.colorGroup) ?? 0) + 1);
    }
  }
  const groupOptions = groups.map((g) => ({ value: g.name, label: g.name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Medewerkers</h1>
        <p className="text-sm text-foreground-muted">
          {employees.filter((e) => e.active).length} actief van de{" "}
          {employees.length} in totaal.
        </p>
      </div>

      <div className="max-w-lg rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Volgorde van de kleurgroepen</h2>
        <p className="mt-1 text-xs text-foreground-muted">
          Zo staan de groepen onder elkaar in het rooster. Met de knop &ldquo;telt mee&rdquo; bepaal je of een groep meetelt in de bezetting bovenin het rooster. Een medewerker verplaats je
          naar een andere groep in de kolom Kleurgroep hieronder.
        </p>
        <ol className="mt-3 flex flex-col gap-1.5">
          {groups.map((g, i) => (
            <li key={g.id} className="flex items-center gap-3 text-sm">
              <span
                className="h-3 w-3 rounded-full"
                style={{ background: colorGroupSwatch[g.name] ?? "#9aa39a" }}
              />
              <span className="w-28 font-medium">{g.name}</span>
              <span className="w-24 text-xs text-foreground-muted">
                {memberCount.get(g.name) ?? 0} actief
              </span>
              <form action={setColorGroupCoverage.bind(null, g.id, g.countsInCoverage === false)}>
                <button
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    g.countsInCoverage === false
                      ? "bg-surface-muted text-foreground-muted"
                      : "bg-accent-soft text-accent"
                  }`}
                  title="Klik om te wisselen"
                >
                  {g.countsInCoverage === false ? "telt niet mee" : "telt mee"}
                </button>
              </form>
              <form action={moveColorGroup.bind(null, g.id, "up")}>
                <button
                  disabled={i === 0}
                  aria-label={`${g.name} omhoog`}
                  className="rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-muted disabled:opacity-30"
                >
                  ↑
                </button>
              </form>
              <form action={moveColorGroup.bind(null, g.id, "down")}>
                <button
                  disabled={i === groups.length - 1}
                  aria-label={`${g.name} omlaag`}
                  className="rounded border border-border px-2 py-0.5 text-xs hover:bg-surface-muted disabled:opacity-30"
                >
                  ↓
                </button>
              </form>
            </li>
          ))}
        </ol>
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
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        background: e.colorGroup
                          ? (colorGroupSwatch[e.colorGroup] ?? "#9aa39a")
                          : "#d4d9d4",
                      }}
                    />
                    <AutoSelect
                      key={`${e.id}_${e.colorGroup}`}
                      ariaLabel={`Kleurgroep van ${e.name}`}
                      initialValue={e.colorGroup ?? ""}
                      options={groupOptions}
                      emptyLabel="Geen kleurgroep"
                      action={setEmployeeColorGroup.bind(null, e.id)}
                    />
                  </span>
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
            {groups.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
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
