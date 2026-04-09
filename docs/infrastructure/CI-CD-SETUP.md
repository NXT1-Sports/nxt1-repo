# NXT1 CI/CD Pipeline Setup Guide

This guide covers the complete setup for automated testing, web deployment,
mobile builds, n8n/Slack notifications, and AI-powered code review.

## Table of Contents

1. [Overview](#overview)
2. [GitHub Secrets & Variables Setup](#github-secrets--variables-setup)
3. [n8n Integration (Recommended)](#n8n-integration-recommended)
4. [Slack Integration (Fallback)](#slack-integration-fallback)
5. [Claude AI Integration](#claude-ai-integration)
6. [Web Deployment (Firebase App Hosting)](#web-deployment-firebase-app-hosting)
7. [Mobile Builds (iOS)](#mobile-builds-ios)
8. [Mobile Builds (Android)](#mobile-builds-android)
9. [Turborepo Remote Caching](#turborepo-remote-caching)
10. [Workflow Triggers](#workflow-triggers)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The NXT1 monorepo uses GitHub Actions for CI/CD with the following pipelines:

| Workflow            | Trigger                  | Purpose                            |
| ------------------- | ------------------------ | ---------------------------------- |
| `ci.yml`            | PR, Push to main/develop | Lint, typecheck, build, test       |
| `deploy-web.yml`    | Push to main, Manual     | Deploy web to Firebase App Hosting |
| `deploy-mobile.yml` | Tag, Manual              | Build iOS/Android, distribute      |
| `ai-review.yml`     | PR, Comment commands     | Claude code review & auto-fixes    |
| `release.yml`       | Manual                   | Version bump, changelog, release   |

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Actions                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐     ┌──────────┐     ┌──────────────────────────┐ │
│  │    CI    │────▶│   Build  │────▶│  Deploy (Web/Mobile)     │ │
│  │  (lint,  │     │  (turbo) │     │                          │ │
│  │  test)   │     │          │     │  ┌────────┐ ┌─────────┐  │ │
│  └──────────┘     └──────────┘     │  │Firebase│ │ App     │  │ │
│                                    │  │Hosting │ │ Stores  │  │ │
│                                    │  └────────┘ └─────────┘  │ │
│                                    └──────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                   Unified Notifications                     │ │
│  │  All workflows → .github/actions/notify → n8n OR Slack     │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      n8n (Event Router)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│    Event Type + Status + Environment → Smart Routing             │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐│
│  │  Slack   │ │  Linear  │ │ PagerDuty│ │  Email   │ │ Custom ││
│  │ #builds  │ │auto-issue│ │ prod fail│ │ critical │ │webhooks││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## GitHub Secrets & Variables Setup

> **Organization vs Repository Secrets**
>
> Since NXT1 is a GitHub **Organization**, secrets should be stored at
> **organization level** so they can be shared across all repos without
> duplication:
>
> - **Org-level secrets**:
>   `github.com/organizations/NXT1/settings/secrets/actions`
>
>   Store here: `FIREBASE_SERVICE_ACCOUNT_STAGING`,
>   `FIREBASE_SERVICE_ACCOUNT_PROD`, `FIREBASE_SERVICE_ACCOUNT`, `GCP_SA_KEY`,
>   `TURBO_TOKEN`, `SLACK_WEBHOOK_URL`, `ANTHROPIC_API_KEY`, `CODECOV_TOKEN`,
>   `SNYK_TOKEN`, `MATCH_PASSWORD`, `MATCH_GIT_URL`,
>   `MATCH_GIT_BASIC_AUTHORIZATION`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`,
>   `APPLE_API_KEY`, `APPLE_TEAM_ID`, `ANDROID_KEYSTORE_BASE64`,
>   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`,
>   `GOOGLE_PLAY_JSON_KEY`, `FIREBASE_IOS_APP_ID`, `FIREBASE_ANDROID_APP_ID`
>
> - **Repo-level secrets** (repo-specific, keep at repo level): Nothing in this
>   project needs to be repo-only.
> - **Org-level variables** (`vars`): `TURBO_TEAM`, `N8N_WEBHOOK_URL`,
>   `FIREBASE_PROJECT_ID`, `GCP_PROJECT_ID`, `GCP_REGION`
>
> When creating org secrets, set **Repository access** to "All repositories" (or
> restrict to `nxt1-repo` specifically).
>
> ⚠️ If a secret exists at both org and repo level, the **repo-level one takes
> precedence**. Delete repo-level duplicates after migrating to org level.

Navigate to **Organization Settings → Secrets and variables → Actions** to
manage org-level secrets.

### Required Secrets

#### General

| Secret              | Description                                 |
| ------------------- | ------------------------------------------- |
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications (fallback)  |
| `ANTHROPIC_API_KEY` | Claude API key for AI code review           |
| `CODECOV_TOKEN`     | Codecov token for coverage reports          |
| `SNYK_TOKEN`        | Snyk token for security scanning (optional) |

#### Firebase / GCP

| Secret                             | Description                                 |
| ---------------------------------- | ------------------------------------------- |
| `FIREBASE_SERVICE_ACCOUNT_STAGING` | Service account JSON for staging project    |
| `FIREBASE_SERVICE_ACCOUNT_PROD`    | Service account JSON for production project |
| `FIREBASE_IOS_APP_ID`              | Firebase iOS App ID (for distribution)      |
| `FIREBASE_ANDROID_APP_ID`          | Firebase Android App ID (for distribution)  |

#### iOS Signing

| Secret                          | Description                               |
| ------------------------------- | ----------------------------------------- |
| `MATCH_PASSWORD`                | Password for Match certificate encryption |
| `MATCH_GIT_URL`                 | Git URL for Match certificates repo       |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Git credentials (username:token)          |
| `APPLE_API_KEY_ID`              | App Store Connect API Key ID              |
| `APPLE_API_ISSUER_ID`           | App Store Connect Issuer ID               |
| `APPLE_API_KEY`                 | App Store Connect API Key (.p8 content)   |
| `APPLE_TEAM_ID`                 | Apple Developer Team ID                   |

#### Android Signing

| Secret                      | Description                      |
| --------------------------- | -------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded keystore file     |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                |
| `ANDROID_KEY_ALIAS`         | Key alias in keystore            |
| `ANDROID_KEY_PASSWORD`      | Key password                     |
| `GOOGLE_PLAY_JSON_KEY`      | Google Play service account JSON |

### Required Variables

| Variable          | Example                                         | Description                    |
| ----------------- | ----------------------------------------------- | ------------------------------ |
| `TURBO_TEAM`      | `team_xxx`                                      | Vercel team for remote caching |
| `N8N_WEBHOOK_URL` | `https://n8n.your-domain.com/webhook/nxt1-cicd` | n8n webhook endpoint           |

---

## n8n Integration (Recommended)

n8n acts as a central hub for all CI/CD notifications, enabling smart routing to
multiple destinations.

### Why n8n?

| Feature                     | Direct Slack         | n8n Hub        |
| --------------------------- | -------------------- | -------------- |
| Single destination          | ✅                   | ✅             |
| Multiple channels           | Manual per workflow  | ✅ Auto-routed |
| PagerDuty for prod failures | Separate integration | ✅ Built-in    |
| Auto-create Linear issues   | ❌                   | ✅             |
| Custom filtering            | ❌                   | ✅             |
| Change routing without code | ❌                   | ✅             |

### Setup n8n

#### Option A: Self-Hosted (Recommended for Enterprise)

```bash
# Docker
docker run -d --name n8n -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Or docker-compose
version: '3'
services:
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    volumes:
      - ~/.n8n:/home/node/.n8n
    environment:
      - N8N_HOST=n8n.your-domain.com
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.your-domain.com
```

#### Option B: n8n Cloud

1. Go to [n8n.io](https://n8n.io) and sign up
2. Create a new workflow
3. Get your webhook URL

### Import the Workflow

1. Open your n8n instance
2. Click **Workflows → Import from File**
3. Select `.github/n8n/nxt1-cicd-router.json`
4. Configure variables:

| Variable                | Value                               |
| ----------------------- | ----------------------------------- |
| `SLACK_WEBHOOK_URL`     | Your main Slack webhook             |
| `SLACK_URGENT_WEBHOOK`  | Slack webhook for #urgent channel   |
| `PAGERDUTY_ROUTING_KEY` | PagerDuty Events API v2 routing key |
| `LINEAR_API_KEY`        | Linear API key                      |
| `LINEAR_TEAM_ID`        | Linear team ID                      |

5. **Activate the workflow**
6. Copy the webhook URL (e.g., `https://n8n.your-domain.com/webhook/nxt1-cicd`)
7. Add to GitHub as `N8N_WEBHOOK_URL` variable

### Event Payload Schema

All workflows send events with this unified schema:

```json
{
  "source": "github-actions",
  "event_type": "ci | deploy-web | deploy-mobile | ai-review | release",
  "status": "success | failure | warning | info",
  "title": "Human-readable title",
  "message": "Details message",
  "environment": "development | staging | production",
  "repository": "owner/repo",
  "ref": "main",
  "sha": "full-commit-sha",
  "sha_short": "abc1234",
  "run_id": "123456789",
  "run_url": "https://github.com/.../actions/runs/...",
  "actor": "username",
  "timestamp": "2026-01-15T10:30:00Z",
  "details": {
    // Event-specific data
  }
}
```

### n8n Routing Logic

The workflow routes events based on:

| Condition                                    | Destination                  |
| -------------------------------------------- | ---------------------------- |
| All events                                   | Slack #builds                |
| `status=failure` && `environment=production` | Slack #urgent + PagerDuty    |
| `event_type=ai-review`                       | Linear (auto-create issue)   |
| `event_type=deploy-*` && `status=success`    | Discord #releases (optional) |

### Customizing Routes

Edit the **Route Event** switch node in n8n to add/modify routing rules:

```javascript
// Example: Add Discord notification for releases
{
  outputKey: "discord",
  conditions: {
    combinator: "and",
    conditions: [
      { leftValue: "={{ $json.event_type }}", rightValue: "release", operator: "equals" }
    ]
  }
}
```

---

## Slack Integration (Fallback)

Slack is used as a fallback when n8n is not configured. If `N8N_WEBHOOK_URL` is
not set, notifications go directly to Slack.

### Setup Slack Webhook

1. **Create Slack App**
   - Go to [api.slack.com/apps](https://api.slack.com/apps)
   - Click "Create New App" → "From scratch"
   - Name it "NXT1 CI/CD" and select your workspace

2. **Enable Incoming Webhooks**
   - Go to "Incoming Webhooks" in the sidebar
   - Toggle "Activate Incoming Webhooks" ON
   - Click "Add New Webhook to Workspace"
   - Select the channel (e.g., `#deployments` or `#dev-alerts`)
   - Copy the webhook URL

3. **Add to GitHub Secrets**
   - Go to your repo → Settings → Secrets → Actions
   - Add `SLACK_WEBHOOK_URL` with the webhook URL

### Notification Types

| Event               | Channel Suggestion | Content                           |
| ------------------- | ------------------ | --------------------------------- |
| Deploy success/fail | `#deployments`     | Environment, status, commit link  |
| Mobile build        | `#mobile-builds`   | Platform, profile, download links |
| Release created     | `#releases`        | Version, changelog                |
| CI failure          | `#dev-alerts`      | Failed job, PR link               |

### Customize Notifications

Edit the Slack payload in any workflow:

```yaml
- name: Send Slack notification
  uses: slackapi/slack-github-action@v1.25.0
  with:
    payload: |
      {
        "text": "Your message here",
        "blocks": [...]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## Claude AI Integration

Claude automatically reviews PRs and can fix common issues.

### Setup

1. **Get Anthropic API Key**
   - Go to [console.anthropic.com](https://console.anthropic.com)
   - Create an API key
   - Add as `ANTHROPIC_API_KEY` secret in GitHub

### Features

#### Automatic PR Review

Every PR gets an AI review comment with:

- Summary of changes
- Potential issues/bugs
- Performance suggestions
- Code quality score (1-10)

#### Commands in PR Comments

| Command                   | What it does                              |
| ------------------------- | ----------------------------------------- |
| `@claude fix`             | Auto-fixes lint/format issues and commits |
| `@claude suggest <error>` | Analyzes error and suggests fix           |

### Example Usage

**Auto-fix lint issues:**

```
@claude fix
```

**Get help with a specific error:**

```
@claude suggest TypeError: Cannot read property 'map' of undefined at ProfileService.ts:45
```

**Ask for suggestions on CI failure:**

```
@claude suggest The build is failing with "Module not found: @nxt1/core"
```

### How It Works

```
PR Opened/Updated
       ↓
Claude reviews diff automatically
       ↓
Posts review comment with issues/suggestions
       ↓
Developer comments "@claude fix"
       ↓
Workflow runs lint:fix and format
       ↓
Commits changes to PR branch
```

### Cost Considerations

- Uses Claude 3.5 Sonnet (~$3/1M input tokens, ~$15/1M output tokens)
- Average PR review: ~5K tokens = ~$0.02
- Estimate: 100 PRs/month ≈ $2-5/month

---

## Web Deployment (Firebase App Hosting)

### Initial Setup

1. **Install Firebase CLI**

   ```bash
   npm install -g firebase-tools
   firebase login
   ```

2. **Link to Firebase project**

   ```bash
   cd nxt1-monorepo
   firebase use nxt-1-staging --add
   firebase use nxt-1-de054 --add  # production
   ```

3. **Create service accounts**

   ```bash
   # For each project, create a service account with these roles:
   # - Firebase Hosting Admin
   # - Service Account User
   # - Cloud Build Editor

   # Download JSON and add as GitHub secret
   ```

### How It Works

- **Automatic**: Push to `main` deploys to staging
- **Manual**: Use workflow dispatch for production
- Smoke tests verify deployment health
- PR previews available via Firebase preview channels

---

## Mobile Builds (iOS)

### Prerequisites

1. **Apple Developer Account** (with App Store Connect access)
2. **Private Git repository** for Match certificates

### Setup Match (Code Signing)

```bash
# Install Fastlane locally
cd apps/mobile/ios/App
bundle install

# Initialize Match (first time only)
bundle exec fastlane match init

# Generate certificates (run from a Mac)
bundle exec fastlane match development
bundle exec fastlane match adhoc
bundle exec fastlane match appstore
```

### App Store Connect API Key

1. Go to
   [App Store Connect → Users and Access → Keys](https://appstoreconnect.apple.com/access/api)
2. Generate a new key with "App Manager" role
3. Download the `.p8` file
4. Add to GitHub secrets:
   - `APPLE_API_KEY_ID`: The Key ID
   - `APPLE_API_ISSUER_ID`: The Issuer ID
   - `APPLE_API_KEY`: Contents of the .p8 file

### Build Profiles

| Profile       | Export Method | Distribution              |
| ------------- | ------------- | ------------------------- |
| `development` | development   | Local testing             |
| `staging`     | ad-hoc        | Firebase App Distribution |
| `production`  | app-store     | TestFlight / App Store    |

---

## Mobile Builds (Android)

### Create Signing Keystore

```bash
# Generate keystore (keep this safe!)
keytool -genkey -v -keystore nxt1-release.keystore \
  -alias nxt1 -keyalg RSA -keysize 2048 -validity 10000

# Encode for GitHub secret
base64 -i nxt1-release.keystore | pbcopy
# Paste as ANDROID_KEYSTORE_BASE64 secret
```

### Google Play Service Account

1. Go to
   [Google Play Console → Setup → API access](https://play.google.com/console/developers)
2. Link to Google Cloud project
3. Create service account with these roles:
   - Release Manager
   - View app information
4. Download JSON key
5. Grant access in Play Console under "Users and permissions"
6. Add JSON as `GOOGLE_PLAY_JSON_KEY` secret

### Build Types

| Profile       | Output      | Distribution              |
| ------------- | ----------- | ------------------------- |
| `development` | Debug APK   | Local testing             |
| `staging`     | Release APK | Firebase App Distribution |
| `production`  | Release AAB | Play Store                |

---

## Turborepo Remote Caching

Remote caching dramatically speeds up CI by sharing build artifacts.

### Setup with Vercel

1. **Create Vercel account** and link to team
2. **Generate token**:
   ```bash
   npx turbo login
   npx turbo link
   ```
3. **Add to GitHub**:
   - Secret: `TURBO_TOKEN` (from `~/.turbo/config.json`)
   - Variable: `TURBO_TEAM` (team slug)

### Self-hosted Alternative

You can also self-host using
[ducktors/turborepo-remote-cache](https://github.com/ducktors/turborepo-remote-cache).

---

## Workflow Triggers

### Automatic Triggers

```yaml
# CI runs on every PR and push
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

# Web deploy on push to main (specific paths)
on:
  push:
    branches: [main]
    paths:
      - 'apps/web/**'
      - 'packages/core/**'

# Mobile deploy on tags
on:
  push:
    tags:
      - 'mobile-v*'
```

### Manual Triggers

All workflows support manual triggers via **Actions → Select Workflow → Run
workflow**

| Workflow      | Options                                               |
| ------------- | ----------------------------------------------------- |
| Deploy Web    | Environment (staging/production)                      |
| Deploy Mobile | Platform (ios/android/all), Profile, Submit to stores |

---

## Troubleshooting

### Common Issues

#### CI Fails on Lint

```bash
# Fix locally
npm run lint:fix
npm run format
git add -A && git commit -m "fix: lint errors"
```

#### iOS Build Fails - Code Signing

```bash
# Regenerate certificates
cd apps/mobile/ios/App
bundle exec fastlane match nuke development
bundle exec fastlane match development
```

#### Android Build Fails - Keystore

```bash
# Verify keystore
keytool -list -v -keystore nxt1-release.keystore

# Check alias matches secret
echo $ANDROID_KEY_ALIAS
```

#### Turbo Cache Miss

```bash
# Clear local cache
npm run clean:cache

# Force rebuild
npm run build -- --force
```

### Debug Workflow

Add `ACTIONS_STEP_DEBUG` secret with value `true` for verbose logs.

### Local Testing

```bash
# Test Fastlane locally
cd apps/mobile/ios/App
bundle exec fastlane dev

cd apps/mobile/android
bundle exec fastlane dev

# Test full build
npm run build
npm run test
```

---

## Release Process

### Web Release

1. Create PR to `main`
2. CI validates changes
3. Merge triggers staging deploy
4. QA tests staging
5. Manual trigger production deploy

### Mobile Release

1. Update version in `capacitor.config.json`
2. Create tag: `git tag mobile-v1.2.3 && git push --tags`
3. Workflow builds both platforms
4. **Staging**: Auto-distributes to Firebase
5. **Production**: Manual workflow with "submit" option

### Semantic Versioning

```bash
# Patch release (bug fixes)
npm run version:patch

# Minor release (new features)
npm run version:minor

# Major release (breaking changes)
npm run version:major
```

---

## Security Considerations

1. **Never commit secrets** - Use GitHub Secrets exclusively
2. **Rotate keys regularly** - Especially App Store Connect and Play Store keys
3. **Limit secret access** - Use environments for production secrets
4. **Audit dependencies** - Snyk and npm audit run in CI
5. **Protected branches** - Require PR reviews for main branch

---

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Firebase App Hosting](https://firebase.google.com/docs/app-hosting)
- [Fastlane Documentation](https://docs.fastlane.tools/)
- [Capacitor Deployment](https://capacitorjs.com/docs/guides/deploying-updates)
- [Turborepo Remote Caching](https://turbo.build/repo/docs/core-concepts/remote-caching)
