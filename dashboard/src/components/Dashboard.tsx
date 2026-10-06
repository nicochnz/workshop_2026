"use client";

import { useDashboardData } from "@/hooks/useDashboardData";
import { useNow } from "@/hooks/useNow";
import { clearToken } from "@/lib/token";
import { AlertBanner } from "./AlertBanner";
import { AlertList } from "./AlertList";
import { ConnectionBadge } from "./ConnectionBadge";
import { ControlPanel } from "./ControlPanel";
import { LiveCharts } from "./LiveCharts";
import { Panel } from "./Panel";
import { StatusCard } from "./StatusCard";
import { VideoFeed } from "./VideoFeed";

export function Dashboard({ token }: { token: string }) {
  const data = useDashboardData(token);
  const now = useNow();
  const lastMeasureAt = data.telemetry.at(-1)?.received_at ?? null;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-3xl font-bold tracking-[0.2em] text-fg">
            <span className="neon-glow text-info">SENTINEL</span>
            <span className="neon-glow text-ok">-X</span>
          </h1>
          <p className="font-mono text-xs tracking-[0.3em] text-muted uppercase">
            Centre de supervision · boîtier SX-003 · groupe 3
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionBadge state={data.connection} />
          <button
            type="button"
            onClick={clearToken}
            className="rounded-full border border-line px-3 py-1 font-mono text-xs text-muted transition hover:border-accent-soft hover:text-accent-soft"
          >
            Déconnexion
          </button>
        </div>
      </header>
      <div className="neon-rule" aria-hidden="true" />

      <AlertBanner alerts={data.alerts} status={data.status} now={now} />

      {data.loadError && (
        <p role="alert" className="rounded-lg border border-crit/60 bg-crit/10 px-3 py-2 text-sm text-crit">
          ⚠ Historique indisponible : {data.loadError}
        </p>
      )}

      <main className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title="État du boîtier" className="lg:col-span-3">
          <StatusCard status={data.status} lastMeasureAt={lastMeasureAt} now={now} />
        </Panel>
        <Panel title="Mesures en direct" className="lg:col-span-9">
          <LiveCharts telemetry={data.telemetry} />
        </Panel>
        <Panel title="Vision IA" className="lg:col-span-5">
          <VideoFeed />
        </Panel>
        <Panel
          title="Alertes"
          className="lg:col-span-4"
          aside={<span className="font-mono text-xs text-muted">{data.alerts.length}</span>}
        >
          <AlertList alerts={data.alerts} now={now} />
        </Panel>
        <Panel title="Commandes" className="lg:col-span-3">
          <ControlPanel token={token} acks={data.acks} now={now} />
        </Panel>
      </main>
    </div>
  );
}
