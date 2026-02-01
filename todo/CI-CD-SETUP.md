# CI/CD Pipeline Setup

## Status: ✅ Complete

> Last updated: February 1, 2026  
> From: `docs/CI-CD-SETUP.md`

---

## ✅ Workflow Files Created

All GitHub Actions workflows are implemented in `.github/workflows/`:

| Workflow               | File                | Purpose                           | Status      |
| ---------------------- | ------------------- | --------------------------------- | ----------- |
| Continuous Integration | `ci.yml`            | Lint, typecheck, build, test      | ✅ Complete |
| Web Deployment         | `deploy-web.yml`    | Deploy to Firebase App Hosting    | ✅ Complete |
| Mobile Deployment      | `deploy-mobile.yml` | Build iOS/Android apps            | ✅ Complete |
| AI Code Review         | `ai-review.yml`     | Claude-powered PR review          | ✅ Complete |
| E2E Tests              | `e2e.yml`           | Playwright E2E test runner        | ✅ Complete |
| Release                | `release.yml`       | Version bump, changelog           | ✅ Complete |
| General Deploy         | `deploy.yml`        | Combined deployment orchestration | ✅ Complete |

---

## GitHub Secrets to Configure

### General (Required)

| Secret              | Status | Notes                              |
| ------------------- | ------ | ---------------------------------- |
| `SLACK_WEBHOOK_URL` | - [ ]  | Slack webhook for notifications    |
| `ANTHROPIC_API_KEY` | - [ ]  | Claude API key for AI code review  |
| `CODECOV_TOKEN`     | - [ ]  | Codecov token for coverage reports |
| `SNYK_TOKEN`        | - [ ]  | (Optional) Security scanning       |

### Firebase / GCP (Required)

| Secret                             | Status | Notes                               |
| ---------------------------------- | ------ | ----------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_STAGING` | - [ ]  | Service account JSON for staging    |
| `FIREBASE_SERVICE_ACCOUNT_PROD`    | - [ ]  | Service account JSON for production |
| `FIREBASE_IOS_APP_ID`              | - [ ]  | Firebase iOS App ID                 |
| `FIREBASE_ANDROID_APP_ID`          | - [ ]  | Firebase Android App ID             |

### iOS Signing (For Mobile Releases)

| Secret                          | Status | Notes                                 |
| ------------------------------- | ------ | ------------------------------------- |
| `MATCH_PASSWORD`                | - [ ]  | Match certificate encryption password |
| `MATCH_GIT_URL`                 | - [ ]  | Git URL for Match certificates repo   |
| `MATCH_GIT_BASIC_AUTHORIZATION` | - [ ]  | Git credentials (username:token)      |
| `APPLE_API_KEY_ID`              | - [ ]  | App Store Connect API Key ID          |
| `APPLE_API_ISSUER_ID`           | - [ ]  | App Store Connect Issuer ID           |
| `APPLE_API_KEY`                 | - [ ]  | App Store Connect API Key (.p8)       |
| `APPLE_TEAM_ID`                 | - [ ]  | Apple Developer Team ID               |

### Android Signing (For Mobile Releases)

| Secret                      | Status | Notes                            |
| --------------------------- | ------ | -------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | - [ ]  | Base64-encoded keystore file     |
| `ANDROID_KEYSTORE_PASSWORD` | - [ ]  | Keystore password                |
| `ANDROID_KEY_ALIAS`         | - [ ]  | Key alias in keystore            |
| `ANDROID_KEY_PASSWORD`      | - [ ]  | Key password                     |
| `GOOGLE_PLAY_JSON_KEY`      | - [ ]  | Google Play service account JSON |

---

## GitHub Variables to Configure

| Variable          | Status | Example                                         |
| ----------------- | ------ | ----------------------------------------------- |
| `TURBO_TEAM`      | - [ ]  | `team_xxx` (Vercel team for remote caching)     |
| `N8N_WEBHOOK_URL` | - [ ]  | `https://n8n.your-domain.com/webhook/nxt1-cicd` |

---

## Workflow Files ✅ COMPLETE

All workflow files have been created:

- [x] `.github/workflows/ci.yml` - Lint, typecheck, build, test
- [x] `.github/workflows/deploy-web.yml` - Deploy to Firebase App Hosting
- [x] `.github/workflows/deploy-mobile.yml` - Build iOS/Android
- [x] `.github/workflows/ai-review.yml` - Claude code review
- [x] `.github/workflows/release.yml` - Version bump, changelog
- [x] `.github/workflows/e2e.yml` - Playwright E2E tests
- [x] `.github/workflows/deploy.yml` - Combined deployment
- [x] `.github/actions/notify/action.yml` - Unified notification action

---

## n8n Integration (Optional but Recommended)

- [ ] Set up n8n instance (self-hosted or cloud)
- [ ] Create webhook endpoint for CI/CD events
- [ ] Configure routing rules:
  - Build failures → Slack #builds
  - Production failures → PagerDuty
  - Auto-create Linear issues for failures

---

## Turborepo Remote Caching

- [ ] Create Vercel account/team
- [ ] Generate `TURBO_TOKEN`
- [ ] Add `TURBO_TEAM` and `TURBO_TOKEN` to GitHub secrets
- [ ] Verify caching works: `turbo build --dry-run`

---

## Post-Setup Verification

- [ ] Push to `develop` branch → CI runs
- [ ] Open PR → AI review triggers
- [ ] Merge to `main` → Deploy workflow runs
- [ ] Tag release → Mobile build triggers
- [ ] Verify Slack notifications arrive
