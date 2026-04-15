# Infra

Infrastructure assets for local development and deployment.

- `docker/`: container definitions and Docker build assets
- `compose/`: compose bundles and local runtime dependency stacks

For local API dependencies (PostgreSQL + Redis), use:

- `docker compose -f infra/compose/local.yml up -d`
- `docker compose -f infra/compose/local.yml ps`
- `docker compose -f infra/compose/local.yml down --remove-orphans`
- `docker compose -f infra/compose/local.yml down --volumes --remove-orphans`

Or use workspace scripts:

- `pnpm infra:local:up`
- `pnpm infra:local:ps`
- `pnpm infra:local:down`
- `pnpm infra:local:reset`

## Deploy stack (API + Customer Portal + PostgreSQL + Redis)

1. Copy `infra/compose/deploy.env.example` to `infra/compose/deploy.env`.
2. Set production-safe secrets and host values in `deploy.env` (`JWT_SECRET`, DB password, and `MAGIC_LINK_BASE_URL` at minimum).
3. Start the deployment (defaults to `HASH_ENV` from env/deploy file), or use explicit Hash mode scripts:

```bash
pnpm deploy:up
pnpm deploy:up:test
pnpm deploy:up:prod
```

4. Check service state:

```bash
pnpm deploy:ps
```

5. Stop the deployment:

```bash
pnpm deploy:down
```

> While deploy stack is running, API traffic on `localhost:3000` uses deploy containers (API + Postgres), not your separate local-dev database process.
