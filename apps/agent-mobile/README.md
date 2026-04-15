# agent-mobile

Expo React Native app for Meatland sales agents.

## Environment

Copy `.env.example` to `.env` and set:

- `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000` for all local development (web + Expo Go).

When using **Expo Go** on a physical device, mobile API requests automatically fall back from `localhost` to:
- runtime Expo/Metro host discovery (for example `http://192.168.x.x:3000`)
- optional explicit override via `EXPO_PUBLIC_EXPO_GO_HOST` (for example `192.168.1.77`)

If needed, `EXPO_PUBLIC_API_BASE_URL=auto` also resolves to `http://localhost:3000`.

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

`eas.json` is configured with `development`, `preview`, and `production` profiles.

### Prerequisites

1. Expo account login (`eas login`).
2. Apple Developer account + App Store Connect app.
3. Google Play Console app + service account JSON for automated submit.
4. Store assets (icon, splash, screenshots, privacy policy URL).
5. Production API base URL configured in build env (`EXPO_PUBLIC_API_BASE_URL`).

From `apps/agent-mobile`:

```bash
pnpm eas:login
pnpm eas:whoami
pnpm eas:init
pnpm eas:build:preview:ios
pnpm eas:build:preview:android
```

For production builds:

```bash
pnpm eas:build:production:all
```

Submit to stores:

```bash
pnpm eas:submit:production:android
pnpm eas:submit:production:ios
```

### Current mobile release readiness (summary)

- ✅ Runtime + core UX flow is implemented and tested.
- ✅ EAS build and submit profiles exist (`preview`, `production`).
- ✅ Android release profile is set to `app-bundle` for Play Store submission.
- 🟡 Store identity is scaffolded (`co.meatland.agent`) and may still need final organization-owned IDs.
- 🟡 No app icon/splash assets are committed yet (required before final store submission).
- 🟡 App Store / Play Console credentials are required to complete real submission from CLI.

See `docs/mobile-store-release-readiness.md` for the full production-readiness gate checklist.

## Reviewer validation baseline

Use `pnpm dlx playwright test tests/playwright/agent-auth-flow.spec.ts` at repo root to run auth-flow simulation evidence for sign-in, persisted token restore, and logout clear.
