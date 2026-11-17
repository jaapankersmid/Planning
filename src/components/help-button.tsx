import { helpTopic } from "@/lib/help";
import { HelpPopover } from "@/components/help-popover";

/** Klein ?-knopje met de korte uitleg van een hulponderwerp en een link naar de hele uitleg op /hulp. */
export function HelpButton({ topic }: { topic: string }) {
  const t = helpTopic(topic);
  if (!t) return null;
  return <HelpPopover t={{ id: t.id, title: t.title, summary: t.summary }} />;
}
