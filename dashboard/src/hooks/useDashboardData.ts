"use client";

import { useReducer, useState } from "react";
import { ApiError, fetchAlerts, fetchStatus, fetchTelemetry } from "@/lib/api";
import { dashboardReducer, initialState, MAX_ALERTS, MAX_POINTS } from "@/lib/dashboardState";
import type { DashboardState } from "@/lib/dashboardState";
import { clearToken } from "@/lib/token";
import { useLiveSocket } from "./useLiveSocket";
import type { ConnectionState } from "./useLiveSocket";

export interface DashboardData extends DashboardState {
  connection: ConnectionState;
  loadError: string | null;
}

/**
 * Source unique des données du dashboard : historique REST rechargé à chaque (re)connexion
 * du WebSocket (comble les trous après une coupure), puis mises à jour en direct.
 */
export function useDashboardData(token: string): DashboardData {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSnapshot = async () => {
    try {
      const [status, telemetry, alerts] = await Promise.all([
        fetchStatus(token),
        fetchTelemetry(token, MAX_POINTS),
        fetchAlerts(token, MAX_ALERTS),
      ]);
      dispatch({ type: "snapshot", status, telemetry, alerts });
      setLoadError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return clearToken();
      setLoadError(error instanceof Error ? error.message : "Erreur de chargement");
    }
  };

  const connection = useLiveSocket(token, {
    onReady: () => void loadSnapshot(),
    onMessage: (message) => {
      if (message.event === "telemetry") dispatch({ type: "telemetry", data: message.data });
      else if (message.event === "alert") dispatch({ type: "alert", data: message.data });
      else if (message.event === "status") dispatch({ type: "status", data: message.data });
      else dispatch({ type: "ack", data: message.data });
    },
    onUnauthorized: clearToken,
  });

  return { ...state, connection, loadError };
}
