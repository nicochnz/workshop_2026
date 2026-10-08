"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ApiError, sendCommand } from "@/lib/api";
import { clearToken } from "@/lib/token";
import type { Ack, CommandInput } from "@/lib/types";

const ACK_TIMEOUT_MS = 5000;
const MAX_HISTORY = 5;
const BUZZER_DURATIONS = [1000, 3000, 5000, 10000]; // plafond firmware : 10 s

interface Sent {
  key: number;
  label: string;
  sentAt: number;
  commandId?: string; // id renvoyé par l'API (202)
  error?: string; // refus de l'API avant envoi au boîtier
}

type Outcome = { text: string; className: string };

function outcome(entry: Sent, acks: Record<string, Ack>, now: number): Outcome {
  if (entry.error) return { text: `✕ ${entry.error}`, className: "text-crit" };
  const ack = entry.commandId ? acks[entry.commandId] : undefined;
  if (ack?.ok) return { text: "✓ Commande exécutée", className: "text-ok" };
  if (ack) return { text: "✕ Refusée par le boîtier", className: "text-crit" };
  if (now - entry.sentAt > ACK_TIMEOUT_MS) return { text: "▲ Pas de réponse du boîtier", className: "text-warn" };
  return { text: "… En attente du boîtier", className: "text-info" };
}

function apiErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erreur inattendue";
  if (error.status === 503) return "Broker MQTT injoignable";
  if (error.status === 429) return "Trop de commandes, patientez";
  if (error.status === 0) return "API injoignable";
  return error.message;
}

const BASE_BUTTON =
  "rounded-lg border px-3 py-2 font-mono text-sm font-semibold tracking-wide transition hover:brightness-125 disabled:opacity-50";

function ActuatorRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-deep/60 p-3">
      <legend className="px-1 text-sm text-muted">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </fieldset>
  );
}

interface ControlPanelProps {
  token: string;
  acks: Record<string, Ack>;
  now: number;
}

export function ControlPanel({ token, acks, now }: ControlPanelProps) {
  const [history, setHistory] = useState<Sent[]>([]);
  const [sending, setSending] = useState(false);
  const [buzzerMs, setBuzzerMs] = useState(3000);

  const send = async (label: string, command: CommandInput) => {
    setSending(true);
    const entry: Sent = { key: Date.now() + Math.random(), label, sentAt: Date.now() };
    try {
      const { id } = await sendCommand(token, command);
      entry.commandId = id;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return clearToken();
      entry.error = apiErrorText(error);
    } finally {
      setSending(false);
    }
    setHistory((h) => [entry, ...h].slice(0, MAX_HISTORY));
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      <ActuatorRow label="Buzzer">
        <label htmlFor="buzzer-duration" className="sr-only">
          Durée du buzzer
        </label>
        <select
          id="buzzer-duration"
          value={buzzerMs}
          onChange={(e) => setBuzzerMs(Number(e.target.value))}
          className="rounded-lg border border-line bg-panel px-2 py-2 font-mono text-sm text-fg"
        >
          {BUZZER_DURATIONS.map((ms) => (
            <option key={ms} value={ms}>
              {ms / 1000} s
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={sending}
          onClick={() => send(`Buzzer ${buzzerMs / 1000} s`, { action: "BUZZER", state: "ON", duration_ms: buzzerMs })}
          className={`${BASE_BUTTON} border-warn/70 text-warn`}
        >
          Activer
        </button>
        <button
          type="button"
          disabled={sending}
          onClick={() => send("Buzzer coupé", { action: "BUZZER", state: "OFF" })}
          className={`${BASE_BUTTON} border-line text-muted`}
        >
          Couper
        </button>
      </ActuatorRow>

      <ActuatorRow label="LED rouge">
        <button type="button" disabled={sending} onClick={() => send("LED rouge ON", { action: "LED_RED", state: "ON" })} className={`${BASE_BUTTON} border-crit/70 text-crit`}>
          Allumer
        </button>
        <button type="button" disabled={sending} onClick={() => send("LED rouge OFF", { action: "LED_RED", state: "OFF" })} className={`${BASE_BUTTON} border-line text-muted`}>
          Éteindre
        </button>
      </ActuatorRow>

      <ActuatorRow label="LED verte">
        <button type="button" disabled={sending} onClick={() => send("LED verte ON", { action: "LED_GREEN", state: "ON" })} className={`${BASE_BUTTON} border-ok/70 text-ok`}>
          Allumer
        </button>
        <button type="button" disabled={sending} onClick={() => send("LED verte OFF", { action: "LED_GREEN", state: "OFF" })} className={`${BASE_BUTTON} border-line text-muted`}>
          Éteindre
        </button>
      </ActuatorRow>

      <button
        type="button"
        disabled={sending}
        onClick={() => send("Silence", { action: "SILENCE" })}
        className="rounded-lg bg-crit px-4 py-3 font-mono text-lg font-bold tracking-[0.2em] text-deep uppercase shadow-[0_0_24px_-4px_var(--color-crit)] transition hover:brightness-110 disabled:opacity-50"
      >
        ⏻ Silence
        <span className="block text-xs font-normal tracking-normal normal-case">Coupe buzzer + LED rouge</span>
      </button>

      <ul aria-live="polite" aria-label="Dernières commandes" className="flex flex-col gap-1 text-sm">
        {history.map((entry) => {
          const result = outcome(entry, acks, now);
          return (
            <li key={entry.key} className="flex justify-between gap-2 border-b border-line/60 py-1 last:border-0">
              <span className="text-fg">{entry.label}</span>
              <span className={`font-mono text-xs ${result.className}`}>{result.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
