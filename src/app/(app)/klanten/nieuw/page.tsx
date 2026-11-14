import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canManageCustomers } from "@/lib/roles";
import { CustomerForm } from "@/components/customer-form";
import { createCustomer } from "../actions";

export default async function NieuweKlantPage() {
  const session = await auth();
  if (!session?.user || !canManageCustomers(session.user.role)) redirect("/rooster");
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-lg font-semibold">Nieuwe klant</h1>
      <CustomerForm action={createCustomer} submitLabel="Klant opslaan" cancelHref="/klanten" />
    </div>
  );
}
