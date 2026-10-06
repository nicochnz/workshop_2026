"use client";

import { useDashboardData } from "@/hooks/useDashboardData";
import { clearToken } from "@/lib/token";
import { ConnectionBadge } from "./ConnectionBadge";
import { Panel } from "./Panel";

// Aperçu brut des données (étape 2). Remplacé par les vrais composants à l'étape 3.
function Debug({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex min-h-32 flex-1 flex-col gap-2 rounded-lg border border-dashed border-line bg-deep/60 p-3">
      <span className="font-mono text-xs text-muted">{label}</span>
      <pre className="overflow-auto font-mono text-xs text-fg">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export function Dashboard({ token }: { token: string }) {
  const data = useDashboardData(token);
  const last = data.telemetry.at(-1);

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

      {data.loadError && (
        <p role="alert" className="rounded-lg border border-crit/60 bg-crit/10 px-3 py-2 text-sm text-crit">
          ⚠ Historique indisponible : {data.loadError}
        </p>
      )}

      <main className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title="État du boîtier" className="lg:col-span-3">
          <Debug label="status" value={data.status} />
        </Panel>
        <Panel title="Mesures en direct" className="lg:col-span-9">
          <Debug label={`telemetry — ${data.telemetry.length} points, dernière mesure :`} value={last ?? null} />
        </Panel>
        <Panel title="Vision IA" className="lg:col-span-5">
          <Debug label="video" value="Étape 3" />
        </Panel>
        <Panel title="Alertes" className="lg:col-span-4">
          <Debug label={`alerts — ${data.alerts.length}, la plus récente :`} value={data.alerts[0] ?? null} />
        </Panel>
        <Panel title="Commandes" className="lg:col-span-3">
          <Debug label="acks reçus" value={Object.keys(data.acks).length} />
        </Panel>
      </main>
    </div>
  );
}
