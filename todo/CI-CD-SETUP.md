# CI/CD Pipeline — Remaining Configuration

> Last updated: April 9, 2026. Secrets/variables cross-referenced against actual
> workflow files. Two dedicated deploy workflows still needed.

---

## Existing Workflows

| File                    | Trigger                         | Purpose                             |
| ----------------------- | ------------------------------- | ----------------------------------- |
| `ci.yml`                | PR + push to main/develop       | Lint, type-check, unit tests, audit |
| `deploy.yml`            | Push to main (path-filtered)    | Web + Backend + Functions deploy    |
| `deploy-mobile.yml`     | Push to main + `mobile-v*` tags | iOS/Android build & submit          |
| `ai-review.yml`         | PR open/sync + CI failure       | Claude code review via Slack        |
| `release.yml`           | Manual (`workflow_dispatch`)    | Versioning + GitHub release notes   |
| `e2e.yml`               | PR + push to main               | Playwright E2E tests                |
| `runtime-error-fix.yml` | Manual                          | AI-assisted runtime error fixes     |

---

## ⚠️ Missing Workflows (Need to Create)

### `deploy-backend.yml` — Dedicated Backend Deploy

Currently backend deploys are bundled inside `deploy.yml` alongside web and
functions. This means a backend-only change triggers a full web build first. A
dedicated workflow should:

- Trigger on push to `main` scoped to `backend/**` and `packages/core/**`
- Skip the shared `build` job (build backend only)
- Authenticate with `GCP_SA_KEY`, build the Docker image, push to Artifact
  Registry, deploy to Cloud Run (`nxt1-backend-staging` / `nxt1-backend-prod`)
- Accept `environment` input (staging/production) via `workflow_dispatch`

### `deploy-functions.yml` — Dedicated Functions Deploy

Same problem — currently coupled to the shared deploy job. A dedicated workflow
should:

- Trigger on push to `main` scoped to `apps/functions/**` and `packages/core/**`
- Build and deploy only `apps/functions`
- Use `FIREBASE_SERVICE_ACCOUNT` + `FIREBASE_PROJECT_ID`
- Accept `environment` input via `workflow_dispatch`

---

## GitHub Secrets to Configure

### Core Infrastructure

| Secret                     | Used By               | Notes                                                               |
| -------------------------- | --------------------- | ------------------------------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT` | deploy.yml, functions | Service account JSON — scoped per GitHub Environment (staging/prod) |
| `GCP_SA_KEY`               | deploy.yml            | Google Cloud SA JSON for Cloud Run + Artifact Registry              |
| `SLACK_WEBHOOK_URL`        | deploy.yml, ci.yml    | Incoming webhook for deploy/CI notifications                        |
| `SLACK_BOT_TOKEN`          | ai-review.yml         | Bot token for interactive AI review buttons                         |
| `ANTHROPIC_API_KEY`        | ai-review.yml         | Claude API key for automated code review                            |
| `SNYK_TOKEN`               | ci.yml                | Security scanning (optional but wired in CI)                        |
| `CODECOV_TOKEN`            | ci.yml                | Coverage reporting                                                  |
| `TURBO_TOKEN`              | ci.yml                | Turborepo remote cache auth                                         |

### iOS Signing (deploy-mobile.yml)

| Secret                          | Notes                                   |
| ------------------------------- | --------------------------------------- |
| `MATCH_PASSWORD`                | Match certificate encryption password   |
| `MATCH_GIT_URL`                 | Git URL for Match certificates repo     |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Git credentials (username:token base64) |
| `APPLE_API_KEY_ID`              | App Store Connect API Key ID            |
| `APPLE_API_ISSUER_ID`           | App Store Connect Issuer ID             |
| `APPLE_API_KEY`                 | App Store Connect API Key (.p8 content) |
| `FIREBASE_IOS_APP_ID`           | Firebase iOS App ID (for distribution)  |

### Android Signing (deploy-mobile.yml)

| Secret                      | Notes                            |
| --------------------------- | -------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded `.jks` keystore   |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                |
| `ANDROID_KEY_ALIAS`         | Key alias in keystore            |
| `ANDROID_KEY_PASSWORD`      | Key password                     |
| `GOOGLE_PLAY_JSON_KEY`      | Google Play service account JSON |
| `FIREBASE_ANDROID_APP_ID`   | Firebase Android App ID          |

---

## GitHub Variables to Configure

| Variable                  | Used By       | Example / Notes                          |
| ------------------------- | ------------- | ---------------------------------------- |
| `FIREBASE_PROJECT_ID`     | deploy.yml    | `nxt-1-de054` (staging) / `nxt-1` (prod) |
| `GCP_PROJECT_ID`          | deploy.yml    | Same as Firebase project ID              |
| `GCP_REGION`              | deploy.yml    | `us-central1`                            |
| `TURBO_TEAM`              | ci.yml        | `team_xxx` from Vercel dashboard         |
| `SLACK_AI_REVIEW_CHANNEL` | ai-review.yml | Slack channel ID for AI review posts     |
| `N8N_WEBHOOK_URL`         | ai-review.yml | Optional — n8n webhook for event routing |

---

## GitHub Environments to Configure

`deploy.yml` uses GitHub Environments for secret scoping. Create these two:

| Environment  | Protection Rules                       |
| ------------ | -------------------------------------- |
| `staging`    | None (auto-deploy on push to main)     |
| `production` | Required reviewer + `main` branch only |

Each environment should override `FIREBASE_SERVICE_ACCOUNT` and `GCP_SA_KEY`
with the appropriate project's credentials.

---

## Post-Setup Verification

- [ ] Push to `develop` → CI runs, all jobs green
- [ ] Open PR → AI review posts to Slack channel
- [ ] Merge to `main` (web change) → `deploy.yml` deploys web only
- [ ] Merge to `main` (backend change) → backend Cloud Run updated
- [ ] Merge to `main` (functions change) → Firebase Functions updated
- [ ] `workflow_dispatch` deploy with `production` env → reviewer approval
      required
- [ ] Push `mobile-v*` tag → iOS + Android builds trigger
- [ ] Verify Slack deploy notifications arrive
