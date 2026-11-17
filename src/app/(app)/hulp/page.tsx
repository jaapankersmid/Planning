import { auth } from "@/auth";
import { HELP_GROUPS, topicsFor } from "@/lib/help";
import { HelpList } from "@/components/help-list";

/** "Hoe werkt het?": uitleg per taak, alleen de onderwerpen die bij de rol van de gebruiker horen. */
export default async function HulpPage() {
  const session = await auth();
  if (!session?.user) return null;
  const topics = topicsFor(session.user.role, !!session.user.employeeId);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Hoe werkt het?</h1>
        <p className="text-sm text-foreground-muted">
          Korte uitleg per taak. Klik op een onderwerp om het open te klappen, of zoek een woord. Kom je er niet uit? Gebruik
          de knop Feedback rechtsonder.
        </p>
      </div>
      <HelpList topics={topics} groups={HELP_GROUPS} />
    </div>
  );
}
