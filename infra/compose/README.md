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

- PostgreSQL `16.3-alpine` on `localhost:5432`
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

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/awawda`
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
```

## Verify deployment

```bash
docker compose --env-file infra/compose/deploy.env -f infra/compose/deploy.yml ps
```

- Portal: `http://localhost:8080`
- API health: `http://localhost:3000/v1/health`

## Stop deployment

```bash
docker compose --env-file infra/compose/deploy.env -f infra/compose/deploy.yml down --remove-orphans
```
