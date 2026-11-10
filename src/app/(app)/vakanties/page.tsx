import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDayMonth, toISODate } from "@/lib/format";
import { addHoliday, deleteHoliday, updateHoliday } from "./actions";

const inputClass = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

function period(start: Date, end: Date) {
  const sameDay = toISODate(start) === toISODate(end);
  const startText = `${formatDayMonth(start)}${
    start.getUTCFullYear() !== end.getUTCFullYear() ? ` ${start.getUTCFullYear()}` : ""
  }`;
  return sameDay
    ? `${formatDayMonth(start)} ${start.getUTCFullYear()}`
    : `${startText} t/m ${formatDayMonth(end)} ${end.getUTCFullYear()}`;
}

export default async function VakantiesPage({
  searchParams,
}: {
  searchParams: Promise<{ bewerk?: string }>;
}) {
  const { bewerk } = await searchParams;
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  const holidays = await prisma.holidayPeriod.findMany({ orderBy: { startDate: "asc" } });
  const editing = bewerk ? holidays.find((h) => h.id === bewerk) : undefined;

  const fields = (h?: (typeof holidays)[number]) => (
    <>
      <input name="name" required defaultValue={h?.name} placeholder="Naam (bv. Kerstvakantie)" className={`col-span-2 ${inputClass}`} />
      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        Eerste dag
        <input name="startDate" type="date" required defaultValue={h ? toISODate(h.startDate) : ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        Laatste dag
        <input name="endDate" type="date" required defaultValue={h ? toISODate(h.endDate) : ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        Wensaantal ochtend (8:00–12:30)
        <input name="wantMorning" type="number" min={0} step={1} defaultValue={h?.wantMorning ?? ""} placeholder="geen wens" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground-muted">
        Wensaantal middag (15:30–19:30)
        <input name="wantAfternoon" type="number" min={0} step={1} defaultValue={h?.wantAfternoon ?? ""} placeholder="geen wens" className={inputClass} />
      </label>
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Vakanties</h1>
        <p className="max-w-2xl text-sm text-foreground-muted">
          Vakantieperiodes staan als balk bovenin het rooster. Geef je een wensaantal op, dan
          kleurt de bezetting van die dagen groen als het aantal gehaald is en rood als het
          eronder blijft.
        </p>
      </div>

      {editing && (
        <div className="max-w-xl rounded-lg border border-accent bg-surface p-5">
          <h2 className="text-sm font-semibold">Vakantie bewerken: {editing.name}</h2>
          <form key={editing.id} action={updateHoliday.bind(null, editing.id)} className="mt-3 grid grid-cols-2 gap-3">
            {fields(editing)}
            <div className="col-span-2 flex items-center gap-3">
              <button type="submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
                Opslaan
              </button>
              <Link href="/vakanties" className="text-sm underline hover:no-underline">
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
              <th className="px-4 py-2">Vakantie</th>
              <th className="px-4 py-2">Periode</th>
              <th className="px-4 py-2">Wens ochtend</th>
              <th className="px-4 py-2">Wens middag</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {holidays.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-foreground-muted">
                  Nog geen vakantieperiodes. Voeg er hieronder een toe.
                </td>
              </tr>
            )}
            {holidays.map((h) => (
              <tr key={h.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2">
                  <span className="rounded bg-holiday px-2 py-0.5 font-medium text-holiday-strong">{h.name}</span>
                </td>
                <td className="px-4 py-2">{period(h.startDate, h.endDate)}</td>
                <td className="px-4 py-2 tabular-nums">{h.wantMorning ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums">{h.wantAfternoon ?? "—"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <Link href={`/vakanties?bewerk=${h.id}`} className="text-xs underline hover:no-underline">
                      bewerken
                    </Link>
                    <form action={deleteHoliday.bind(null, h.id)}>
                      <button className="text-xs underline hover:no-underline">verwijderen</button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="max-w-xl rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Nieuwe vakantieperiode</h2>
        <form action={addHoliday} className="mt-3 grid grid-cols-2 gap-3">
          {fields()}
          <button type="submit" className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90">
            Toevoegen
          </button>
        </form>
      </div>
    </div>
  );
}
