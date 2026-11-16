"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyProposal, showProposalInRoster } from "@/app/(app)/planvoorstel/actions";

type Part = "MORNING" | "AFTERNOON";
type Row = { id: number; date: string; part: Part; tagId: string; employeeId: string; gap: boolean };
export type ProposalEmployee = { id: string; name: string; colorGroup: string | null; tagIds: string[] };

const input = "rounded-md border border-border bg-surface px-2 py-1 text-sm";
const dayName = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${["zo", "ma", "di", "wo", "do", "vr", "za"][d.getUTCDay()]} ${d.getUTCDate()}-${d.getUTCMonth() + 1}`;
};

/** Het voorstel: per regel kun je de persoon wijzigen of weghalen. Pas bij "In het rooster zetten" verandert er iets. */
export function PlanProposal({
  items,
  gaps,
  tags,
  employees,
  baseHours,
  hours,
}: {
  items: { date: string; part: Part; tagId: string; employeeId: string }[];
  gaps: { date: string; part: Part; tagId: string; missing: number }[];
  tags: { id: string; name: string }[];
  employees: ProposalEmployee[];
  baseHours: Record<string, number>;
  hours: Record<string, number>;
}) {
  const initial = useMemo<Row[]>(() => {
    let id = 0;
    const rows: Row[] = items.map((i) => ({ id: id++, ...i, gap: false }));
    for (const g of gaps) for (let k = 0; k < g.missing; k++) rows.push({ id: id++, date: g.date, part: g.part, tagId: g.tagId, employeeId: "", gap: true });
    return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.part === b.part ? 0 : a.part === "MORNING" ? -1 : 1) || a.tagId.localeCompare(b.tagId));
  }, [items, gaps]);
  const [rows, setRows] = useState(initial);
  const [result, setResult] = useState<{ applied: number; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const tagName = (id: string) => tags.find((t) => t.id === id)?.name ?? "";
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? "";

  const filled = rows.filter((r) => r.employeeId);
  // Dubbel ingepland in hetzelfde dagdeel, of twee verschillende taken op één dag, tonen we als waarschuwing.
  const warnings = useMemo(() => {
    const w: string[] = [];
    const seen = new Map<string, Row>();
    const perDay = new Map<string, Set<string>>();
    for (const r of filled) {
      const k = `${r.employeeId}|${r.date}|${r.part}`;
      if (seen.has(k)) w.push(`${nameOf(r.employeeId)} staat ${dayName(r.date)} ${r.part === "MORNING" ? "ochtend" : "middag"} dubbel ingepland.`);
      seen.set(k, r);
      const d = `${r.employeeId}|${r.date}`;
      if (!perDay.has(d)) perDay.set(d, new Set());
      perDay.get(d)!.add(r.tagId);
    }
    for (const [d, set] of perDay) if (set.size > 1) { const [e, date] = d.split("|"); w.push(`${nameOf(e)} heeft ${dayName(date)} twee verschillende taken.`); }
    return w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // Uren per persoon: bestaande diensten + het (aangepaste) voorstel. Een deel is een schatting van 4 uur per dagdeel.
  const total = useMemo(() => {
    const t: Record<string, number> = { ...baseHours };
    const added: Record<string, number> = {};
    for (const [id, h] of Object.entries(hours)) added[id] = h - (baseHours[id] ?? 0);
    // Aanpassingen aan de rijen tellen als verschil met het oorspronkelijke voorstel.
    const perItem = (rs: Row[]) => rs.reduce<Record<string, number>>((acc, r) => { if (r.employeeId) acc[r.employeeId] = (acc[r.employeeId] ?? 0) + 1; return acc; }, {});
    const before = perItem(initial);
    const after = perItem(rows);
    const result: Record<string, number> = {};
    for (const e of employees) {
      const perPart = before[e.id] ? (added[e.id] ?? 0) / before[e.id] : 4;
      result[e.id] = (t[e.id] ?? 0) + (before[e.id] ? added[e.id] ?? 0 : 0) + ((after[e.id] ?? 0) - (before[e.id] ?? 0)) * perPart;
    }
    return result;
  }, [rows, employees, baseHours, hours, initial]);

  const apply = () => {
    setError(null);
    start(async () => {
      try {
        const res = await applyProposal(filled.map((r) => ({ date: r.date, part: r.part, tagId: r.tagId, employeeId: r.employeeId })));
        setResult(res);
        setRows((rs) => rs.filter((r) => !r.employeeId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Toepassen is niet gelukt.");
      }
    });
  };

  const show = () => {
    setError(null);
    start(async () => {
      try {
        const list = filled.map((r) => ({ date: r.date, part: r.part, tagId: r.tagId, employeeId: r.employeeId }));
        await showProposalInRoster(list);
        const dates = list.map((l) => l.date).sort();
        const first = dates[0];
        const span = (new Date(`${dates[dates.length - 1]}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) / 86400000;
        router.push(span <= 6 ? `/rooster?weergave=week&datum=${first}` : `/rooster?year=${first.slice(0, 4)}&month=${Number(first.slice(5, 7))}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Tonen is niet gelukt.");
      }
    });
  };

  const groups = [...new Set(employees.map((e) => e.colorGroup ?? "Zonder groep"))];

  return (
    <div className="flex flex-col gap-5">
      {result && (
        <div className="rounded-md bg-surface-muted px-3 py-2 text-sm">
          <p className="font-medium">{result.applied} dienst{result.applied === 1 ? "" : "en"} in het rooster gezet.</p>
          {result.skipped.length > 0 && <ul className="mt-1 list-disc pl-5 text-foreground-muted">{result.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}
        </div>
      )}
      {error && <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-xs text-foreground-muted">
              <th className="px-3 py-2 font-medium">Dag</th>
              <th className="px-3 py-2 font-medium">Dagdeel</th>
              <th className="px-3 py-2 font-medium">Taak</th>
              <th className="px-3 py-2 font-medium">Medewerker</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const options = employees.filter((e) => e.tagIds.includes(r.tagId));
              return (
                <tr key={r.id} className={`border-b border-border last:border-b-0 ${r.gap && !r.employeeId ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-1.5 tabular-nums">{dayName(r.date)}</td>
                  <td className="px-3 py-1.5">{r.part === "MORNING" ? "Ochtend" : "Middag"}</td>
                  <td className="px-3 py-1.5">{tagName(r.tagId)}</td>
                  <td className="px-3 py-1.5">
                    <select value={r.employeeId} onChange={(e) => setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, employeeId: e.target.value } : x)))} className={input}>
                      <option value="">{r.gap ? "Niemand beschikbaar: kies zelf" : "— niemand —"}</option>
                      {options.map((e) => <option key={e.id} value={e.id}>{e.name}{e.colorGroup ? ` (${e.colorGroup})` : ""}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} className="text-xs text-foreground-muted hover:underline">weghalen</button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-foreground-muted">Geen regels in het voorstel.</td></tr>}
          </tbody>
        </table>
      </div>

      {warnings.length > 0 && <ul className="list-disc rounded-md bg-amber-50 py-2 pl-7 pr-3 text-sm">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {rows.some((r) => r.gap && !r.employeeId) && <p className="text-xs text-foreground-muted">Gele regels konden niet gevuld worden: niemand met die tag was beschikbaar en vrij. Kies zelf iemand of laat ze leeg.</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={apply} disabled={pending || filled.length === 0} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-60">
          {pending ? "Bezig…" : `In het rooster zetten (${filled.length})`}
        </button>
        <button type="button" onClick={show} disabled={pending || filled.length === 0} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-60">
          Bekijk in het rooster
        </button>
        <span className="text-xs text-foreground-muted">Bestaande diensten worden niet aangepast. Wie die dag al een dienst heeft, wordt overgeslagen.</span>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Uren per persoon, bestaande diensten plus voorstel</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g} className="rounded-lg border border-border bg-surface p-3">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-foreground-muted">{g}</div>
              <ul className="text-sm">
                {employees.filter((e) => (e.colorGroup ?? "Zonder groep") === g).sort((a, b) => (total[a.id] ?? 0) - (total[b.id] ?? 0)).map((e) => (
                  <li key={e.id} className="flex justify-between gap-2"><span>{e.name}</span><span className="tabular-nums text-foreground-muted">{String(Math.round((total[e.id] ?? 0) * 10) / 10).replace(".", ",")} u</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-foreground-muted">Alleen diensten in de gekozen periode. Handmatige wijzigingen hierboven tellen mee als schatting.</p>
      </div>
    </div>
  );
}
