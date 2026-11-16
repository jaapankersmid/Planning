"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertAutoPlan } from "@/lib/auto-plan-guard";
import { applyPlan, type Part, type PlanItem } from "@/lib/auto-plan";
import { addDays, dateFromISO } from "@/lib/format";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const refresh = () => {
  revalidatePath("/planvoorstel", "layout");
  revalidatePath("/rooster");
};

/** Instellingen: welke kleurgroepen meedoen. */
export async function saveParticipation(fd: FormData) {
  await assertAutoPlan();
  const on = new Set(fd.getAll("group").map(String));
  const groups = await prisma.colorGroup.findMany();
  for (const g of groups) await prisma.colorGroup.update({ where: { id: g.id }, data: { planParticipates: on.has(g.name) } });
  refresh();
}

export async function addTag(fd: FormData) {
  await assertAutoPlan();
  const name = String(fd.get("name") ?? "").trim().slice(0, 40);
  if (!name) return;
  const max = await prisma.planTag.aggregate({ _max: { sortOrder: true } });
  await prisma.planTag.upsert({ where: { name }, update: {}, create: { name, sortOrder: (max._max.sortOrder ?? -1) + 1 } });
  refresh();
}

export async function deleteTag(tagId: string) {
  await assertAutoPlan();
  await prisma.planTag.deleteMany({ where: { id: tagId } });
  refresh();
}

/** Tag opslaan: naam, de dienst-types voor ochtend, middag en samen, en wie de tag heeft. */
export async function saveTag(tagId: string, fd: FormData) {
  await assertAutoPlan();
  const name = String(fd.get("name") ?? "").trim().slice(0, 40);
  const pick = (k: string) => String(fd.get(k) ?? "") || null;
  const employeeIds = fd.getAll("employee").map(String);
  await prisma.$transaction([
    prisma.planTag.update({ where: { id: tagId }, data: { ...(name ? { name } : {}), morningShiftTypeId: pick("morning"), afternoonShiftTypeId: pick("afternoon"), bothShiftTypeId: pick("both") } }),
    prisma.planTagEmployee.deleteMany({ where: { tagId } }),
    prisma.planTagEmployee.createMany({ data: employeeIds.map((employeeId) => ({ tagId, employeeId })), skipDuplicates: true }),
  ]);
  refresh();
}

/** Behoefte van één week opslaan: velden n_<tagId>_<MORNING|AFTERNOON>_<datum>. 0 of leeg wist de regel. */
export async function saveNeeds(fd: FormData) {
  await assertAutoPlan();
  const start = String(fd.get("start") ?? "");
  if (!ISO.test(start)) return;
  const from = dateFromISO(start);
  const to = addDays(from, 7);
  const tags = new Set((await prisma.planTag.findMany({ select: { id: true } })).map((t) => t.id));
  const rows: { date: Date; part: Part; tagId: string; count: number }[] = [];
  for (const [name, value] of fd.entries()) {
    const m = /^n_(.+)_(MORNING|AFTERNOON)_(\d{4}-\d{2}-\d{2})$/.exec(name);
    if (!m || !tags.has(m[1])) continue;
    const count = Math.max(0, Math.min(50, Math.floor(Number(String(value).trim() || 0)) || 0));
    if (count > 0) rows.push({ date: dateFromISO(m[3]), part: m[2] as Part, tagId: m[1], count });
  }
  await prisma.$transaction([
    prisma.planNeed.deleteMany({ where: { date: { gte: from, lt: to } } }),
    prisma.planNeed.createMany({ data: rows }),
  ]);
  refresh();
}

/** Neemt de behoefte van de week ervoor over (alleen als deze week nog leeg is). */
export async function copyPreviousWeek(fd: FormData) {
  await assertAutoPlan();
  const start = String(fd.get("start") ?? "");
  if (!ISO.test(start)) return;
  const from = dateFromISO(start);
  const to = addDays(from, 7);
  if ((await prisma.planNeed.count({ where: { date: { gte: from, lt: to } } })) > 0) return;
  const prev = await prisma.planNeed.findMany({ where: { date: { gte: addDays(from, -7), lt: from } } });
  await prisma.planNeed.createMany({ data: prev.map((n) => ({ date: addDays(n.date, 7), part: n.part, tagId: n.tagId, count: n.count })) });
  refresh();
}

/** Het voorstel toepassen. Geeft terug hoeveel er in het rooster is gezet en wat is overgeslagen. */
export async function applyProposal(items: PlanItem[]): Promise<{ applied: number; skipped: string[] }> {
  await assertAutoPlan();
  const clean = items.filter((i) => i && ISO.test(i.date) && (i.part === "MORNING" || i.part === "AFTERNOON") && i.tagId && i.employeeId);
  const res = await applyPlan(clean);
  refresh();
  return res;
}

/** Bewaart het voorstel zodat het gestippeld omrand in het rooster verschijnt. Vervangt een eerder getoond voorstel. */
export async function showProposalInRoster(items: PlanItem[]) {
  await assertAutoPlan();
  const clean = items.filter((i) => i && ISO.test(i.date) && (i.part === "MORNING" || i.part === "AFTERNOON") && i.tagId && i.employeeId);
  await prisma.$transaction([
    prisma.planProposalItem.deleteMany({}),
    prisma.planProposalItem.createMany({ data: clean.map((i) => ({ date: dateFromISO(i.date), part: i.part, tagId: i.tagId, employeeId: i.employeeId })) }),
  ]);
  refresh();
}

const backTo = (fd: FormData, message: string) => {
  const raw = String(fd.get("terug") ?? "");
  const base = raw.startsWith("/rooster") && !raw.startsWith("//") ? raw.split("&planmelding=")[0].split("?planmelding=")[0] : "/rooster";
  redirect(`${base}${base.includes("?") ? "&" : "?"}planmelding=${encodeURIComponent(message)}`);
};

/** Het getoonde voorstel in één keer toepassen vanuit het rooster. Bestaande diensten blijven onaangeroerd. */
export async function applyShownProposal(fd: FormData) {
  await assertAutoPlan();
  const rows = await prisma.planProposalItem.findMany();
  const res = await applyPlan(rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), part: r.part, tagId: r.tagId, employeeId: r.employeeId })));
  await prisma.planProposalItem.deleteMany({});
  refresh();
  backTo(fd, `${res.applied} dienst${res.applied === 1 ? "" : "en"} in het rooster gezet.${res.skipped.length ? ` Overgeslagen: ${res.skipped.join(" ")}` : ""}`);
}

export async function clearShownProposal(fd: FormData) {
  await assertAutoPlan();
  await prisma.planProposalItem.deleteMany({});
  refresh();
  backTo(fd, "Voorstel gewist.");
}
