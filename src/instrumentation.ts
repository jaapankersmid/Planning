/**
 * Draait één keer bij het starten van de server. Start een timer die elke
 * minuut kijkt of er gebundelde mails (ingeplande diensten, aangepaste beschikbaarheid, aangepaste uren) klaarstaan.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const globalWithTimer = globalThis as typeof globalThis & { __notifyTimer?: NodeJS.Timeout };
  if (globalWithTimer.__notifyTimer) return;

  const { processDueNotifications } = await import("@/lib/notifications");
  const { processAvailabilityAlerts } = await import("@/lib/planner-alerts");
  const { processHoursChanges } = await import("@/lib/hours-mail");
  globalWithTimer.__notifyTimer = setInterval(() => {
    processDueNotifications().catch((error) => console.error("Mailwachtrij mislukt:", error));
    processAvailabilityAlerts().catch((error) => console.error("Mailwachtrij beschikbaarheid mislukt:", error));
    processHoursChanges().catch((error) => console.error("Mailwachtrij uren mislukt:", error));
  }, 60_000);
}
