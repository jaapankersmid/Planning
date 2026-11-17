"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateTempPassword, hashPassword } from "@/lib/password";
import { isMailConfigured, sendMail } from "@/lib/mail";
import { pendingNotificationCount, processDueNotifications } from "@/lib/notifications";
import { pendingAvailabilityCount, processAvailabilityAlerts } from "@/lib/planner-alerts";
import { pendingHoursChangeCount, processHoursChanges } from "@/lib/hours-mail";
import { ROLE_OPTIONS } from "@/lib/roles";
import { syncHubAccess } from "@/lib/hub-access";
import { sendWelcomeMail, type WelcomeMailResult } from "@/lib/welcome-mail";
import type { Role } from "@prisma/client";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    throw new Error("Alleen leidinggevenden kunnen gebruikers beheren.");
  }
  return session;
}

export type CreateUserState =
  | { error: string }
  | { success: { email: string; tempPassword: string | null; mustChange: boolean; welcomeMail: WelcomeMailResult | "off" } }
  | undefined;

/**
 * Leest een door de planner gekozen wachtwoord uit het formulier. Leeg laten
 * betekent: laat de app er een genereren (geeft dan null terug).
 */
function readChosenPassword(formData: FormData): { password: string | null } | { error: string } {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("passwordConfirm") ?? "");
  if (!password && !confirm) return { password: null };
  if (password.length < 8) return { error: "Een wachtwoord moet minstens 8 tekens zijn." };
  if (password.length > 128) return { error: "Een wachtwoord mag maximaal 128 tekens zijn." };
  if (password !== confirm) return { error: "De twee wachtwoorden komen niet overeen." };
  return { password };
}

/**
 * Maakt een account aan met een gegenereerd tijdelijk wachtwoord. Dat
 * wachtwoord wordt maar op één plek getoond — hier, in het resultaat van
 * deze actie — en moet dus meteen doorgegeven worden aan de medewerker. Bij
 * de eerste keer inloggen wordt een eigen wachtwoord verplicht gesteld.
 */
export async function createUser(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "EMPLOYEE") as Role;
  if (!ROLE_OPTIONS.some((r) => r.value === role)) return { error: "Kies een geldige rol." };
  const employeeId = String(formData.get("employeeId") ?? "").trim() || null;

  if (!name || !email) {
    return { error: "Naam en e-mailadres zijn verplicht." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Er bestaat al een account met dit e-mailadres." };
  }

  const chosen = readChosenPassword(formData);
  if ("error" in chosen) return chosen;
  const tempPassword = chosen.password ?? generateTempPassword();
  // Een gegenereerd wachtwoord moet altijd gewijzigd worden; bij een zelf gekozen wachtwoord
  // beslist het vinkje (standaard aan).
  const mustChange = chosen.password === null ? true : formData.get("mustChange") === "on";

  await prisma.user.create({
    data: {
      name,
      email,
      role,
      employeeId,
      passwordHash: hashPassword(tempPassword),
      mustChangePassword: mustChange,
    },
  });

  // Welkomstmail (standaard aan). Het account bestaat al; een mislukte mail verandert daar niets aan.
  const welcomeMail = formData.get("welcomeMail") === "on"
    ? await sendWelcomeMail({ name, email, password: tempPassword, mustChange })
    : "off";

  revalidatePath("/gebruikers");
  revalidatePath("/medewerkers");
  return {
    success: { email, tempPassword: chosen.password === null ? tempPassword : null, mustChange, welcomeMail },
  };
}

export type ResetPasswordState =
  | { tempPassword: string | null }
  | { error: string }
  | undefined;

export async function resetPassword(
  userId: string,
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  await requireAdmin();

  const chosen = readChosenPassword(formData);
  if ("error" in chosen) return chosen;
  const password = chosen.password ?? generateTempPassword();
  const mustChange = chosen.password === null ? true : formData.get("mustChange") === "on";

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: hashPassword(password), mustChangePassword: mustChange },
  });

  revalidatePath("/gebruikers");
  return { tempPassword: chosen.password === null ? password : null };
}

export async function setUserActive(userId: string, active: boolean) {
  const session = await requireAdmin();
  // Je eigen account uitzetten zou je buitensluiten; dat negeren we.
  if (!active && userId === session.user.id) return;
  const updated = await prisma.user.update({ where: { id: userId }, data: { active } });
  await syncHubAccess(updated);
  revalidatePath("/gebruikers");
}

/**
 * Wijzigt de rol (en daarmee de rechten) van een gebruiker. Alleen planners mogen dit. Je kunt je
 * eigen rol niet wijzigen, en er moet altijd minstens één actieve planner overblijven.
 */
export async function setUserRole(userId: string, role: Role): Promise<{ error: string } | void> {
  const session = await requireAdmin();
  if (!ROLE_OPTIONS.some((r) => r.value === role)) return { error: "Onbekende rol." };
  if (userId === session.user.id) return { error: "Je kunt je eigen rol niet wijzigen." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return { error: "Gebruiker niet gevonden." };
  if (target.role === "ADMIN" && role !== "ADMIN") {
    const otherPlanners = await prisma.user.count({
      where: { role: "ADMIN", active: true, NOT: { id: userId } },
    });
    if (otherPlanners === 0) return { error: "Er moet minstens één actieve planner overblijven." };
  }

  const updated = await prisma.user.update({ where: { id: userId }, data: { role } });
  await syncHubAccess(updated);
  revalidatePath("/gebruikers");
}

const HUB_ROLES = ["STAFF", "ACCOUNTING", "ADMIN"];

/** Geeft een gebruiker toegang tot het crematorium-programma (met een rol daar) of haalt die weg (lege waarde). */
export async function setHubAccess(userId: string, value: string | null): Promise<{ error: string } | void> {
  await requireAdmin();
  if (value && !HUB_ROLES.includes(value)) return { error: "Onbekende rol." };
  const updated = await prisma.user.update({ where: { id: userId }, data: { hubRole: value || null } });
  // Best effort: is de Hub even niet bereikbaar, dan geldt de nieuwe rol zodra het account de volgende keer doorklikt.
  await syncHubAccess(updated);
  revalidatePath("/gebruikers");
}

/** Koppelt een medewerker aan een gebruiker (of ontkoppelt met null). Eén medewerker kan maar bij één account horen. */
export async function linkEmployee(
  userId: string,
  employeeId: string | null,
): Promise<{ error: string } | void> {
  await requireAdmin();

  if (employeeId) {
    const taken = await prisma.user.findFirst({
      where: { employeeId, NOT: { id: userId } },
    });
    if (taken) {
      return { error: `Al gekoppeld aan ${taken.name}.` };
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { employeeId } });
  revalidatePath("/gebruikers");
  revalidatePath("/medewerkers");
  revalidatePath("/rooster/mijn");
}

export type MailActionState = { ok: boolean; message: string } | undefined;

/** Stuurt een testmail naar het e-mailadres van de ingelogde planner. */
export async function sendTestMail(): Promise<MailActionState> {
  const session = await requireAdmin();
  if (!(await isMailConfigured())) {
    return { ok: false, message: "E-mail is nog niet ingesteld: vul de SMTP-server en gebruikersnaam in bij Instellingen en SMTP_PASSWORD in .env." };
  }
  const to = session.user.email;
  if (!to) return { ok: false, message: "Je account heeft geen e-mailadres." };
  try {
    await sendMail({
      to,
      subject: "Testmail van het rooster",
      text: "Dit is een testmail. Als je dit leest, werkt het versturen van e-mail vanuit de roosterapp.",
      html: "<p>Dit is een testmail. Als je dit leest, werkt het versturen van e-mail vanuit de roosterapp.</p>",
    });
    return { ok: true, message: `Testmail verstuurd naar ${to}.` };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Versturen mislukt: ${detail}` };
  }
}

/** Verstuurt de wachtende meldingen meteen, zonder de pauze af te wachten. */
export async function sendPendingNow(): Promise<MailActionState> {
  await requireAdmin();
  if (!(await isMailConfigured())) {
    return { ok: false, message: "E-mail is nog niet ingesteld." };
  }
  const before = (await pendingNotificationCount()) + (await pendingAvailabilityCount()) + (await pendingHoursChangeCount());
  await processDueNotifications({ force: true });
  await processAvailabilityAlerts({ force: true });
  await processHoursChanges({ force: true });
  const after = (await pendingNotificationCount()) + (await pendingAvailabilityCount()) + (await pendingHoursChangeCount());
  revalidatePath("/gebruikers");
  return {
    ok: after === 0,
    message:
      after === 0
        ? before === 0
          ? "Er stonden geen meldingen klaar."
          : "Alle wachtende meldingen zijn verstuurd."
        : `${before - after} melding(en) verstuurd, bij ${after} is het niet gelukt (de app probeert het automatisch opnieuw).`,
  };
}
