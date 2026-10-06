import type { Ack, Alert, Status, Telemetry } from "./types";

// État du dashboard et ses transitions. Fonctions pures : faciles à relire et à tester.

export const MAX_POINTS = 150; // 5 min de mesures à 2 s
export const MAX_ALERTS = 50;
const MAX_ACKS = 20;

export interface DashboardState {
  status: Status | null;
  telemetry: Telemetry[]; // plus ancienne → plus récente
  alerts: Alert[]; // plus récente d'abord
  acks: Record<string, Ack>; // par id de commande
  loaded: boolean; // historique REST reçu au moins une fois
}

export const initialState: DashboardState = { status: null, telemetry: [], alerts: [], acks: {}, loaded: false };

export type DashboardAction =
  | { type: "snapshot"; status: Status | null; telemetry: Telemetry[]; alerts: Alert[] }
  | { type: "telemetry"; data: Telemetry }
  | { type: "alert"; data: Alert }
  | { type: "status"; data: Status }
  | { type: "ack"; data: Ack };

const telemetryKey = (t: Telemetry) => `${t.received_at}-${t.seq}`;

// Historique REST + mesures live arrivées pendant le chargement, sans doublon
function mergeTelemetry(history: Telemetry[], live: Telemetry[]): Telemetry[] {
  const seen = new Set(history.map(telemetryKey));
  const lastAt = history.at(-1)?.received_at ?? 0;
  const newer = live.filter((t) => t.received_at >= lastAt && !seen.has(telemetryKey(t)));
  return [...history, ...newer].slice(-MAX_POINTS);
}

function mergeAlerts(history: Alert[], live: Alert[]): Alert[] {
  const byId = new Map([...history, ...live].map((a) => [a.id, a]));
  return [...byId.values()].sort((a, b) => b.id - a.id).slice(0, MAX_ALERTS);
}

export function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "snapshot":
      return {
        ...state,
        status: action.status ?? state.status,
        telemetry: mergeTelemetry(action.telemetry, state.telemetry),
        alerts: mergeAlerts(action.alerts, state.alerts),
        loaded: true,
      };
    case "telemetry":
      return { ...state, telemetry: [...state.telemetry, action.data].slice(-MAX_POINTS) };
    case "alert":
      return { ...state, alerts: mergeAlerts(state.alerts, [action.data]) };
    case "status":
      return { ...state, status: action.data };
    case "ack": {
      const recent = Object.entries(state.acks).slice(-(MAX_ACKS - 1));
      return { ...state, acks: { ...Object.fromEntries(recent), [action.data.id]: action.data } };
    }
  }
}
