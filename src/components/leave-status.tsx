const LABELS: Record<string, { text: string; className: string }> = {
  PENDING: { text: "in behandeling", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  APPROVED: { text: "goedgekeurd", className: "bg-good text-good-text" },
  REJECTED: { text: "afgewezen", className: "bg-bad text-bad-text" },
  CANCELLED: { text: "ingetrokken", className: "bg-surface-muted text-foreground-muted" },
};

export function LeaveStatusBadge({ status }: { status: string }) {
  const label = LABELS[status] ?? LABELS.CANCELLED;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${label.className}`}>
      {label.text}
    </span>
  );
}
