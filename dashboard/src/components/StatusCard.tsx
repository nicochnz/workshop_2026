import type { ReactNode } from "react";
import { formatAgo, formatUptime, rssiQuality } from "@/lib/format";
import { STALE_AFTER_S } from "@/lib/thresholds";
import type { Status } from "@/lib/types";

interface StatusCardProps {
  status: Status | null;
  lastMeasureAt: number | null; // received_at de la dernière mesure
  now: number;
}

function SignalBars({ bars }: { bars: number }) {
  return (
    <span aria-hidden="true" className="inline-flex h-4 items-end gap-0.5">
      {[1, 2, 3, 4].map((level) => (
        <span
          key={level}
          style={{ height: `${level * 25}%` }}
          className={`w-1.5 rounded-sm ${level <= bars ? "bg-info shadow-[0_0_6px_var(--color-info)]" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/60 py-2 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-mono text-sm text-fg">{children}</dd>
    </div>
  );
}

export function StatusCard({ status, lastMeasureAt, now }: StatusCardProps) {
  const online = status?.state === "online";
  const stale = lastMeasureAt !== null && now / 1000 - lastMeasureAt > STALE_AFTER_S;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div
        role="status"
        className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
          online ? "border-ok/60 bg-ok/10 text-ok" : "border-crit/70 bg-crit/10 text-crit"
        }`}
      >
        <span aria-hidden="true" className={`size-3 rounded-full bg-current shadow-[0_0_12px_currentColor] ${online ? "animate-pulse" : ""}`} />
        <span className="neon-glow font-mono text-xl font-bold tracking-widest uppercase">
          {status === null ? "Inconnu" : online ? "En ligne" : "Hors ligne"}
        </span>
      </div>

      <dl className="flex flex-col">
        <Row label="Boîtier">{status?.device ?? "SX-003"}</Row>
        {status?.state === "online" && (
          <>
            <Row label="Adresse IP">{status.ip}</Row>
            <Row label="Signal Wi-Fi">
              <SignalBars bars={rssiQuality(status.rssi).bars} />
              {status.rssi} dBm · {rssiQuality(status.rssi).label}
            </Row>
            <Row label="En service depuis">{formatUptime(status.uptime_s)}</Row>
            <Row label="Firmware">{status.fw}</Row>
          </>
        )}
        <Row label="Dernière mesure">
          {lastMeasureAt === null ? (
            "—"
          ) : (
            <span className={stale ? "text-warn" : ""}>
              {stale && "▲ "}
              {formatAgo(lastMeasureAt, now)}
            </span>
          )}
        </Row>
      </dl>
    </div>
  );
}
