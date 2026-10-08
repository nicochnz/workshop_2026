import type { Metadata } from "next";
import "./globals.css";

// Pas de next/font/google : le build doit fonctionner sans Internet (réseau de table).
export const metadata: Metadata = {
  title: "Sentinel-X — Supervision SX-003",
  description: "Dashboard de supervision du boîtier Sentinel-X (groupe 3)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
