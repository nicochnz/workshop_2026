# API Sentinel-X + dashboard — image multi-stage, exécutée sans privilège root.
# Contexte de build : RACINE du dépôt (l'image embarque aussi le dashboard) :
#   docker build -f api/Dockerfile -t sentinel-api .
# L'équipe INFRA l'intègre au docker-compose.yml (broker + PostgreSQL + API).

# --- API : compilation TypeScript ---
FROM node:20-alpine AS build
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci
COPY api/tsconfig.json api/tsconfig.build.json ./
COPY api/src ./src
RUN npm run build

# --- API : dépendances de production seules, sans la chaîne de compilation ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

# --- Dashboard Next.js exporté en statique (out/) ---
FROM node:20-alpine AS dashboard
WORKDIR /dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
# Vide = même origine : le dashboard appelle l'API qui le sert (contrat §4)
ENV NEXT_PUBLIC_API_URL="" NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- Image finale ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY api/package.json ./
COPY api/db ./db
# Servi sur / par l'API (DASHBOARD_DIR=public par défaut)
COPY --from=dashboard /dashboard/out ./public

# `node` est un utilisateur non-root fourni par l'image officielle.
USER node

EXPOSE 8080

# fetch est natif en Node 20 : pas besoin de curl dans l'image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
