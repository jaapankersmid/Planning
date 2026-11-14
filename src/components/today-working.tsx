import { prisma } from "@/lib/prisma";
import { DEFAULT_COLOR_GROUPS, todayAmsterdam } from "@/lib/schedule";

const GROUP_COLOR: Record<string, string> = {
  Rood: "#dc2626", Oranje: "#f97316", Geel: "#eab308", Groen: "#16a34a", Blauw: "#2563eb", "Licht Blauw": "#38bdf8",
};
const rank = (g: string | null) => {
  const i = g ? DEFAULT_COLOR_GROUPS.indexOf(g) : -1;
  return i === -1 ? DEFAULT_COLOR_GROUPS.length : i;
};

// "Vandaag aan het werk": per dienst, daarbinnen op kleurgroep en naam. Voor alle gebruikers.
export async function TodayWorking() {
  const today = todayAmsterdam();
  const rows = await prisma.shiftAssignment.findMany({
    where: { date: today, employee: { active: true } },
    include: { employee: { select: { name: true, colorGroup: true } }, shiftType: true },
  });
  const working = rows
    .filter((a) => a.shiftType.code !== "V")
    .sort(
      (a, b) =>
        (a.shiftType.startTime ?? "99:99").localeCompare(b.shiftType.startTime ?? "99:99") ||
        a.shiftType.code.localeCompare(b.shiftType.code) ||
        rank(a.employee.colorGroup) - rank(b.employee.colorGroup) ||
        a.employee.name.localeCompare(b.employee.name, "nl"),
    );
  const groups: { code: string; label: string; color: string; time: string; people: typeof working }[] = [];
  for (const a of working) {
    let g = groups.find((x) => x.code === a.shiftType.code);
    if (!g) {
      const s = a.shiftType;
      groups.push((g = { code: s.code, label: s.label, color: s.color, time: s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : "", people: [] }));
    }
    g.people.push(a);
  }
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Vandaag aan het werk ({working.length})</h2>
      {groups.length === 0 ? (
        <p className="text-xs text-foreground-muted">Niemand ingepland.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.code} className="rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2 text-xs font-medium">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} />
                {g.label || g.code}
                <span className="font-normal text-foreground-muted">{g.code}{g.time ? ` · ${g.time}` : ""} · {g.people.length}</span>
              </div>
              <ul className="mt-1.5 flex flex-col gap-0.5 text-sm">
                {g.people.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span title={a.employee.colorGroup || "geen kleurgroep"} className="inline-block h-2 w-2 rounded-full border border-border" style={{ background: GROUP_COLOR[a.employee.colorGroup ?? ""] ?? "transparent" }} />
                    {a.employee.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
