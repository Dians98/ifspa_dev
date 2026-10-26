# Image des tests : Node de la prod (NODE_VERSION), pnpm du projet, Chromium de Playwright, sous Linux comme cPanel.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim

ENV TZ=Indian/Antananarivo \
    CI=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN corepack enable && corepack prepare pnpm@11.3.0 --activate

WORKDIR /app

# Dépendances d'abord : cette couche reste en cache tant que le lockfile et le schéma ne changent pas.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# prisma.config.ts exige DATABASE_URL, même pour le `prisma generate` du postinstall.
RUN DATABASE_URL="postgresql://x:x@localhost:5432/x" pnpm install --frozen-lockfile
RUN pnpm exec playwright install --with-deps chromium

COPY . .
# Un checkout Windows peut apporter des fins de ligne CRLF que bash refuse.
RUN sed -i 's/\r$//' docker/test/lancer.sh

CMD ["bash", "docker/test/lancer.sh"]
