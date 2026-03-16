# CI/CD Pipeline — Remaining Configuration

> Last updated: March 15, 2026 Workflow files are all complete. Only
> secrets/variables and verification remain.

---

## GitHub Secrets to Configure

### General

| Secret              | Notes                              |
| ------------------- | ---------------------------------- |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications    |
| `ANTHROPIC_API_KEY` | Claude API key for AI code review  |
| `CODECOV_TOKEN`     | Codecov token for coverage reports |
| `SNYK_TOKEN`        | (Optional) Security scanning       |

### Firebase / GCP

| Secret                             | Notes                               |
| ---------------------------------- | ----------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_STAGING` | Service account JSON for staging    |
| `FIREBASE_SERVICE_ACCOUNT_PROD`    | Service account JSON for production |
| `FIREBASE_IOS_APP_ID`              | Firebase iOS App ID                 |
| `FIREBASE_ANDROID_APP_ID`          | Firebase Android App ID             |

### iOS Signing

| Secret                          | Notes                                 |
| ------------------------------- | ------------------------------------- |
| `MATCH_PASSWORD`                | Match certificate encryption password |
| `MATCH_GIT_URL`                 | Git URL for Match certificates repo   |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Git credentials (username:token)      |
| `APPLE_API_KEY_ID`              | App Store Connect API Key ID          |
| `APPLE_API_ISSUER_ID`           | App Store Connect Issuer ID           |
| `APPLE_API_KEY`                 | App Store Connect API Key (.p8)       |
| `APPLE_TEAM_ID`                 | Apple Developer Team ID               |

### Android Signing

| Secret                      | Notes                            |
| --------------------------- | -------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded keystore file     |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                |
| `ANDROID_KEY_ALIAS`         | Key alias in keystore            |
| `ANDROID_KEY_PASSWORD`      | Key password                     |
| `GOOGLE_PLAY_JSON_KEY`      | Google Play service account JSON |

---

## GitHub Variables to Configure

| Variable          | Example                                         |
| ----------------- | ----------------------------------------------- |
| `TURBO_TEAM`      | `team_xxx` (Vercel team for remote caching)     |
| `N8N_WEBHOOK_URL` | `https://n8n.your-domain.com/webhook/nxt1-cicd` |

---

## Optional Setup

- [ ] Set up n8n instance for CI/CD event routing
- [ ] Create Vercel account/team for Turborepo remote caching
- [ ] Generate `TURBO_TOKEN` and add to GitHub secrets

---

## Post-Setup Verification

- [ ] Push to `develop` branch → CI runs
- [ ] Open PR → AI review triggers
- [ ] Merge to `main` → Deploy workflow runs
- [ ] Tag release → Mobile build triggers
- [ ] Verify Slack notifications arrive
