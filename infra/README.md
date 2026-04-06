# Infra

Infrastructure assets for local development and deployment.

- `docker/`: container definitions and Docker build assets
- `compose/`: compose bundles and local runtime dependency stacks

For local API dependencies (PostgreSQL + Redis), use:

- `docker compose -f infra/compose/local.yml up -d`
- `docker compose -f infra/compose/local.yml ps`
- `docker compose -f infra/compose/local.yml down --remove-orphans`
- `docker compose -f infra/compose/local.yml down --volumes --remove-orphans`
