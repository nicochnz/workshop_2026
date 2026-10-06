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

## Structure

```
src/
  app/            page unique (jeton → dashboard), thème global (globals.css)
  components/     Panel, TokenGate, ConnectionBadge, StatusCard, LiveCharts + MetricChart,
                  AlertList, ControlPanel, VideoFeed
  hooks/          useLiveSocket (WebSocket + reconnexion), useDashboardData, useNow
  lib/            types du contrat, client REST, jeton, état, seuils, libellés, formats
```

Courbes : Chart.js utilisé directement (sans surcouche React), modules enregistrés à la carte.
Les seuils affichés (`lib/thresholds.ts`) doivent suivre la calibration du firmware.

## Production

1. `NEXT_PUBLIC_API_URL` **vide** au moment du build (même origine).
2. `npm run build` → `out/`.
3. L'API sert `out/` (variable `DASHBOARD_DIR`, ou `COPY dashboard/out ./public` dans `api/Dockerfile`).

## Thème

Palette fournie : `#061128` `#00ffa3` `#00b3ff` `#8b5cf6` `#f1f5ff`, style néon cyberpunk, fond
éclairci en `#0b1c44`. Déclarée dans `src/app/globals.css` sous forme de **couleurs sémantiques**
Tailwind (les couleurs par défaut sont désactivées). Contrastes mesurés sur les **cartes** `#132b60`,
le cas le plus défavorable :

| Classe | Couleur | Contraste | Usage |
|---|---|---|---|
| `fg` | `#f1f5ff` | 12,5:1 | Texte principal |
| `muted` | `#a9b8dd` | 6,9:1 | Texte secondaire |
| `ok` | `#00ffa3` | 10,3:1 | En ligne, succès |
| `info` | `#00b3ff` | 5,8:1 | Données, courbes |
| `accent` | `#8b5cf6` | 3,2:1 | Décor, bordures, halos **uniquement** |
| `accent-soft` | `#b69cff` | 6,0:1 | Violet pour du texte |
| `warn` | `#ffb020` | 7,5:1 | Alerte `WARNING` (ajout) |
| `crit` | `#ff6b85` | 5,0:1 | Alerte `CRITICAL`, hors ligne (ajout) |

Effets néon (utilitaires maison) : `neon-panel` (bordure dégradée + halo), `neon-glow` (texte
lumineux, titres et valeurs clés seulement), `neon-rule` (trait lumineux).

Règles d'accessibilité : contraste ≥ 4,5:1 pour tout texte, focus clavier visible, une
information n'est jamais portée par la couleur seule (icône + texte), animations coupées si
`prefers-reduced-motion`.

Démo : bandeau pulsant pour la dernière alerte critique (2 min, bouton « Acquitter »), bandeau
permanent si le boîtier est hors ligne, titre d'onglet « ⚠ ALERTE », texte agrandi de 12,5 % au-delà
de 1920 px (vidéoprojecteur). Tout élément cliquable affiche le curseur main (règle globale).

Pas de `next/font/google` : le build doit fonctionner sans Internet sur le réseau de table.
