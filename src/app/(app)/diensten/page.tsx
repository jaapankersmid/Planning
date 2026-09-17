import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readableTextColor } from "@/lib/format";
import { addShiftType, setShiftTypeActive } from "./actions";

export default async function DienstenPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const shiftTypes = await prisma.shiftType.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Diensten</h1>
        <p className="text-sm text-foreground-muted">
          De shiftcodes en tijden die in het rooster te kiezen zijn — dit is
          de digitale versie van de “Legenda uren” uit Planning V2.0.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Omschrijving</th>
              <th className="px-4 py-2">Tijden</th>
              <th className="px-4 py-2">Telt mee als</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {shiftTypes.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <span
                    className="inline-flex h-7 min-w-10 items-center justify-center rounded px-2 text-xs font-semibold"
                    style={{ background: s.color, color: readableTextColor(s.color) }}
                  >
                    {s.code}
                  </span>
                </td>
                <td className="px-4 py-2">{s.label}</td>
                <td className="px-4 py-2 text-foreground-muted">
                  {s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : "—"}
                  {s.secondStartTime && s.secondEndTime
                    ? ` en ${s.secondStartTime}–${s.secondEndTime}`
                    : ""}
                </td>
                <td className="px-4 py-2 text-foreground-muted">
                  {[
                    s.countsMorningWalk ? "ochtenduitlaat" : null,
                    s.countsEveningWalk ? "avonduitlaat" : null,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.active
                        ? "bg-accent-soft text-accent"
                        : "bg-surface-muted text-foreground-muted"
                    }`}
                  >
                    {s.active ? "actief" : "inactief"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={setShiftTypeActive.bind(null, s.id, !s.active)}>
                    <button className="text-xs underline hover:no-underline">
                      {s.active ? "op inactief zetten" : "activeren"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-md rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Nieuwe dienst</h2>
        <form action={addShiftType} className="mt-3 grid grid-cols-2 gap-3">
          <input
            name="code"
            required
            placeholder="Code (bv. UitO)"
            className="col-span-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            name="color"
            type="color"
            defaultValue="#2f6e63"
            className="col-span-1 h-10 rounded-md border border-border bg-surface px-1"
          />
          <input
            name="label"
            required
            placeholder="Omschrijving"
            className="col-span-2 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            name="startTime"
            type="time"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            name="endTime"
            type="time"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            name="secondStartTime"
            type="time"
            placeholder="2e blok start"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <input
            name="secondEndTime"
            type="time"
            placeholder="2e blok eind"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm"
          />
          <label className="col-span-1 flex items-center gap-2 text-xs">
            <input type="checkbox" name="countsMorningWalk" className="h-4 w-4" />
            Telt als ochtenduitlaat
          </label>
          <label className="col-span-1 flex items-center gap-2 text-xs">
            <input type="checkbox" name="countsEveningWalk" className="h-4 w-4" />
            Telt als avonduitlaat
          </label>
          <button
            type="submit"
            className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Toevoegen
          </button>
        </form>
      </div>
    </div>
  );
}
