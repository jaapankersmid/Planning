import type { TimesheetStatus } from "@prisma/client";
import { STATUS_LABEL } from "@/lib/timesheet-labels";

const STYLE: Record<TimesheetStatus | "NONE", string> = {
  NONE: "bg-surface-muted text-foreground-muted",
  DRAFT: "bg-surface-muted text-foreground-muted",
  SUBMITTED: "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100",
  APPROVED: "bg-good text-good-text",
  RETURNED: "bg-bad text-bad-text",
};

export function TimesheetStatusBadge({ status }: { status: TimesheetStatus | "NONE" }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}>{STATUS_LABEL[status]}</span>;
}
