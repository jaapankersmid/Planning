"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function claimEmployee(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const employeeId = formData.get("employeeId");
  if (typeof employeeId !== "string" || !employeeId) {
    throw new Error("Kies je naam uit de lijst.");
  }

  // Voorkomt dat iemand de naam van een collega claimt die al gekoppeld is.
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { user: true },
  });
  if (!employee || employee.user) {
    throw new Error("Deze medewerker is al gekoppeld aan een account.");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { employeeId },
  });

  redirect("/rooster");
}
