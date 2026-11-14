import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/roles";
import { CustomerForm } from "@/components/customer-form";
import { updateCustomer } from "../../actions";

export default async function KlantBewerkenPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageCustomers(session.user.role)) redirect("/rooster");
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) notFound();
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">Klant bewerken</h1>
      <CustomerForm
        action={updateCustomer.bind(null, id)}
        values={customer}
        submitLabel="Wijzigingen opslaan"
        cancelHref={`/klanten/${id}`}
      />
    </div>
  );
}
