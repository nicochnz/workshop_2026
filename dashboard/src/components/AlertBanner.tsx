"use client";

import { useEffect, useState } from "react";
import { formatAgo } from "@/lib/format";
import { ALERT_SOURCE_LABELS, ALERT_TYPE_LABELS } from "@/lib/labels";
import type { Alert, Status } from "@/lib/types";

const BANNER_WINDOW_S = 120; // une alerte critique reste en bandeau 2 min, sauf acquittement
const DEFAULT_TITLE = "Sentinel-X — Supervision SX-003";

interface AlertBannerProps {
  alerts: Alert[];
  status: Status | null;
  now: number;
}

// Bandeaux en haut de page : boîtier hors ligne et dernière alerte critique non acquittée.
export function AlertBanner({ alerts, status, now }: AlertBannerProps) {
  const [acknowledged, setAcknowledged] = useState<Set<number>>(() => new Set());

  const critical = alerts.find(
    (a) => a.level === "CRITICAL" && now / 1000 - a.received_at < BANNER_WINDOW_S && !acknowledged.has(a.id),
  );
  const offline = status?.state === "offline";

  // Titre de l'onglet : l'alerte se voit même quand l'onglet est en arrière-plan
  useEffect(() => {
    document.title = critical || offline ? `⚠ ALERTE — ${DEFAULT_TITLE}` : DEFAULT_TITLE;
  }, [critical, offline]);

  if (!critical && !offline) return null;

  return (
    <div className="flex flex-col gap-3">
      {offline && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border-2 border-crit bg-crit/15 px-4 py-3 text-crit">
          <span aria-hidden="true" className="text-2xl">⏻</span>
          <p className="font-mono font-bold tracking-widest uppercase">Boîtier SX-003 hors ligne</p>
          <span className="text-sm text-fg">Plus aucune donnée reçue — vérifier l&apos;alimentation et le Wi-Fi.</span>
        </div>
      )}
      {critical && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-crit bg-crit/15 px-4 py-3 animate-alarm"
        >
          <span aria-hidden="true" className="neon-glow text-3xl text-crit">⬢</span>
          <div className="min-w-0 flex-1">
            <p className="neon-glow font-mono text-lg font-bold tracking-widest text-crit uppercase">
              Alerte critique · {ALERT_TYPE_LABELS[critical.type]}
            </p>
            <p className="text-sm text-fg">
              {critical.message ?? "Sans message"} — {ALERT_SOURCE_LABELS[critical.source]},{" "}
              {formatAgo(critical.received_at, now)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAcknowledged((set) => new Set(set).add(critical.id))}
            className="rounded-lg border-2 border-crit px-4 py-2 font-mono font-bold tracking-widest text-crit uppercase transition hover:bg-crit hover:text-deep"
          >
            Acquitter
          </button>
        </div>
      )}
    </div>
  );
}
