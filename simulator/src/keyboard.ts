import type { Scenario } from "./sensors.js";

export interface KeyboardActions {
  setScenario: (scenario: Scenario) => void;
  sendInvalid: () => void;
  crash: () => void;
  quit: () => void;
}

const SCENARIO_KEYS: Record<string, Scenario> = {
  n: "normal",
  g: "gas_leak",
  i: "intrusion",
  h: "heating",
};

export const HELP = [
  "Touches :",
  "  g  fuite de gaz        i  intrus (distance < seuil)",
  "  h  échauffement lent   n  retour à la normale",
  "  x  message invalide    q  crash brutal (déclenche le LWT)",
  "  Ctrl+C  arrêt propre (publie offline)",
].join("\n");

// Lecture des touches une par une, sans Entrée. Inactif si le terminal n'est pas interactif.
export function listenKeyboard(actions: KeyboardActions): void {
  if (!process.stdin.isTTY) {
    console.log("ℹ️  Terminal non interactif : scénarios clavier désactivés.");
    return;
  }

  process.stdin.setRawMode(true);
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (key: string) => {
    if (key === "\u0003") return actions.quit(); // Ctrl+C

    const scenario = SCENARIO_KEYS[key];
    if (scenario) return actions.setScenario(scenario);
    if (key === "x") return actions.sendInvalid();
    if (key === "q") return actions.crash();
  });
}
