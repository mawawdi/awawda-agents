# agent-mobile

Expo React Native app for Meatland sales agents.

## Environment

Copy `.env.example` to `.env` and set:

- `EXPO_PUBLIC_API_BASE_URL` (API origin, e.g. `http://127.0.0.1:3000`)

## Implemented in T14

- Login screen wired to `POST /v1/agent/auth/login`.
- Access token persisted with Expo SecureStore.
- Boot-time session restore and logout token clear.
- Authenticated navigation shell with protected home route.
- Mobile-friendly validation and user-facing error messages.

## Scripts

- `pnpm --filter @meatland/agent-mobile start`
- `pnpm --filter @meatland/agent-mobile lint`
- `pnpm --filter @meatland/agent-mobile test`

## Reviewer validation baseline

Use `pnpm dlx playwright test` at repo root to run the auth-flow baseline scenario
(sign-in, persisted session restore simulation, logout clear) that supports Bishop review evidence.
