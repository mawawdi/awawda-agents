FROM node:20-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/agent-mobile/package.json apps/agent-mobile/package.json
COPY apps/customer-portal/package.json apps/customer-portal/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/shared-types packages/shared-types

RUN pnpm --filter @meatland/api prisma:generate
RUN pnpm --filter @meatland/api build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=builder /workspace/apps/api/public ./apps/api/public
COPY --from=builder /workspace/packages/shared-types ./packages/shared-types

EXPOSE 3000
CMD ["sh", "-c", "apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
