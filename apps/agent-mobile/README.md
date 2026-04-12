# agent-mobile

Expo React Native app for Meatland sales agents.

## Environment

Copy `.env.example` to `.env` and set:

- `EXPO_PUBLIC_API_BASE_URL` (API origin; use `http://localhost:3000` for web/simulators, or `http://YOUR_LAN_IP:3000` for Expo Go on a physical device)

When using **Expo Go**, all mobile API requests (login/customers/orders) fall back and try:
- the Metro bundle host on port `3000` (for example `http://192.168.x.x:3000`)
- optional explicit host via `EXPO_PUBLIC_EXPO_GO_HOST` (for example `192.168.1.77`)

if `localhost` is unreachable.

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

## Deployment (Expo EAS)

`eas.json` is now configured with `development`, `preview`, and `production` profiles.

From `apps/agent-mobile`:

```bash
pnpm dlx eas login
pnpm dlx eas build --platform ios --profile preview
pnpm dlx eas build --platform android --profile preview
```

For production builds:

```bash
pnpm dlx eas build --platform all --profile production
```

## Reviewer validation baseline

Use `pnpm dlx playwright test tests/playwright/agent-auth-flow.spec.ts` at repo root to run auth-flow simulation evidence for sign-in, persisted token restore, and logout clear.
