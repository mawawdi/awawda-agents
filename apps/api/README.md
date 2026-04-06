# api

NestJS + Fastify backend entrypoint for the Meatland Agent platform.

## Environment

Copy `.env.example` to `.env` and set all required values before running workspace checks.

## Scripts

- `pnpm --filter @meatland/api dev` — run API locally (default `0.0.0.0:3000`)
- `pnpm --filter @meatland/api test` — run API tests
- `pnpm --filter @meatland/api build` — compile TypeScript to `dist/`

## Operational routes

- `GET /v1/health` — liveness contract
- `GET /v1/ready` — readiness placeholder contract for dependencies
- `POST /v1/agent/auth/login` — baseline agent sign-in route for mobile auth shell
- `GET /v1/agent/auth/session` — validate/restore active agent session from bearer token
- `POST /v1/agent/auth/logout` — invalidate an active bearer token

Default local agent credentials for integration checks:

- email: `agent@meatland.local`
- password: `Password123!`

Override with `AGENT_AUTH_EMAIL`, `AGENT_AUTH_PASSWORD`, and `AGENT_AUTH_NAME`.

## Module boundaries

Phase-1 domain scaffolds are in place and isolated by module:

- `auth`
- `customers`
- `catalog`
- `links`
- `sessions`
- `orders`
- `erp`

## Local infra dependencies (PostgreSQL + Redis)

From repo root, start local runtime dependencies:

```bash
pnpm infra:local:up
```

`apps/api/.env.example` already points to this stack (`localhost:5432` and `localhost:6379`).
Use `pnpm infra:local:ps` to verify health before running API flows.
