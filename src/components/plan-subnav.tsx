import Link from "next/link";

const tabs = [
  { key: "voorstel", href: "/planvoorstel", label: "Voorstel" },
  { key: "behoefte", href: "/planvoorstel/behoefte", label: "Behoefte" },
  { key: "instellingen", href: "/planvoorstel/instellingen", label: "Tags en kleurgroepen" },
];

export function PlanSubnav({ current }: { current: "voorstel" | "behoefte" | "instellingen" }) {
  return (
    <div className="flex flex-wrap gap-1 text-sm">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={`rounded-md px-3 py-1.5 font-medium ${current === t.key ? "bg-accent-soft text-accent" : "text-foreground-muted hover:bg-surface-muted"}`}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
