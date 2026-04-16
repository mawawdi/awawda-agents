# Local infra compose (PostgreSQL + Redis)

This stack provides local runtime dependencies for API development and test execution.

## Prerequisites

- Docker Desktop (or Docker Engine with Compose v2)

## Start local infra

From repository root:

```bash
docker compose -f infra/compose/local.yml up -d
```

This starts:

- PostgreSQL `16.3-alpine` on `127.0.0.1:55432`
- Redis `7.2.5-alpine` on `localhost:6379`

## Verify startup health

```bash
docker compose -f infra/compose/local.yml ps
```

Expected state:

- `postgres` is `running` and `healthy`
- `redis` is `running` and `healthy`

You can also inspect logs:

```bash
docker compose -f infra/compose/local.yml logs --tail=100
```

## API environment wiring

`apps/api/.env.example` is aligned to this stack:

- `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/awawda`
- `REDIS_URL=redis://localhost:6379`

Copy `.env.example` to `.env` and keep these defaults for local development.

## Stop stack

```bash
docker compose -f infra/compose/local.yml down --remove-orphans
```

## Safe local data reset

To fully reset local PostgreSQL/Redis data volumes:

```bash
docker compose -f infra/compose/local.yml down --volumes --remove-orphans
```

This removes local compose containers and volumes (`postgres_data`, `redis_data`) only for this stack.

To reset + reseed local testing data in one command from repo root:

```bash
pnpm infra:local:refresh:data
```

## First-run initialization

On first bootstrap (fresh volume), PostgreSQL runs SQL files in `infra/compose/init/`.

Current init script provisions:

- `awawda` (primary DB via `POSTGRES_DB`)
- `awawda_test` (created via `01-create-test-db.sql`)

---

# Deploy compose (API + Customer Portal)

Production-like container deployment is defined in `infra/compose/deploy.yml`.

## Prerequisites

- Docker Engine with Compose v2
- `infra/compose/deploy.env` file (copy from `deploy.env.example`)

## First-time setup

```bash
cp infra/compose/deploy.env.example infra/compose/deploy.env
```

Update at least:

- `POSTGRES_PASSWORD`
- `JWT_SECRET`
- `MAGIC_LINK_BASE_URL`

## Start deployment

```bash
docker compose --env-file infra/compose/deploy.env -f infra/compose/deploy.yml up -d --build
```

or:

```bash
pnpm deploy:up
pnpm deploy:up:test
pnpm deploy:up:prod
pnpm deploy:test
```

- `deploy:up:test` now runs with `NODE_ENV=development` + `HASH_ENV=testing` (testing mode, testing-only routes enabled).
- `deploy:up:prod` runs with `NODE_ENV=production` + `HASH_ENV=production` (production guardrails enforced).
- `deploy:up:prod` now runs a hard preflight gate (`deploy:verify:prod`) and fails before compose if Hash settings resolve to testing URLs/keys or missing production credentials.
- `deploy:test` now does a full test bootstrap: resets deploy volumes, starts test-mode deploy, and seeds testing data.

## Verify deployment

```bash
docker compose --env-file infra/compose/deploy.env -f infra/compose/deploy.yml ps
```

- Portal: `http://localhost:8080`
- API health: `http://localhost:3000/v1/health`
- Deploy PostgreSQL host port: `127.0.0.1:55433` (configurable via `POSTGRES_HOST_PORT` in `deploy.env`)

If this deploy stack is running, `localhost:3000` points to the containerized API + containerized Postgres from `deploy.yml`. Keep seeding and troubleshooting scoped to that runtime DB to avoid local-vs-deploy data drift.

To reset + reseed deploy testing data in one command from repo root:

```bash
pnpm deploy:refresh:data
```

## Stop deployment

```bash
docker compose --env-file infra/compose/deploy.env -f infra/compose/deploy.yml down --remove-orphans
```

> Important: deleting containers/images does **not** delete Docker volumes. If old users still log in, run `pnpm deploy:reset` (or `pnpm deploy:refresh:data`) to remove the persisted Postgres volume.
