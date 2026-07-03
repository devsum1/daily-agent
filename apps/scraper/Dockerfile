# Playwright image ships browsers + deps. Runs headful via xvfb in container.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app
RUN npm i -g pnpm@9

# workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY apps/scraper/package.json apps/scraper/
RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/core packages/core
COPY apps/scraper apps/scraper
RUN pnpm --filter @jsa/core build && pnpm --filter @jsa/scraper build

ENV HEADLESS=false
# xvfb-run gives a virtual display so non-headless Chromium works in the container
CMD ["xvfb-run", "-a", "node", "apps/scraper/dist/index.js", "serve"]
