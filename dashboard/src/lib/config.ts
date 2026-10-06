// URLs résolues dans le navigateur. Variables NEXT_PUBLIC_* lues au build ;
// vides en production → même origine que la page (le dashboard est servi par l'API).

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const VIDEO_URL = process.env.NEXT_PUBLIC_VIDEO_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_URL}/api/v1${path}`;
}

export function wsUrl(): string {
  const base = API_URL || window.location.origin;
  return `${base.replace(/^http/, "ws")}/ws`;
}

// En HTTPS, le flux passe par le reverse proxy (même origine) : un flux http://…:5000
// serait bloqué comme Mixed Content. En HTTP (fallback), accès direct au script IA.
export function videoUrl(): string {
  if (VIDEO_URL) return VIDEO_URL;
  if (window.location.protocol === "https:") return `${window.location.origin}/video_feed`;
  return `http://${window.location.hostname}:5000/video_feed`;
}
