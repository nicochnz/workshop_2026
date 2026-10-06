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

export function videoUrl(): string {
  return VIDEO_URL || `${window.location.protocol}//${window.location.hostname}:5000/video_feed`;
}
