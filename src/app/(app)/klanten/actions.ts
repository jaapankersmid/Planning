"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canManageCustomers } from "@/lib/roles";
import { dateFromISO } from "@/lib/format";
import { parseEuroToCents, STATUS_ORDER } from "@/lib/customers";
import type { AnimalKind, CremationStatus, CremationType } from "@prisma/client";

async function requireAccess() {
  const session = await auth();
  if (!session?.user || !session.user.active || !canManageCustomers(session.user.role)) {
    throw new Error("Geen toegang tot de klantendatabase.");
  }
  return session;
}

const text = (fd: FormData, key: string) => {
  const v = String(fd.get(key) ?? "").trim();
  return v === "" ? null : v;
};

const isoDate = (fd: FormData, key: string) => {
  const v = text(fd, key);
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? dateFromISO(v) : null;
};

export type FormState = { error: string } | undefined;

function customerFields(fd: FormData) {
  const country = text(fd, "country") === "DE" ? "DE" : "NL";
  const language = text(fd, "language") === "de" ? "de" : "nl";
  return {
    name: text(fd, "name"),
    companyName: text(fd, "companyName"),
    email: text(fd, "email")?.toLowerCase() ?? null,
    phone: text(fd, "phone"),
    street: text(fd, "street"),
    postalCode: text(fd, "postalCode"),
    city: text(fd, "city"),
    country,
    language,
    notes: text(fd, "notes"),
  };
}

export async function createCustomer(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAccess();
  const { name, ...rest } = customerFields(fd);
  if (!name) return { error: "Vul een naam in." };
  const customer = await prisma.customer.create({ data: { name, ...rest } });
  revalidatePath("/klanten");
  redirect(`/klanten/${customer.id}`);
}

export async function updateCustomer(id: string, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireAccess();
  const { name, ...rest } = customerFields(fd);
  if (!name) return { error: "Vul een naam in." };
  await prisma.customer.update({ where: { id }, data: { name, ...rest } });
  revalidatePath("/klanten");
  revalidatePath(`/klanten/${id}`);
  redirect(`/klanten/${id}`);
}

/** Een klant met crematies kan niet verwijderd worden; dat zou het dossier stukmaken. */
export async function deleteCustomer(id: string) {
  await requireAccess();
  const count = await prisma.cremation.count({ where: { customerId: id } });
  if (count > 0) throw new Error("Deze klant heeft nog crematies en kan niet worden verwijderd.");
  await prisma.customer.delete({ where: { id } });
  revalidatePath("/klanten");
  redirect("/klanten");
}

export async function createCremation(customerId: string, _prev: FormState, fd: FormData): Promise<FormState> {
  await requireAccess();
  const kind = text(fd, "animalKind") === "PAARD" ? "PAARD" : "HUISDIER";
  const typeRaw = text(fd, "cremationType");
  const cremationType: CremationType =
    typeRaw === "GEZAMENLIJK" || typeRaw === "DIRECT" ? typeRaw : "INDIVIDUEEL";
  const weightRaw = text(fd, "weightKg");
  const weightKg = weightRaw ? Number(weightRaw.replace(",", ".")) : null;
  if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0)) {
    return { error: "Het gewicht is geen geldig getal." };
  }
  const priceRaw = text(fd, "price");
  const priceCents = priceRaw ? parseEuroToCents(priceRaw) : null;
  if (priceRaw && priceCents === null) return { error: "De prijs is geen geldig bedrag." };

  await prisma.cremation.create({
    data: {
      customerId,
      animalKind: kind as AnimalKind,
      animalName: text(fd, "animalName"),
      species: text(fd, "species"),
      weightKg,
      cremationType,
      dateOfDeath: isoDate(fd, "dateOfDeath"),
      pickupDate: isoDate(fd, "pickupDate"),
      priceCents,
      notes: text(fd, "notes"),
    },
  });
  revalidatePath(`/klanten/${customerId}`);
  revalidatePath("/klanten");
  redirect(`/klanten/${customerId}`);
}

export async function setCremationStatus(id: string, customerId: string, fd: FormData) {
  await requireAccess();
  const status = String(fd.get("status") ?? "") as CremationStatus;
  if (!STATUS_ORDER.includes(status)) throw new Error("Ongeldige status.");
  const current = await prisma.cremation.findUnique({ where: { id }, select: { cremationDate: true } });
  await prisma.cremation.update({
    where: { id },
    data: {
      status,
      // De cremeerdatum vullen we zodra de status "gecremeerd" wordt en nog leeg is.
      ...(status === "GECREMEERD" && !current?.cremationDate
        ? { cremationDate: dateFromISO(new Date().toISOString().slice(0, 10)) }
        : {}),
    },
  });
  revalidatePath(`/klanten/${customerId}`);
  revalidatePath("/klanten");
}

export async function deleteCremation(id: string, customerId: string) {
  await requireAccess();
  await prisma.cremation.delete({ where: { id } });
  revalidatePath(`/klanten/${customerId}`);
  revalidatePath("/klanten");
}
