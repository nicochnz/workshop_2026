# Dashboard Sentinel-X

Interface de supervision du boîtier SX-003 : courbes en temps réel, état, alertes, vision IA et
commandes (buzzer, LEDs). Next.js 16 (App Router) + TypeScript + Tailwind CSS 4.

Le dashboard est un **site statique** (`output: "export"`) : aucun serveur Next en production.
Le build `out/` est servi par l'API Express sur `/`, à la même origine que le REST et le WebSocket
(cf. [contrat](../docs/contrat.md) §4-5).

## Développement

Prérequis : broker + base de dev, API et simulateur lancés (voir le [README racine](../README.md)).

```bash
cp .env.example .env.local   # NEXT_PUBLIC_API_URL = URL de l'API de dev
npm install
npm run dev                  # http://localhost:3100
```

L'API doit autoriser l'origine du dashboard : `ALLOWED_ORIGINS=http://localhost:3100` dans
`api/.env`, avec `NODE_ENV=development`.

```bash
npm run typecheck
npm run lint
npm run build                # génère out/
```

## Production

1. `NEXT_PUBLIC_API_URL` **vide** au moment du build (même origine).
2. `npm run build` → `out/`.
3. L'API sert `out/` (variable `DASHBOARD_DIR`, ou `COPY dashboard/out ./public` dans `api/Dockerfile`).

## Thème

Palette fournie : `#061128` `#00ffa3` `#00b3ff` `#8b5cf6` `#f1f5ff`, déclarée dans
`src/app/globals.css` sous forme de **couleurs sémantiques** Tailwind (les couleurs par défaut
sont désactivées) :

| Classe | Couleur | Contraste sur le fond | Usage |
|---|---|---|---|
| `fg` | `#f1f5ff` | 17,2:1 | Texte principal |
| `muted` | `#94a3c7` | 7,4:1 | Texte secondaire |
| `ok` | `#00ffa3` | 14,2:1 | En ligne, succès |
| `info` | `#00b3ff` | 8,0:1 | Données, focus clavier |
| `accent` | `#8b5cf6` | 4,4:1 | Décor et bordures **uniquement** (trop faible pour du texte) |
| `accent-soft` | `#a78bfa` | 6,9:1 | Violet pour du texte |
| `warn` | `#ffb020` | 10,3:1 | Alerte `WARNING` (ajout) |
| `crit` | `#ff4d6d` | 5,8:1 | Alerte `CRITICAL`, hors ligne (ajout) |

Règles d'accessibilité : contraste ≥ 4,5:1 pour tout texte, focus clavier visible, une
information n'est jamais portée par la couleur seule (icône + texte), animations coupées si
`prefers-reduced-motion`.

Pas de `next/font/google` : le build doit fonctionner sans Internet sur le réseau de table.
