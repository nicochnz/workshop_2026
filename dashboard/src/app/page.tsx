import { Panel } from "@/components/Panel";

// Squelette de mise en page (étape 1). Chaque panneau sera remplacé par son composant.
function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 flex-1 items-center justify-center rounded-lg border border-dashed border-line bg-deep/60 font-mono text-sm text-muted">
      {label}
    </div>
  );
}

export default function DashboardPage() {
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
        <span className="rounded-full border border-line px-3 py-1 font-mono text-xs text-muted">Temps réel : à venir</span>
      </header>
      <div className="neon-rule" aria-hidden="true" />

      <main className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Panel title="État du boîtier" className="lg:col-span-3">
          <Placeholder label="En ligne / hors ligne, IP, RSSI" />
        </Panel>
        <Panel title="Mesures en direct" className="lg:col-span-9">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Placeholder label="Température" />
            <Placeholder label="Humidité" />
            <Placeholder label="Gaz" />
            <Placeholder label="Distance" />
          </div>
        </Panel>
        <Panel title="Vision IA" className="lg:col-span-5">
          <Placeholder label="Flux webcam annoté (YOLO)" />
        </Panel>
        <Panel title="Alertes" className="lg:col-span-4">
          <Placeholder label="Historique des alertes" />
        </Panel>
        <Panel title="Commandes" className="lg:col-span-3">
          <Placeholder label="Buzzer · LEDs · SILENCE" />
        </Panel>
      </main>
    </div>
  );
}
