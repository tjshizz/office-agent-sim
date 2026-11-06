FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/
COPY packages/sim/package.json packages/sim/
COPY packages/agents/package.json packages/agents/
COPY packages/game/package.json packages/game/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm --filter @office-sim/shared build \
 && pnpm --filter @office-sim/sim build \
 && pnpm --filter @office-sim/agents build \
 && pnpm --filter @office-sim/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV OFFICE_DATA_DIR=/data
RUN mkdir -p /data
COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/server-bundle.mjs ./server-bundle.mjs
EXPOSE 8080
CMD ["node", "server-bundle.mjs"]
