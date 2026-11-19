import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SETTING_DEFS, fallbackValue, getStoredSettings, invalidateSettings, secretStatus } from "@/lib/settings";
import { SettingsForm } from "@/components/settings-form";

export const dynamic = "force-dynamic";

export default async function InstellingenPage() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") redirect("/rooster");

  invalidateSettings();
  const stored = await getStoredSettings();
  const changes = await prisma.appSettingChange.findMany({ orderBy: { createdAt: "desc" }, take: 30 }).catch(() => []);
  const labels = new Map<string, string>([...SETTING_DEFS.map((d) => [d.key, d.label] as [string, string]), ["leaveOvertime", "Overwerk bijschrijven bij verlof (Verlofuren)"]]);
  const fmt = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });

  const fields = SETTING_DEFS.map((d) => {
    const fb = fallbackValue(d.key);
    return {
      key: d.key,
      label: d.label,
      group: d.group,
      kind: d.kind,
      help: "help" in d ? d.help : undefined,
      value: stored.get(d.key) ?? "",
      fallback: fb.value,
      fallbackSource: fb.source,
      env: "env" in d ? d.env : undefined,
    };
  });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">Instellingen</h1>
        <p className="text-sm text-foreground-muted">
          Bedrijfsgegevens en mailinstellingen. Een leeg veld gebruikt de waarde uit het .env-bestand op de server, of de standaard. Wachtwoorden en sleutels staan hier niet: die blijven in .env.
        </p>
      </div>

      <SettingsForm fields={fields} />

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Geheimen in .env</h2>
        <p className="mb-2 text-xs text-foreground-muted">Deze waarden staan alleen in het .env-bestand op de server en zijn hier niet te zien of te wijzigen.</p>
        <ul className="text-sm">
          {secretStatus().map((s) => (
            <li key={s.env} className="flex justify-between gap-3 border-b border-border py-1 last:border-b-0">
              <span>{s.label} <code className="text-xs text-foreground-muted">{s.env}</code></span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.set ? "bg-good text-good-text" : "bg-bad text-bad-text"}`}>{s.set ? "ingesteld" : "niet ingesteld"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Logboek</h2>
        <p className="mb-2 text-xs text-foreground-muted">De laatste 30 wijzigingen. Leeg = terug naar .env of de standaard.</p>
        {changes.length === 0 ? (
          <p className="text-sm text-foreground-muted">Nog geen wijzigingen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-foreground-muted">
                  <th className="py-1 pr-3 font-medium">Wanneer</th>
                  <th className="py-1 pr-3 font-medium">Wie</th>
                  <th className="py-1 pr-3 font-medium">Instelling</th>
                  <th className="py-1 font-medium">Oud → nieuw</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top">
                    <td className="py-1 pr-3 whitespace-nowrap tabular-nums">{fmt.format(c.createdAt)}</td>
                    <td className="py-1 pr-3">{c.changedByName ?? "onbekend"}</td>
                    <td className="py-1 pr-3">{labels.get(c.key) ?? c.key}</td>
                    <td className="py-1 break-all">{c.oldValue ?? <em className="text-foreground-muted">leeg</em>} → {c.newValue ?? <em className="text-foreground-muted">leeg</em>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
