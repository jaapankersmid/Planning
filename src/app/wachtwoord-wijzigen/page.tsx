import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChangePasswordForm } from "@/components/change-password-form";

export default async function WachtwoordWijzigenPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Wachtwoord instellen</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          {session.user.mustChangePassword
            ? "Je logt nog in met een tijdelijk wachtwoord. Kies hieronder je eigen wachtwoord."
            : "Wijzig je wachtwoord."}
        </p>

        <ChangePasswordForm forced={session.user.mustChangePassword} />
        {!session.user.mustChangePassword && (
          <a href="/rooster/mijn" className="mt-4 inline-block text-sm underline hover:no-underline">
            ← terug naar de app
          </a>
        )}
      </div>
    </div>
  );
}
