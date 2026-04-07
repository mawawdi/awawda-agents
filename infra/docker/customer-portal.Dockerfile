FROM node:20-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/agent-mobile/package.json apps/agent-mobile/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/customer-portal/package.json apps/customer-portal/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN pnpm install --frozen-lockfile

COPY apps/customer-portal apps/customer-portal
COPY packages/shared-types packages/shared-types

RUN pnpm --filter @meatland/customer-portal build

FROM nginx:1.27-alpine
COPY --from=builder /workspace/apps/customer-portal/dist /usr/share/nginx/html
COPY infra/docker/customer-portal.nginx.conf /etc/nginx/conf.d/default.conf
COPY infra/docker/customer-portal-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh
EXPOSE 80
