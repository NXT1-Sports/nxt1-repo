# Firebase Functions Deployment Guide

Complete guide for deploying Firebase Cloud Functions in the NXT1 monorepo.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Commands](#deployment-commands)
4. [Deployment Strategies](#deployment-strategies)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)
7. [Common Issues](#common-issues)
8. [CI/CD Integration](#cicd-integration)

---

## Prerequisites

### Required Tools

```bash
# Node.js 22+ (matching functions runtime)
node --version  # Should be v22.x.x

# Firebase CLI
npm install -g firebase-tools
firebase --version

# Login to Firebase
firebase login

# Select project
firebase use nxt-1-de054  # Production
# OR
firebase use nxt-1-staging  # Staging
```

### Verify Current Project

```bash
firebase projects:list
firebase use  # Show current project
```

---

## Pre-Deployment Checklist

### 1. **Validate Structure**

```bash
cd apps/functions
node validate-structure.js
```

Expected output: `✅ ALL CHECKS PASSED - SAFE TO DEPLOY!`

### 2. **Type Check**

```bash
npm run typecheck
```

Should complete with no errors.

### 3. **Lint Check**

```bash
npm run lint
```

Fix any linting errors before deploying.

### 4. **Build**

```bash
npm run build
```

Verify the `lib/` folder is created successfully.

### 5. **Check Dependencies**

```bash
# Ensure all dependencies are installed
npm install

# Check for outdated packages (optional)
npm outdated
```

### 6. **Review Changes**

```bash
# See what changed
git status
git diff

# List current deployed functions
firebase functions:list
```

---

## Deployment Commands

### Deploy All Functions

```bash
cd apps/functions
npm run deploy
```

**What it does:**

- Builds TypeScript (`npm run build`)
- Deploys all functions to the current Firebase project
- Creates new functions, updates existing ones

### Deploy Specific Function

```bash
# Deploy only one function
firebase deploy --only functions:functionName

# Example:
firebase deploy --only functions:healthCheck
firebase deploy --only functions:beforeUserCreate
```

### Deploy Multiple Specific Functions

```bash
firebase deploy --only functions:func1,functions:func2,functions:func3

# Example:
firebase deploy --only functions:healthCheck,functions:checkUsernameAvailability
```

### Deploy by Group (Module)

```bash
# Deploy all auth functions
firebase deploy --only functions:beforeUserCreate,functions:beforeUserSignIn,functions:onUserProfileCreatedV2

# Better approach: Use function groups in firebase.json (see CI/CD section)
```

### Deploy to Staging

```bash
npm run deploy:staging
```

**What it does:**

1. Switches to staging project: `firebase use staging`
2. Deploys all functions: `firebase deploy --only functions`

### Deploy to Production

```bash
npm run deploy:prod
```

**What it does:**

1. Switches to production project: `firebase use production`
2. Deploys all functions: `firebase deploy --only functions`

---

## Deployment Strategies

### 1. **Full Deployment** (All Functions)

**When to use:**

- Major updates affecting multiple functions
- Initial deployment
- Quarterly maintenance updates

**Command:**

```bash
npm run deploy
```

**Time:** ~5-10 minutes (depends on number of functions)

---

### 2. **Incremental Deployment** (Single Function)

**When to use:**

- Bug fix in one function
- New feature in one function
- Hot fix

**Command:**

```bash
firebase deploy --only functions:functionName
```

**Time:** ~1-2 minutes per function

**Example workflow:**

```bash
# 1. Make changes to src/util/myFunction.ts
# 2. Validate
node validate-structure.js

# 3. Build
npm run build

# 4. Deploy only that function
firebase deploy --only functions:myFunction

# 5. Verify
firebase functions:log --only myFunction
```

---

### 3. **Canary Deployment** (Staging First)

**Best practice for production:**

```bash
# Step 1: Deploy to staging
npm run deploy:staging

# Step 2: Test on staging
# - Run manual tests
# - Check logs: firebase functions:log
# - Monitor for errors

# Step 3: If stable, deploy to production
npm run deploy:prod
```

---

### 4. **Zero-Downtime Deployment**

Firebase automatically handles zero-downtime:

- Old version continues serving requests
- New version deploys in parallel
- Traffic switches when new version is ready
- Old version remains for rollback (24 hours)

No special configuration needed!

---

## Post-Deployment Verification

### 1. **Check Deployment Status**

```bash
# List all deployed functions
firebase functions:list

# Should show your function with latest version
```

### 2. **Test Function Endpoint**

```powershell
# Test a callable function
$url = "https://us-central1-nxt-1-de054.cloudfunctions.net/healthCheck"
$response = Invoke-WebRequest -Uri $url -Method POST -ContentType "application/json" -Body '{"data":{}}'
$response.Content | ConvertFrom-Json
```

### 3. **Monitor Logs**

```bash
# Stream logs in realtime
npm run logs

# Filter by function
firebase functions:log --only functionName

# Last 100 lines
firebase functions:log --only functionName --limit 100
```

### 4. **Check Firebase Console**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: `nxt-1-de054`
3. Navigate to **Functions** tab
4. Verify:
   - ✅ Function shows "Active"
   - ✅ No errors in dashboard
   - ✅ Request count increasing (if applicable)

### 5. **Integration Test**

Test from your app:

```typescript
// Frontend (Angular/Ionic)
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const myFunction = httpsCallable(functions, 'myFunction');

try {
  const result = await myFunction({ test: true });
  console.log('✅ Function works:', result.data);
} catch (error) {
  console.error('❌ Function failed:', error);
}
```

---

## Rollback Procedures

### Automatic Rollback (Recommended)

Firebase keeps previous versions for 24 hours.

```bash
# List all versions
firebase functions:list

# Rollback to previous version (via Firebase Console)
# 1. Go to Firebase Console > Functions
# 2. Click on the function
# 3. Go to "Details" tab
# 4. Click "Rollback" button
```

### Manual Rollback

```bash
# 1. Checkout previous commit
git log --oneline  # Find commit hash
git checkout <commit-hash>

# 2. Rebuild
cd apps/functions
npm run build

# 3. Deploy
npm run deploy

# 4. Return to main branch
git checkout main
```

### Emergency Fix

If a function is broken:

```bash
# Option 1: Delete the function temporarily
firebase functions:delete functionName

# Option 2: Deploy a safe version immediately
# Edit the function to return early or safe default
firebase deploy --only functions:functionName
```

---

## Common Issues

### Issue 1: Deployment Fails - Timeout

**Error:** `Deployment error: Function deployment timed out`

**Solutions:**

```bash
# Increase timeout in function config
setGlobalOptions({
  timeoutSeconds: 300, // 5 minutes
});

# Or deploy with retry
firebase deploy --only functions --force
```

---

### Issue 2: Missing Dependencies

**Error:** `Cannot find module 'some-package'`

**Solutions:**

```bash
cd apps/functions
npm install
npm run build
npm run deploy
```

---

### Issue 3: TypeScript Compilation Errors

**Error:** `src/file.ts(10,5): error TS2322`

**Solutions:**

```bash
# Run typecheck first
npm run typecheck

# Fix errors, then deploy
npm run build
npm run deploy
```

---

### Issue 4: Function Not Exported

**Error:** `No function named 'myFunction' exported`

**Solutions:**

1. Check `src/module/index.ts` exports the function
2. Check `src/index.ts` exports the module
3. Rebuild: `npm run build`

```typescript
// src/util/myFunction.ts
export const myFunction = onCall(async () => {...});

// src/util/index.ts
export { myFunction } from './myFunction';

// src/index.ts
export * from './util';
```

---

### Issue 5: Permission Denied

**Error:** `HTTP Error: 403, The caller does not have permission`

**Solutions:**

```bash
# Re-login
firebase logout
firebase login

# Check project
firebase use nxt-1-de054

# Check IAM roles in Firebase Console
# You need "Firebase Admin" or "Cloud Functions Admin" role
```

---

### Issue 6: Quota Exceeded

**Error:** `Quota exceeded for deployment`

**Solutions:**

- Check Firebase billing plan
- Delete unused functions: `firebase functions:delete oldFunction`
- Upgrade plan if needed

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy-functions.yml`:

```yaml
name: Deploy Functions

on:
  push:
    branches: [main]
    paths:
      - 'apps/functions/**'
      - 'packages/core/**'

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 22

      - name: Install dependencies
        run: |
          cd apps/functions
          npm install

      - name: Validate structure
        run: |
          cd apps/functions
          node validate-structure.js

      - name: Type check
        run: |
          cd apps/functions
          npm run typecheck

      - name: Build
        run: |
          cd apps/functions
          npm run build

      - name: Deploy to Firebase
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
        run: |
          cd apps/functions
          firebase deploy --only functions --token $FIREBASE_TOKEN
```

### Generate Firebase Token for CI

```bash
firebase login:ci
# Copy the token and add to GitHub Secrets as FIREBASE_TOKEN
```

---

## Best Practices

### 1. **Always Validate Before Deploy**

```bash
node validate-structure.js && npm run build && npm run deploy
```

### 2. **Use Staging Environment**

Deploy to staging first, test, then production.

### 3. **Deploy During Low Traffic**

Schedule deployments during off-peak hours.

### 4. **Monitor After Deployment**

```bash
# Watch logs for 5 minutes after deployment
firebase functions:log --only functionName
```

### 5. **Document Changes**

Update CHANGELOG.md or commit messages with deployment notes.

### 6. **Use Semantic Versioning**

Tag releases in git:

```bash
git tag -a functions-v2.1.0 -m "Add new user notifications"
git push origin functions-v2.1.0
```

### 7. **Keep Dependencies Updated**

```bash
# Monthly maintenance
npm outdated
npm update
npm audit fix
```

---

## Quick Reference

### Essential Commands

```bash
# Validate
node validate-structure.js

# Build
npm run build

# Deploy all
npm run deploy

# Deploy one
firebase deploy --only functions:functionName

# Logs
npm run logs

# List functions
firebase functions:list

# Delete function
firebase functions:delete functionName
```

### File Structure

```
apps/functions/
├── src/
│   ├── index.ts          # Main entry point
│   ├── auth/             # Auth triggers
│   │   ├── index.ts      # Export all auth functions
│   │   └── *.ts          # Individual functions
│   ├── user/             # User triggers
│   ├── notification/     # Notification functions
│   ├── scheduled/        # Cron/scheduled tasks
│   └── util/             # Callable utility functions
├── lib/                  # Compiled output (git ignored)
├── package.json
├── tsconfig.json
└── DEPLOYMENT.md         # This file
```

---

## Support

### Resources

- [Firebase Functions Docs](https://firebase.google.com/docs/functions)
- [NXT1 Functions TESTING.md](./TESTING.md)
- [NXT1 Functions TEST-COMMANDS.md](./TEST-COMMANDS.md)

### Contact

- Team: Functions Team
- Slack: #functions-support
- Email: john@nxt1sports.com

---

**Last Updated:** February 2, 2026  
**Version:** 2.0.0  
**Maintainer:** NXT1 DevOps Team
