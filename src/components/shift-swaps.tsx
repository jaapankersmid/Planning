import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/format";
import { todayAmsterdam } from "@/lib/schedule";
import { dayLabel, describeGiven, isBroken, isWorking, pieces, timesOf, type ShiftTypeLite } from "@/lib/shift-swap";
import { SwapForm, type SwapShiftOption } from "@/components/swap-form";
import { SwapButtons } from "@/components/swap-buttons";

const STATUS: Record<string, string> = { PENDING: "Wacht op antwoord", ACCEPTED: "Geaccepteerd", DECLINED: "Afgewezen", CANCELLED: "Niet doorgegaan" };

/** "Dienst ruilen" op Mijn rooster: verzoek doen, binnengekomen verzoeken beantwoorden en de eigen verzoeken volgen. */
export async function ShiftSwaps({ employeeId }: { employeeId: string }) {
  const today = todayAmsterdam();
  const until = addDays(today, 8 * 7);
  const types: ShiftTypeLite[] = await prisma.shiftType.findMany();

  const colleagueRows = await prisma.employee.findMany({
    where: { active: true, id: { not: employeeId }, user: { is: { active: true } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const ids = [employeeId, ...colleagueRows.map((c) => c.id)];
  const [upcoming, requests] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { employeeId: { in: ids }, date: { gte: today, lt: until } },
      include: { shiftType: true },
      orderBy: { date: "asc" },
    }),
    prisma.shiftSwapRequest.findMany({
      where: { OR: [{ requesterId: employeeId }, { targetId: employeeId }], createdAt: { gte: addDays(today, -60) } },
      include: { requester: { select: { name: true } }, target: { select: { name: true } }, shiftType: true, returnShiftType: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const option = (a: (typeof upcoming)[number]): SwapShiftOption => {
    const p = isBroken(a.shiftType) ? pieces(a.shiftType, types) : null;
    return {
      id: a.id,
      employeeId: a.employeeId,
      label: `${dayLabel(a.date)}: ${a.shiftType.code} · ${a.shiftType.label}${timesOf(a.shiftType) ? ` (${timesOf(a.shiftType)})` : ""}`,
      morning: p ? timesOf(p.morning) : undefined,
      afternoon: p ? timesOf(p.afternoon) : undefined,
    };
  };
  const working = upcoming.filter((a) => isWorking(a.shiftType));
  const mine = working.filter((a) => a.employeeId === employeeId).map(option);
  const theirs = working.filter((a) => a.employeeId !== employeeId).map(option);

  const incoming = requests.filter((r) => r.targetId === employeeId && r.status === "PENDING");
  const rest = requests.filter((r) => !(r.targetId === employeeId && r.status === "PENDING"));

  const text = (r: (typeof requests)[number]) => {
    const give = `${dayLabel(r.date)}: ${describeGiven(r.shiftType, r.part, types)}`;
    const back = r.returnShiftType && r.returnDate ? `${dayLabel(r.returnDate)}: ${describeGiven(r.returnShiftType, r.returnPart ?? "ALL", types)}` : null;
    return { give, back };
  };

  return (
    <div className="max-w-2xl rounded-lg border border-border bg-surface p-5">
      <h2 className="text-sm font-semibold">Dienst ruilen</h2>
      <p className="mt-1 mb-3 text-sm text-foreground-muted">
        Kies je eigen dienst en een collega. De collega krijgt een mail en ziet het verzoek hier. Pas als die accepteert wordt het rooster aangepast; de planner krijgt dan een mail. Bij een gebroken dienst kun je ook alleen de ochtend of de middag ruilen.
      </p>

      {incoming.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Verzoeken aan jou</h3>
          {incoming.map((r) => {
            const t = text(r);
            return (
              <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                <p><strong>{r.requester.name}</strong> vraagt of je deze dienst overneemt:</p>
                <p className="mt-1">{t.give}</p>
                <p className="mt-1 text-foreground-muted">{t.back ? `In ruil daarvoor krijg je: ${t.back}` : "Je geeft hier niets voor terug."}</p>
                {r.note && <p className="mt-1 text-foreground-muted">Opmerking: {r.note}</p>}
                <div className="mt-2"><SwapButtons id={r.id} mode="respond" /></div>
              </div>
            );
          })}
        </div>
      )}

      <SwapForm mine={mine} colleagues={colleagueRows} theirs={theirs} />

      {rest.length > 0 && (
        <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Mijn ruilverzoeken</h3>
          {rest.map((r) => {
            const t = text(r);
            const mineReq = r.requesterId === employeeId;
            return (
              <div key={r.id} className="rounded-md border border-border p-3 text-sm">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>{mineReq ? `Aan ${r.target.name}` : `Van ${r.requester.name}`}</span>
                  <span className="text-xs text-foreground-muted">{STATUS[r.status]}</span>
                </p>
                <p className="mt-1">{t.give}</p>
                {t.back && <p className="text-foreground-muted">In ruil: {t.back}</p>}
                {r.decisionNote && <p className="text-xs text-foreground-muted">{r.status === "DECLINED" ? "Reden" : "Toelichting"}: {r.decisionNote}</p>}
                {mineReq && r.status === "PENDING" && <div className="mt-2"><SwapButtons id={r.id} mode="cancel" /></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
