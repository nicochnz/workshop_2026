"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  CategoryScale,
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import type { ChartDataset } from "chart.js";
import { THEME } from "@/lib/theme";

// Enregistrement à la carte : seuls les modules utilisés sont inclus dans le bundle
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

export interface Threshold {
  value: number;
  color: string;
  label: string;
}

interface MetricChartProps {
  title: string;
  unit: string;
  color: string; // couleur de la courbe (THEME)
  labels: string[]; // heures des mesures
  values: (number | null)[];
  thresholds?: Threshold[];
  yMin?: number;
  yMax?: number;
  /** Bornes strictes (plage physique du capteur) au lieu de bornes indicatives */
  fixedRange?: boolean;
  /** Valeur actuelle mise en forme, et sa couleur (classe Tailwind) */
  current: string;
  currentClassName: string;
  badge?: ReactNode;
}

function lineDatasets(color: string, values: (number | null)[], thresholds: Threshold[]): ChartDataset<"line">[] {
  const main: ChartDataset<"line"> = {
    data: values,
    borderColor: color,
    borderWidth: 2,
    tension: 0.35,
    pointRadius: 0,
    spanGaps: false, // un trou = lecture capteur en échec (null)
    fill: true,
    backgroundColor: ({ chart }) => {
      const { ctx, chartArea } = chart;
      if (!chartArea) return "transparent";
      const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, `${color}55`);
      gradient.addColorStop(1, `${color}00`);
      return gradient;
    },
  };
  const limits = thresholds.map<ChartDataset<"line">>((t) => ({
    label: t.label,
    data: values.map(() => t.value),
    borderColor: t.color,
    borderWidth: 2,
    borderDash: [6, 4],
    pointRadius: 0,
    fill: false,
  }));
  return [main, ...limits];
}

// Courbe temps réel : le graphique est créé une fois, puis seulement mis à jour (pas d'animation).
export function MetricChart(props: MetricChartProps) {
  const { title, unit, color, labels, values, thresholds = [], yMin, yMax, fixedRange = false } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<"line"> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { displayColors: false } },
        scales: {
          x: { ticks: { color: THEME.muted, maxTicksLimit: 5, maxRotation: 0 }, grid: { color: `${THEME.line}66` } },
          y: {
            ...(fixedRange ? { min: yMin, max: yMax } : { suggestedMin: yMin, suggestedMax: yMax }),
            ticks: { color: THEME.muted, maxTicksLimit: 5 },
            grid: { color: `${THEME.line}66` },
          },
        },
      },
    });
    chartRef.current = chart;
    return () => chart.destroy();
  }, [yMin, yMax, fixedRange]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data.labels = labels;
    chart.data.datasets = lineDatasets(color, values, thresholds);
    chart.update("none");
  }, [labels, values, color, thresholds]);

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-deep/60 p-3">
      <header className="flex items-start justify-between gap-2">
        <h3 className="text-sm text-muted">{title}</h3>
        {props.badge}
      </header>
      <p className={`neon-glow font-mono text-3xl font-bold ${props.currentClassName}`}>
        {props.current}
        <span className="ml-1 text-base font-normal text-muted">{unit}</span>
      </p>
      <div className="relative h-36">
        <canvas ref={canvasRef} role="img" aria-label={`Courbe ${title}, valeur actuelle ${props.current} ${unit}`} />
      </div>
      {thresholds.length > 0 && (
        <ul className="flex flex-wrap gap-3 text-xs text-muted">
          {thresholds.map((t) => (
            <li key={t.label} className="flex items-center gap-1">
              <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: t.color }} />
              {t.label} ({t.value}{unit && ` ${unit}`})
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
