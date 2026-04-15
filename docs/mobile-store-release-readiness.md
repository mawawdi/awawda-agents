# Mobile store release readiness (Agent app)

This document tracks how close `apps/agent-mobile` is to a production App Store / Google Play release.

## Current state (as of this update)

### Already in place

1. Expo app config includes iOS and Android package identity scaffolding (`co.awawda.agent`) and version fields.
2. EAS build profiles are configured for `development`, `preview`, and `production`.
3. EAS production Android output is configured as `app-bundle` (Play Store-ready artifact type).
4. EAS submit profile is defined for Android internal track (draft release).
5. CLI scripts exist in `apps/agent-mobile/package.json` for build/submit workflows.
6. Agent app runtime, API integration, and core flows are implemented and actively tested in this repo.

### Gaps still blocking full store go-live

1. **Store credentials + app records**
   - Apple Developer credentials and finalized App Store Connect app setup.
   - Google Play Console service account + API access for automated submission.
2. **Brand assets**
   - App icon and splash assets are not committed in `apps/agent-mobile` yet.
3. **Legal/compliance**
   - Privacy policy/support URLs and final store listing metadata are not codified in repo docs yet.
4. **Final identity validation**
   - Bundle/package IDs are scaffold defaults and must be confirmed against production organization ownership.
5. **Release execution evidence**
   - No production store submission artifacts (build IDs / submitted release records) are checked in yet.
6. **Cross-workspace quality gate**
   - `@awawda/customer-portal` currently has one failing test (`customer-portal-routes.test.tsx` image URL expectation) that should be fixed before final production cutover.

## Production readiness estimate

**Estimated readiness: ~70%.**

- **Strong:** app functionality, CI quality gates, EAS build profile setup.
- **Not done yet:** store credentials/compliance/assets and final store publishing execution.

## CLI execution status from this session

- `pnpm --filter @awawda/agent-mobile eas:whoami` → **blocked** (`Not logged in`)
- `pnpm dlx eas-cli build --platform android --profile preview --non-interactive` → **blocked** (requires `eas login` or `EXPO_TOKEN`)

## CLI release flow (target)

From `apps/agent-mobile`:

```bash
pnpm eas:login
pnpm eas:whoami
pnpm eas:init
pnpm eas:build:preview:ios
pnpm eas:build:preview:android
pnpm eas:build:production:ios
pnpm eas:build:production:android
pnpm eas:submit:production:android
pnpm eas:submit:production:ios
```

## Final pre-launch checklist

- [ ] Final app icon + splash assets added and wired in Expo config.
- [ ] Organization-owned iOS bundle ID and Android package confirmed.
- [ ] App Store Connect app exists and has all required metadata.
- [ ] Google Play app exists with Data safety + Content rating completed.
- [ ] Privacy policy URL and support contact finalized.
- [ ] Production builds generated and sanity-tested on physical iOS + Android devices.
- [ ] Store submissions completed and reviewed (internal track / TestFlight first).
