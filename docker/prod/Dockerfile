# Build de production pour cPanel, fait sous Linux (le serveur l'est) : pnpm production:build
# Sortie : dist/production/ifspa-production.zip (server.js autonome, .next/static, public).
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.3.0 --activate \
  && apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# prisma.config.ts exige DATABASE_URL, même pour le `prisma generate` du postinstall ; aucune base n'est jointe.
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" pnpm install --frozen-lockfile

COPY . .
# Les NEXT_PUBLIC_* sont figées dans le code au build : elles portent ici leurs valeurs de production.
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
RUN test -n "$NEXT_PUBLIC_APP_URL" && DATABASE_URL="postgresql://x:x@localhost:5432/x" pnpm build

# zip -y garde les liens symboliques de pnpm (sinon chaque paquet est copié deux fois) ; à extraire avec `unzip`.
# deploy/ : migrations et script d'installation, utilisés sur le serveur par docker/prod/deployer.sh.
RUN mkdir -p /out/app/public /out/app/deploy && cp -r .next/standalone/. /out/app/ \
  && cp -r .next/static /out/app/.next/static && cp -r public/. /out/app/public/ \
  && cp -r prisma/migrations /out/app/deploy/migrations && cp docker/prod/deployer.sh /out/app/deploy/ \
  && sed -i 's/\r$//' /out/app/deploy/deployer.sh /out/app/deploy/migrations/*/migration.sql \
  && cd /out/app && zip -qry /out/ifspa-production.zip .

FROM scratch AS export
COPY --from=build /out/ifspa-production.zip /
