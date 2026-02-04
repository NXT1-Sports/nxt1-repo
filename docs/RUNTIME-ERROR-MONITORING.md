# Runtime Error Monitoring & Auto-Fix Setup

> **Production-Grade Crash Monitoring** — Automatic detection, AI analysis, and
> fix generation for runtime errors across all platforms.

---

## Architecture Overview

```
Crashlytics → Cloud Function → n8n Router → Slack + GitHub Actions → AI Fix PR
                                    ↓
                              [Human Approval]
                                    ↓
                              Auto-Deploy (Staging)
                              Manual Merge (Production)
```

### Flow Details

1. **Error Occurs** — iOS/Android crash or web exception logged to Firebase
   Crashlytics
2. **Webhook Trigger** — Firebase sends alert to Cloud Function
   (`crashlyticsWebhook`)
3. **Cloud Function** — Processes alert, calculates severity, logs to Firestore
4. **Parallel Dispatch:**
   - Slack urgent alert with "AI Analysis" button
   - n8n workflow routes based on severity
   - GitHub Actions triggered for AI analysis
5. **AI Analysis** — Claude analyzes stack trace + affected code + recent
   commits
6. **Fix Generation** — High-confidence fixes → auto-create PR
7. **Human in Loop:**
   - Staging: Auto-merge if CI passes + high confidence
   - Production: Requires manual approval
8. **Deploy** — CI/CD pipeline deploys fix automatically

---

## Setup Instructions

### 1. Deploy Cloud Function

```bash
cd nxt1-monorepo

# Build the function
npm run build --workspace=@nxt1/functions

# Deploy to Firebase (staging first)
npm run deploy:staging --workspace=@nxt1/functions

# Verify deployment
firebase functions:log --only crashlyticsWebhook

# Deploy to production after testing
npm run deploy:prod --workspace=@nxt1/functions
```

**Environment Variables Required:**

```bash
# Set secrets in Firebase
firebase functions:secrets:set SLACK_BOT_TOKEN
firebase functions:secrets:set N8N_WEBHOOK_URL

# Or use .env.production (not recommended for secrets)
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/nxt1-cicd
```

### 2. Configure Firebase Crashlytics Webhook

#### Firebase Console Steps:

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your Project
2. Navigate to **Project Settings** → **Integrations**
3. Find **Crashlytics** → Click **Manage**
4. Click **Add Webhook**
5. Enter webhook URL:
   ```
   https://us-central1-[YOUR-PROJECT-ID].cloudfunctions.net/crashlyticsWebhook
   ```
6. Select alert types:
   - ✅ New fatal issues
   - ✅ New non-fatal issues
   - ✅ Regressions
   - ✅ Velocity alerts (spike in crashes)
   - ✅ ANR (Android only)
7. Set thresholds:
   - **Min users affected:** 1 (catches all issues)
   - **Min crash count:** 5 (avoids noise)
   - **Velocity threshold:** 50% increase in 1 hour
8. Click **Save**

#### Verify Webhook:

```bash
# Test with curl
curl -X POST https://us-central1-[PROJECT-ID].cloudfunctions.net/crashlyticsWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "alertType": "newFatalIssue",
    "projectId": "nxt-1",
    "app": {
      "bundleId": "com.nxt1.app",
      "platform": "IOS",
      "displayName": "NXT1"
    },
    "issue": {
      "id": "test-123",
      "title": "Test Crash",
      "subtitle": "Testing webhook",
      "appVersion": "1.0.0",
      "impactedUsers": 1,
      "crashCount": 1,
      "firstOccurrence": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "lastOccurrence": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "url": "https://console.firebase.google.com"
    }
  }'

# Check logs
firebase functions:log --only crashlyticsWebhook --limit 5
```

### 3. Configure GitHub Secrets

Required secrets in GitHub repository settings:

```bash
# Go to: https://github.com/[YOUR-ORG]/nxt1-monorepo/settings/secrets/actions

ANTHROPIC_API_KEY          # Claude API key
SLACK_BOT_TOKEN            # Slack bot OAuth token
N8N_WEBHOOK_URL            # n8n webhook endpoint (optional if using direct Slack)
GITHUB_TOKEN               # Auto-provided by GitHub Actions
```

### 4. Setup n8n Workflow (Optional - Advanced Routing)

If using n8n for advanced routing (PagerDuty, Linear, etc.):

```bash
# Import workflow
cd nxt1-monorepo/.github/n8n
# In n8n UI: Import → Select nxt1-cicd-router.json

# Set n8n variables:
SLACK_BOT_TOKEN       # Same as GitHub secret
GITHUB_TOKEN          # Personal access token with repo + workflow scope
GITHUB_OWNER          # Your GitHub username/org
GITHUB_REPO           # Repository name (e.g., nxt1-monorepo)
LINEAR_API_KEY        # Linear API key (optional)
LINEAR_TEAM_ID        # Linear team ID (optional)
PAGERDUTY_KEY         # PagerDuty integration key (optional)

# Enable workflow and get webhook URL
# Add to Firebase function environment:
firebase functions:config:set n8n.webhook_url="https://your-n8n.com/webhook/nxt1-cicd"
```

### 5. Configure Slack Bot

#### Create Slack App:

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App
2. Choose "From scratch" → Name: "NXT1 CI/CD Bot"
3. Add bot scopes (OAuth & Permissions):
   - `chat:write`
   - `chat:write.public`
   - `channels:read`
   - `groups:read`
4. Install app to workspace
5. Copy **Bot User OAuth Token** (starts with `xoxb-`)
6. Add bot to channels:
   ```
   /invite @NXT1 CI/CD Bot
   ```
   in `#urgent-alerts`, `#staging-alerts`, `#builds`

#### Interactive Components:

1. In Slack app settings → **Interactivity & Shortcuts**
2. Enable interactivity
3. Set Request URL:
   ```
   https://your-n8n-instance.com/webhook/slack-interactions
   ```
   (or your backend endpoint if handling directly)
4. Add action IDs:
   - `ai_analyze_crash`
   - `create_fix_pr`
   - `claude_suggest`
   - `claude_autofix`

### 6. Test End-to-End

#### Trigger Test Crash (Mobile):

```typescript
// In your mobile app (for testing only!)
import { Crashlytics } from '@capacitor-firebase/crashlytics';

// Trigger test crash
await Crashlytics.crash({ message: 'Test crash from setup' });
```

#### Trigger Test Error (Web):

```typescript
// In browser console or component
throw new Error('Test error from setup');
```

#### Expected Flow:

1. ⏱️ **~30 seconds** — Firebase processes crash
2. 🔔 **~5 seconds** — Cloud Function receives webhook
3. 📱 **~2 seconds** — Slack alert appears in `#urgent-alerts`
4. 🤖 **~10 seconds** — GitHub Actions starts AI analysis
5. 💬 **~30 seconds** — Analysis posted to Slack
6. 🔧 **~60 seconds** — Fix PR created (if high confidence)

---

## Severity Levels & Routing

| Severity | Criteria                          | Routing                                     |
| -------- | --------------------------------- | ------------------------------------------- |
| CRITICAL | 100+ users OR 50+ crashes (fatal) | Slack urgent + PagerDuty + Immediate AI fix |
| HIGH     | 10+ users OR 10+ crashes OR ANR   | Slack urgent + AI fix within 5 min          |
| MEDIUM   | Regression OR 1-9 users affected  | Slack standard + AI analysis                |
| LOW      | Non-fatal, <1 user, low impact    | Slack standard + Log only                   |

## Human-in-Loop Decision Matrix

| Environment | Severity | AI Confidence | Action                        |
| ----------- | -------- | ------------- | ----------------------------- |
| Production  | Critical | High          | Create PR → Manual approval   |
| Production  | Critical | Medium/Low    | Suggest manual fix            |
| Production  | High     | High          | Create PR → Manual approval   |
| Production  | Medium   | High          | Create PR → Manual approval   |
| Staging     | Critical | High          | Create PR → Auto-merge        |
| Staging     | High     | High          | Create PR → Auto-merge        |
| Staging     | Medium   | High          | Create PR → Requires approval |
| Any         | Any      | Low           | AI analysis only, no PR       |

---

## Monitoring & Alerts

### Check Cloud Function Health:

```bash
# View recent logs
firebase functions:log --only crashlyticsWebhook --limit 20

# Monitor errors
firebase functions:log --only crashlyticsWebhook --filter "error" --limit 10

# Check invocation count
gcloud functions describe crashlyticsWebhook --region us-central1 --gen2
```

### Check GitHub Actions:

```bash
# View workflow runs
gh run list --workflow=runtime-error-fix.yml --limit 10

# View specific run
gh run view [RUN_ID]

# View logs
gh run view [RUN_ID] --log
```

### Check Crashlytics Alert History:

```bash
# Query Firestore
firebase firestore:query crashlytics_alerts \
  --limit 20 \
  --order-by timestamp desc
```

---

## Troubleshooting

### Cloud Function Not Receiving Webhooks

1. Check Firebase Crashlytics integration is enabled
2. Verify webhook URL is correct (no typos)
3. Check function logs: `firebase functions:log --only crashlyticsWebhook`
4. Test manually with curl (see Verify Webhook section)

### Slack Alerts Not Appearing

1. Verify `SLACK_BOT_TOKEN` secret is set correctly
2. Check bot is added to target channels
3. Verify bot has `chat:write` and `chat:write.public` scopes
4. Check function logs for "Slack alert sent" confirmation

### GitHub Actions Not Triggering

1. Verify `ANTHROPIC_API_KEY` secret is set
2. Check workflow file syntax: `gh workflow view runtime-error-fix.yml`
3. Verify n8n webhook is reachable (if using n8n routing)
4. Check GitHub Actions logs for dispatch errors

### AI Fix PR Not Created

1. Check Claude API quota/limits
2. Verify file paths in stack trace match repository structure
3. Check if `is_fixable=yes` in analysis output
4. Review GitHub Actions logs for "Create Fix PR" job

### Low Confidence Fixes

Common reasons AI marks fixes as low confidence:

- Stack trace is truncated or obfuscated (enable source maps)
- Error in third-party library (not fixable in your code)
- Complex race condition or async issue (needs manual review)
- Missing context (file not in recent commits)

**Solution:** Improve source map uploads for better stack traces:

```bash
# iOS
# In Xcode build phase, upload dSYMs to Crashlytics

# Android
# In app/build.gradle:
android {
  buildTypes {
    release {
      firebaseCrashlytics {
        mappingFileUploadEnabled true
      }
    }
  }
}

# Web (Angular)
# In angular.json:
"sourceMap": {
  "scripts": true,
  "styles": true,
  "hidden": true
}
```

---

## Cost Estimate

| Service               | Usage                       | Monthly Cost   |
| --------------------- | --------------------------- | -------------- |
| Cloud Functions       | ~1000 invocations/mo        | Free tier      |
| Firestore             | ~1000 writes + 10K reads/mo | Free tier      |
| Claude API            | ~50 analyses/mo (3K tokens) | ~$1-2          |
| GitHub Actions        | ~50 workflow runs/mo        | Free (2K mins) |
| n8n (self-hosted)     | Included                    | $0             |
| n8n (cloud)           | Starter plan                | $20            |
| Slack                 | Standard plan               | $7.25/user     |
| **Total (no n8n)**    |                             | **~$1-2/mo**   |
| **Total (n8n cloud)** |                             | **~$21-22/mo** |

---

## Security Considerations

1. **Secrets Management:**
   - Never commit `SLACK_BOT_TOKEN` or `ANTHROPIC_API_KEY` to Git
   - Use Firebase Secrets Manager for Cloud Functions
   - Use GitHub Secrets for Actions

2. **Production Safeguards:**
   - Production PRs always require manual approval
   - High-severity crashes trigger PagerDuty alerts
   - All fixes logged to Firestore for audit trail

3. **Rate Limiting:**
   - Cloud Function: 10 max concurrent executions
   - Claude API: Tier-based (monitor usage)
   - GitHub Actions: 2000 min/month free tier

4. **Data Privacy:**
   - Stack traces may contain PII (user IDs, emails)
   - Redact sensitive data in Cloud Function before sending to Claude
   - Use Crashlytics data retention settings (default 90 days)

---

## Maintenance

### Monthly Tasks:

- [ ] Review false positive rate (AI fixes that didn't work)
- [ ] Check Claude API usage and costs
- [ ] Update severity thresholds if needed
- [ ] Review and archive old Firestore crash alerts

### Quarterly Tasks:

- [ ] Review AI fix success rate (PR merged vs. closed)
- [ ] Update prompt engineering in workflows if confidence is low
- [ ] Audit Slack channel membership
- [ ] Review and optimize Cloud Function memory/timeout settings

---

## Next Steps

1. **Enable Session Replay** (Optional):
   - Add Firebase Performance Monitoring
   - Capture user sessions leading to crashes

2. **Add Feature Flags** (Recommended):
   - Use Firebase Remote Config
   - Rollback features without redeploying

3. **Expand Coverage**:
   - Add backend error monitoring (Cloud Error Reporting)
   - Monitor API response times (Cloud Trace)

4. **Improve AI Context**:
   - Add recent PRs to analysis context
   - Include related issues from Linear/Jira

---

## Support

**Internal Documentation:**

- [Crashlytics Setup](./CRASHLYTICS-SETUP.md)
- [CI/CD Pipeline](./CI-CD-SETUP.md)
- [n8n Workflows](../.github/n8n/README.md)

**External Resources:**

- [Firebase Crashlytics Webhooks](https://firebase.google.com/docs/crashlytics/webhooks)
- [Claude API Docs](https://docs.anthropic.com/claude/reference)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/reference/workflow-syntax-for-github-actions)

---

**Last Updated:** February 3, 2026  
**Version:** 1.0.0  
**Maintained by:** NXT1 Engineering Team
