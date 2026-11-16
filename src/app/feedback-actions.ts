"use server";

import { auth } from "@/auth";
import { escapeHtml, isMailConfigured, sendMail } from "@/lib/mail";
import { tooMany } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

export type FeedbackState = { ok?: boolean; error?: string } | undefined;

export async function sendFeedback(_prev: FeedbackState, fd: FormData): Promise<FeedbackState> {
  const session = await auth();
  if (!session?.user) return { error: "Je bent niet ingelogd." };
  const message = String(fd.get("message") ?? "").trim().slice(0, 4000);
  const kind = String(fd.get("kind") ?? "Idee").slice(0, 20);
  const page = String(fd.get("page") ?? "").slice(0, 200);
  if (message.length < 3) return { error: "Typ eerst je feedback." };
  if (tooMany(`feedback:${session.user.id}`, 10, 60 * 60 * 1000)) return { error: "Je hebt veel feedback gestuurd; probeer het over een uur nog eens." };
  if (!(await isMailConfigured())) return { error: "Versturen is nu niet mogelijk (mail is niet ingesteld)." };
  const text = `${message}\n\n--\nVan: ${session.user.name} <${session.user.email ?? "onbekend"}>\nRol: ${session.user.role}\nProgramma: Rooster\nPagina: ${page}`;
  try {
    await sendMail({
      to: (await getSettings()).feedbackTo,
      subject: `Feedback Rooster (${kind}) van ${session.user.name}`,
      text,
      html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    });
    return { ok: true };
  } catch {
    return { error: "Versturen is niet gelukt. Probeer het later opnieuw." };
  }
}
