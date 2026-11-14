import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/roles";
import { customerNumberLabel, STATUS_LABEL, STATUS_STYLE } from "@/lib/customers";

const LIMIT = 100;

export default async function KlantenPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageCustomers(session.user.role)) redirect("/rooster");

  const q = ((await searchParams).q ?? "").trim();
  // Zoeken op naam, bedrijf, e-mail, telefoon, plaats, klantnummer (K-0012 of 12) en de naam van het dier.
  const num = Number(q.replace(/^k-?/i, ""));
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { companyName: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { city: { contains: q, mode: "insensitive" as const } },
          { cremations: { some: { animalName: { contains: q, mode: "insensitive" as const } } } },
          ...(Number.isInteger(num) && num > 0 ? [{ customerNumber: num }] : []),
        ],
      }
    : {};

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
      include: { cremations: { orderBy: { createdAt: "desc" }, select: { status: true, animalName: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Klanten</h1>
          <p className="text-sm text-foreground-muted">
            {q ? `${total} resultaten voor "${q}"` : `${total} klanten`}
            {total > LIMIT ? ` (de nieuwste ${LIMIT} worden getoond; verfijn je zoekopdracht)` : ""}
          </p>
        </div>
        <Link href="/klanten/nieuw" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
          Nieuwe klant
        </Link>
      </div>

      <form className="flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Zoek op naam, e-mail, telefoon, plaats, klantnummer of naam van het dier"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
        />
        <button className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-muted">Zoek</button>
        {q && (
          <Link href="/klanten" className="self-center text-sm text-foreground-muted hover:underline">
            Wissen
          </Link>
        )}
      </form>

      {customers.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-5 text-sm text-foreground-muted">
          {q ? "Geen klanten gevonden." : "Er zijn nog geen klanten. Voeg de eerste toe met de knop rechtsboven."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs text-foreground-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Nr.</th>
                <th className="px-4 py-2 font-medium">Naam</th>
                <th className="px-4 py-2 font-medium">Plaats</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Crematies</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-muted">
                  <td className="whitespace-nowrap px-4 py-2 text-foreground-muted">{customerNumberLabel(c.customerNumber)}</td>
                  <td className="px-4 py-2">
                    <Link href={`/klanten/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    {c.companyName && <div className="text-xs text-foreground-muted">{c.companyName}</div>}
                  </td>
                  <td className="px-4 py-2">{c.city ?? "–"}</td>
                  <td className="px-4 py-2 text-xs">
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div>{c.phone}</div>}
                  </td>
                  <td className="px-4 py-2">
                    {c.cremations.length === 0 ? (
                      <span className="text-foreground-muted">–</span>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-medium">{c.cremations.length}×</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.cremations[0].status]}`}>
                          {c.cremations[0].animalName ? `${c.cremations[0].animalName}: ` : ""}
                          {STATUS_LABEL[c.cremations[0].status]}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
