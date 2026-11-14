import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/roles";
import {
  COUNTRY_LABEL,
  cremationNumberLabel,
  customerNumberLabel,
  formatCents,
  formatISOdate,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  STATUS_STYLE,
  TYPE_LABEL,
} from "@/lib/customers";
import { CremationForm } from "@/components/cremation-form";
import { deleteCremation, deleteCustomer, setCremationStatus } from "../actions";

export default async function KlantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageCustomers(session.user.role)) redirect("/rooster");

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { cremations: { orderBy: { createdAt: "desc" }, include: { partner: { select: { name: true } } } } },
  });
  if (!customer) notFound();

  const address = [customer.street, [customer.postalCode, customer.city].filter(Boolean).join(" ")].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/klanten" className="text-xs text-foreground-muted hover:underline">
          ← Alle klanten
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">
            {customer.name}{" "}
            <span className="text-sm font-normal text-foreground-muted">{customerNumberLabel(customer.customerNumber)}</span>
          </h1>
          <Link href={`/klanten/${id}/bewerken`} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted">
            Bewerken
          </Link>
        </div>
      </div>

      <div className="grid max-w-3xl gap-x-8 gap-y-2 rounded-lg border border-border bg-surface p-5 text-sm sm:grid-cols-2">
        {customer.companyName && <Info label="Bedrijf" value={customer.companyName} />}
        <Info label="E-mail" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
        <Info label="Telefoon" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
        <Info label="Adres" value={address.join(", ") || null} />
        <Info label="Land" value={COUNTRY_LABEL[customer.country] ?? customer.country} />
        <Info label="Taal" value={customer.language === "de" ? "Duits" : "Nederlands"} />
        {customer.notes && (
          <div className="sm:col-span-2">
            <Info label="Notities" value={customer.notes} />
          </div>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Crematies ({customer.cremations.length})</h2>
        {customer.cremations.length === 0 && (
          <p className="text-sm text-foreground-muted">Nog geen crematies bij deze klant.</p>
        )}
        {customer.cremations.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-foreground-muted">{cremationNumberLabel(c.number)}</span>
                <span className="text-sm font-medium">
                  {c.animalName || "Naamloos"} · {KIND_LABEL[c.animalKind]}
                  {c.species ? ` (${c.species})` : ""}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <form action={setCremationStatus.bind(null, c.id, id)} className="flex items-center gap-2">
                <select name="status" defaultValue={c.status} className="rounded-md border border-border bg-surface px-2 py-1 text-xs">
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <button className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-muted">Status opslaan</button>
              </form>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
              <Fact label="Soort crematie" value={TYPE_LABEL[c.cremationType]} />
              <Fact label="Gewicht" value={c.weightKg != null ? `${c.weightKg} kg` : "–"} />
              <Fact label="Prijs (incl. btw)" value={formatCents(c.priceCents)} />
              <Fact label="Overleden" value={formatISOdate(c.dateOfDeath)} />
              <Fact label="Ophaaldatum" value={formatISOdate(c.pickupDate)} />
              <Fact label="Gecremeerd" value={formatISOdate(c.cremationDate)} />
              {c.partner && <Fact label="Via partner" value={c.partner.name} />}
            </dl>
            {c.notes && <p className="mt-2 text-xs text-foreground-muted">{c.notes}</p>}
            <form action={deleteCremation.bind(null, c.id, id)} className="mt-2 text-right">
              <button className="text-xs text-bad-text hover:underline">Verwijderen</button>
            </form>
          </div>
        ))}

        <details className="max-w-3xl rounded-lg border border-border bg-surface p-4" open={customer.cremations.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">Nieuwe crematie voor deze klant</summary>
          <CremationForm customerId={id} />
        </details>
      </section>

      {customer.cremations.length === 0 && (
        <form action={deleteCustomer.bind(null, id)}>
          <button className="text-xs text-bad-text hover:underline">Klant verwijderen</button>
        </form>
      )}
    </div>
  );
}

function Info({ label, value, href }: { label: string; value: string | null | undefined; href?: string }) {
  return (
    <div>
      <div className="text-xs text-foreground-muted">{label}</div>
      {value ? href ? <a href={href} className="hover:underline">{value}</a> : <div className="whitespace-pre-wrap">{value}</div> : <div className="text-foreground-muted">–</div>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
