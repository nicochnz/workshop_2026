"use client";

import { useMemo } from "react";
import { formatClock } from "@/lib/format";
import { THEME } from "@/lib/theme";
import { GAS_CRIT, GAS_WARN, gasLevel, PRESENCE_CM } from "@/lib/thresholds";
import type { Telemetry } from "@/lib/types";
import { MetricChart } from "./MetricChart";
import type { Threshold } from "./MetricChart";

// Constantes hors composant : mêmes références à chaque rendu, pas de mise à jour inutile du graphique
const GAS_THRESHOLDS: Threshold[] = [
  { value: GAS_WARN, color: THEME.warn, label: "Alerte" },
  { value: GAS_CRIT, color: THEME.crit, label: "Critique" },
];
const PRESENCE_THRESHOLDS: Threshold[] = [{ value: PRESENCE_CM, color: THEME.accentSoft, label: "Seuil présence" }];

const GAS_BADGES = {
  normal: { text: "✓ Normal", className: "border-ok/60 text-ok" },
  warning: { text: "▲ Alerte", className: "border-warn/70 text-warn" },
  critical: { text: "⬢ Critique", className: "border-crit/80 text-crit bg-crit/15" },
} as const;

const GAS_VALUE_CLASS = { normal: "text-ok", warning: "text-warn", critical: "text-crit" } as const;

function Badge({ text, className }: { text: string; className: string }) {
  return <span className={`rounded-full border px-2 py-0.5 font-mono text-xs ${className}`}>{text}</span>;
}

const show = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? "--" : value.toFixed(digits);

export function LiveCharts({ telemetry }: { telemetry: Telemetry[] }) {
  const series = useMemo(
    () => ({
      labels: telemetry.map((t) => formatClock(t.received_at)),
      temp: telemetry.map((t) => t.temp),
      hum: telemetry.map((t) => t.hum),
      gas: telemetry.map((t) => t.gas),
      dist: telemetry.map((t) => t.dist),
    }),
    [telemetry],
  );

  const last = telemetry.at(-1);
  const level = last ? gasLevel(last.gas) : "normal";
  const presence = last?.presence === 1;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <MetricChart
        title="Température"
        unit="°C"
        color={THEME.info}
        labels={series.labels}
        values={series.temp}
        yMin={15}
        yMax={35}
        current={show(last?.temp, 1)}
        currentClassName="text-info"
      />
      <MetricChart
        title="Humidité"
        unit="%"
        color={THEME.accentSoft}
        labels={series.labels}
        values={series.hum}
        yMin={20}
        yMax={80}
        current={show(last?.hum)}
        currentClassName="text-accent-soft"
      />
      <MetricChart
        title="Gaz (MQ, brut 0-1023)"
        unit=""
        color={THEME.ok}
        labels={series.labels}
        values={series.gas}
        thresholds={GAS_THRESHOLDS}
        yMin={0}
        yMax={1023}
        fixedRange
        current={show(last?.gas)}
        currentClassName={GAS_VALUE_CLASS[level]}
        badge={<Badge {...GAS_BADGES[level]} />}
      />
      <MetricChart
        title="Distance (ultrason)"
        unit="cm"
        color={THEME.fg}
        labels={series.labels}
        values={series.dist}
        thresholds={PRESENCE_THRESHOLDS}
        yMin={0}
        yMax={200}
        current={show(last?.dist)}
        currentClassName={presence ? "text-warn" : "text-fg"}
        badge={
          presence ? (
            <Badge text="▲ Présence" className="border-warn/70 text-warn" />
          ) : (
            <Badge text="✓ Zone libre" className="border-ok/60 text-ok" />
          )
        }
      />
    </div>
  );
}
