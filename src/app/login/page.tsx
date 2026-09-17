import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/rooster");

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent">
          Rooster
        </p>
        <h1 className="mt-2 text-xl font-semibold">Inloggen</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          Log in met het account dat een leidinggevende voor je heeft
          aangemaakt. Google Calendar-koppeling stel je apart in, ná het
          inloggen, bij “Mijn rooster”.
        </p>

        <LoginForm />

        <p className="mt-6 text-xs text-foreground-muted">
          Nog geen account? Vraag een leidinggevende om er een voor je aan te
          maken bij “Gebruikers”.
        </p>
      </div>
    </div>
  );
}
