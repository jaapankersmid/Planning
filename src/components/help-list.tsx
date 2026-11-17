"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { HelpAudience, HelpTopic } from "@/lib/help";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function text(t: HelpTopic) {
  return norm([t.title, t.summary, ...(t.steps ?? []), ...(t.notes ?? []), t.keywords ?? ""].join(" "));
}

/** Zoekbare lijst met hulponderwerpen, per groep. Een #onderwerp in de link klapt dat onderwerp open. */
export function HelpList({ topics, groups }: { topics: HelpTopic[]; groups: { audience: HelpAudience; label: string }[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      setOpenId(id);
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const words = norm(query).split(/\s+/).filter(Boolean);
  const searchable = useMemo(() => new Map(topics.map((t) => [t.id, text(t)])), [topics]);
  const visible = topics.filter((t) => words.every((w) => searchable.get(t.id)!.includes(w)));

  return (
    <div className="flex flex-col gap-5">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Zoek, bijvoorbeeld: ruilen, verlof, uren"
        aria-label="Zoek in de hulp"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base sm:text-sm"
      />
      {visible.length === 0 && <p className="text-sm text-foreground-muted">Niets gevonden. Probeer een ander woord, of vraag het via de knop Feedback.</p>}
      {groups.map((g) => {
        const list = visible.filter((t) => t.audience === g.audience);
        if (list.length === 0) return null;
        return (
          <section key={g.audience} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{g.label}</h2>
            {list.map((t) => (
              <details
                key={t.id}
                id={t.id}
                open={words.length > 0 || openId === t.id}
                onToggle={(e) => {
                  if ((e.currentTarget as HTMLDetailsElement).open) setOpenId(t.id);
                  else if (openId === t.id) setOpenId(null);
                }}
                className="scroll-mt-4 rounded-lg border border-border bg-surface"
              >
                <summary className="cursor-pointer px-4 py-3 text-base font-medium sm:text-sm">{t.title}</summary>
                <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-base leading-relaxed sm:text-sm">
                  <p>{t.summary}</p>
                  {t.steps && (
                    <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                      {t.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  )}
                  {t.notes && (
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-foreground-muted">
                      {t.notes.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                  {t.link && (
                    <Link href={t.link.href} className="w-fit rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-muted">
                      {t.link.label} →
                    </Link>
                  )}
                </div>
              </details>
            ))}
          </section>
        );
      })}
    </div>
  );
}
