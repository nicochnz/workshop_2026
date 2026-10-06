import type { ConnectionState } from "@/hooks/useLiveSocket";

const LABELS: Record<ConnectionState, { text: string; className: string }> = {
  connecting: { text: "Connexion…", className: "border-info text-info" },
  live: { text: "Temps réel", className: "border-ok text-ok" },
  reconnecting: { text: "Reconnexion…", className: "border-warn text-warn" },
  unauthorized: { text: "Accès refusé", className: "border-crit text-crit" },
};

// État du flux temps réel (WebSocket). Texte + couleur : jamais la couleur seule.
export function ConnectionBadge({ state }: { state: ConnectionState }) {
  const { text, className } = LABELS[state];
  return (
    <span role="status" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs ${className}`}>
      <span aria-hidden="true" className={`size-2 rounded-full bg-current ${state === "live" ? "animate-pulse" : ""}`} />
      {text}
    </span>
  );
}
