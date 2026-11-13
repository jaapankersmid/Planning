import { colorGroupSwatch } from "@/lib/format";

/** Tabelrij die een nieuwe kleurgroep aankondigt, zoals in het rooster en het vaste rooster. */
export function GroupHeaderRow({ group, colSpan }: { group: string | null; colSpan: number }) {
  return (
    <tr className="border-b border-border bg-surface-muted/60">
      <td colSpan={colSpan} className="px-4 py-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: group ? (colorGroupSwatch[group] ?? "#9aa39a") : "#9aa39a" }} />
          {group ?? "Zonder kleurgroep"}
        </span>
      </td>
    </tr>
  );
}
