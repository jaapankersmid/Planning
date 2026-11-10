import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readableTextColor } from "@/lib/format";
import Link from "next/link";
import { addShiftType, setShiftTypeActive, updateShiftType } from "./actions";

const inputClass =
  "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export default async function DienstenPage({
  searchParams,
}: {
  searchParams: Promise<{ bewerk?: string }>;
}) {
  const { bewerk } = await searchParams;
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const shiftTypes = await prisma.shiftType.findMany({
    orderBy: [{ active: "desc" }, { code: "asc" }],
  });

  const editing = bewerk ? shiftTypes.find((s) => s.id === bewerk) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Diensten</h1>
        <p className="text-sm text-foreground-muted">
          De shiftcodes en tijden die in het rooster te kiezen zijn — dit is
          de digitale versie van de “Legenda uren” uit Planning V2.0.
        </p>
      </div>

      {editing && (
        <div className="max-w-md rounded-lg border border-accent bg-surface p-5">
          <h2 className="text-sm font-semibold">Dienst bewerken: {editing.code}</h2>
          <p className="mt-1 text-xs text-foreground-muted">
            Een wijziging geldt voor alle plekken in het rooster waar deze dienst
            staat, ook voor dagen die al geweest zijn.
          </p>
          <form
            key={editing.id}
            action={updateShiftType.bind(null, editing.id)}
            className="mt-3 grid grid-cols-2 gap-3"
          >
            <input name="code" required defaultValue={editing.code} placeholder="Code" className={`col-span-1 ${inputClass}`} />
            <input name="color" type="color" defaultValue={editing.color} className="col-span-1 h-10 rounded-md border border-border bg-surface px-1" />
            <input name="label" required defaultValue={editing.label} placeholder="Omschrijving" className={`col-span-2 ${inputClass}`} />
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Start
              <input name="startTime" type="time" defaultValue={editing.startTime ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              Eind
              <input name="endTime" type="time" defaultValue={editing.endTime ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              2e blok start
              <input name="secondStartTime" type="time" defaultValue={editing.secondStartTime ?? ""} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-foreground-muted">
              2e blok eind
              <input name="secondEndTime" type="time" defaultValue={editing.secondEndTime ?? ""} className={inputClass} />
            </label>
            <label className="col-span-1 flex items-center gap-2 text-xs">
              <input type="checkbox" name="countsMorningWalk" defaultChecked={editing.countsMorningWalk} className="h-4 w-4" />
              Telt als ochtenduitlaat
            </label>
            <label className="col-span-1 flex items-center gap-2 text-xs">
              <input type="checkbox" name="countsEveningWalk" defaultChecked={editing.countsEveningWalk} className="h-4 w-4" />
              Telt als avonduitlaat
            </label>
            <label className="col-span-1 flex items-center gap-2 text-xs">
              <input type="checkbox" name="countsMorning" defaultChecked={editing.countsMorning} className="h-4 w-4" />
              Bezetting ochtend (8:00–12:30)
            </label>
            <label className="col-span-1 flex items-center gap-2 text-xs">
              <input type="checkbox" name="countsAfternoon" defaultChecked={editing.countsAfternoon} className="h-4 w-4" />
              Bezetting middag (15:30–19:30)
            </label>
            <div className="col-span-2 flex items-center gap-3">
              <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
                Opslaan
              </button>
              <Link href="/diensten" className="text-sm underline hover:no-underline">
                annuleren
              </Link>
            </div>
          </form>
        </div>
      )}

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
                    s.countsMorning ? "bezetting ochtend" : null,
                    s.countsAfternoon ? "bezetting middag" : null,
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
                  <div className="flex flex-col items-end gap-1.5">
                    <Link
                      href={`/diensten?bewerk=${s.id}`}
                      className="text-xs underline hover:no-underline"
                    >
                      bewerken
                    </Link>
                    <form action={setShiftTypeActive.bind(null, s.id, !s.active)}>
                      <button className="text-xs underline hover:no-underline">
                        {s.active ? "op inactief zetten" : "activeren"}
                      </button>
                    </form>
                  </div>
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
          <label className="col-span-1 flex items-center gap-2 text-xs">
            <input type="checkbox" name="countsMorning" className="h-4 w-4" />
            Bezetting ochtend (8:00–12:30)
          </label>
          <label className="col-span-1 flex items-center gap-2 text-xs">
            <input type="checkbox" name="countsAfternoon" className="h-4 w-4" />
            Bezetting middag (15:30–19:30)
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
