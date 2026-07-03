FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm@9

# manifests first (layer cache)
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/integrations/package.json packages/integrations/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile || pnpm install

# source
COPY prisma prisma
COPY packages packages
COPY apps/api apps/api

RUN pnpm --filter @jsa/core build \
 && pnpm --filter @jsa/integrations build \
 && pnpm --filter @jsa/api exec prisma generate \
 && pnpm --filter @jsa/api build

EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @jsa/api exec prisma migrate deploy && node apps/api/dist/main.js"]
