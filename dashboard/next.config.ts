import type { NextConfig } from "next";

// Export statique : le build `out/` est servi par l'API Express (même origine en production).
const nextConfig: NextConfig = {
  output: "export",
};

export default nextConfig;
