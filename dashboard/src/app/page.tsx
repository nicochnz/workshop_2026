"use client";

import { Dashboard } from "@/components/Dashboard";
import { TokenGate } from "@/components/TokenGate";
import { useOperatorToken } from "@/lib/token";

export default function Page() {
  const token = useOperatorToken();

  if (token === undefined) return null; // rendu statique : jeton pas encore lu
  if (!token) return <TokenGate />;
  // key : changer de jeton repart d'un état vierge
  return <Dashboard key={token} token={token} />;
}
