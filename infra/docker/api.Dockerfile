FROM node:20-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/shared-types packages/shared-types

RUN pnpm --filter @meatland/api prisma:generate
RUN pnpm --filter @meatland/api build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder /workspace/apps/api/package.json ./apps/api/package.json
COPY --from=builder /workspace/apps/api/prisma ./apps/api/prisma
COPY --from=builder /workspace/packages/shared-types ./packages/shared-types

EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
