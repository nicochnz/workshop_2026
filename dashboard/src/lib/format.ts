// Formats d'affichage. Les horodatages du contrat sont des secondes Unix.

const timeFormat = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function formatClock(unixSeconds: number): string {
  return timeFormat.format(unixSeconds * 1000);
}

/** « il y a 4 s », « il y a 3 min »… */
export function formatAgo(unixSeconds: number, nowMs: number): string {
  const s = Math.max(0, Math.round(nowMs / 1000 - unixSeconds));
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  return `il y a ${Math.floor(s / 3600)} h`;
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h} h ${m} min` : m > 0 ? `${m} min ${s} s` : `${s} s`;
}

/** Qualité du signal Wi-Fi (dBm) : barres de 0 à 4 + libellé. */
export function rssiQuality(rssi: number): { bars: number; label: string } {
  if (rssi >= -55) return { bars: 4, label: "Excellent" };
  if (rssi >= -67) return { bars: 3, label: "Bon" };
  if (rssi >= -75) return { bars: 2, label: "Moyen" };
  if (rssi >= -85) return { bars: 1, label: "Faible" };
  return { bars: 0, label: "Très faible" };
}
