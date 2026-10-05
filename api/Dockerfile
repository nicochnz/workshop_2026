# API Sentinel-X — image multi-stage, exécutée sans privilège root.
# L'équipe INFRA l'intègre au docker-compose.yml (broker + PostgreSQL + API).

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Dépendances de production seules, sans la chaîne de compilation.
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY db ./db

# Dashboard exporté (étape 3) : décommenter quand `dashboard/out` existe.
# Le build doit alors se faire depuis la racine du dépôt.
# COPY dashboard/out ./public

# `node` est un utilisateur non-root fourni par l'image officielle.
USER node

EXPOSE 8080

# fetch est natif en Node 20 : pas besoin de curl dans l'image.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
