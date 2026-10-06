import { formatAgo, formatClock } from "@/lib/format";
import { ALERT_LEVEL_STYLES, ALERT_SOURCE_LABELS, ALERT_TYPE_LABELS } from "@/lib/labels";
import type { Alert } from "@/lib/types";

function details(alert: Alert): string | null {
  const parts: string[] = [];
  if (alert.value !== undefined) parts.push(`valeur ${alert.value}`);
  if (alert.score !== undefined) parts.push(`confiance ${Math.round(alert.score * 100)} %`);
  return parts.length ? parts.join(" · ") : null;
}

function AlertItem({ alert, now }: { alert: Alert; now: number }) {
  const level = ALERT_LEVEL_STYLES[alert.level];
  const extra = details(alert);

  return (
    <li
      className={`flex gap-3 rounded-lg border-l-4 bg-deep/60 px-3 py-2 ${level.className} ${
        alert.level === "CRITICAL" ? "shadow-[0_0_16px_-6px_var(--color-crit)]" : ""
      }`}
    >
      <span aria-hidden="true" className="mt-0.5 font-mono text-lg leading-none">
        {level.icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="font-semibold">
            <span className="sr-only">{level.label} : </span>
            {ALERT_TYPE_LABELS[alert.type]}
          </span>
          <time dateTime={new Date(alert.received_at * 1000).toISOString()} className="font-mono text-xs text-muted">
            {formatClock(alert.received_at)} · {formatAgo(alert.received_at, now)}
          </time>
        </p>
        {alert.message && <p className="truncate text-sm text-fg">{alert.message}</p>}
        <p className="font-mono text-xs text-muted">
          {ALERT_SOURCE_LABELS[alert.source]}
          {extra && ` · ${extra}`}
        </p>
      </div>
    </li>
  );
}

// Historique des alertes, la plus récente en haut (contrat §4.3).
export function AlertList({ alerts, now }: { alerts: Alert[]; now: number }) {
  if (alerts.length === 0) {
    return (
      <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-line py-8 text-sm text-muted">
        ✓ Aucune alerte
      </p>
    );
  }

  return (
    <ul aria-label="Historique des alertes" className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
      {alerts.map((alert) => (
        <AlertItem key={alert.id} alert={alert} now={now} />
      ))}
    </ul>
  );
}
