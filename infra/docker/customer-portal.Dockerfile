FROM node:20-bookworm-slim AS builder
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/customer-portal/package.json apps/customer-portal/package.json

RUN pnpm install --frozen-lockfile

COPY apps/customer-portal apps/customer-portal

RUN mkdir -p apps/customer-portal/dist && \
  cat > apps/customer-portal/dist/index.html <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Meatland Customer Portal</title>
  </head>
  <body>
    <h1>Meatland Customer Portal</h1>
    <p>Phase 1 deployment artifact placeholder.</p>
  </body>
</html>
HTML

FROM nginx:1.27-alpine
COPY --from=builder /workspace/apps/customer-portal/dist/index.html /usr/share/nginx/html/index.html
EXPOSE 80
