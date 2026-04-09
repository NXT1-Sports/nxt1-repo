# NXT1 Monorepo Infrastructure Audit

_Date: April 2026_

## Overview

This document captures the infrastructure audit and prioritized action items for
the NXT1 monorepo platform.

## 🔴 High Priority

**1. No Backend APM / Distributed Tracing**

- **Impact**: Blind production environment (missing cross-service latency, slow
  queries, and error rate correlation across frontend, backend, MongoDB, and
  OpenRouter).
- **The Fix**: Add `@opentelemetry/sdk-node` with auto-instrumentation for
  Express, MongoDB, Redis, and HTTP. Export to Google Cloud Trace (free with
  GCP).

**2. Backend `minInstances: 0` in Production**

- **Impact**: 3-8 second cold starts for the API server (MongoDB, Redis,
  Firebase Admin init). Causes poor UX, failed health checks during scale-up,
  and payment/webhook timeout risks.
- **The Fix**: Set `minInstances: 1` in `backend/apphosting.yaml` to keep one
  warm instance alive. _(Note: This was applied)._

**3. Helmet CSP Disabled (Security Risk)**

- **The Problem**: Cross-Site Scripting (XSS) is one of the most common web
  vulnerabilities. A Content Security Policy (CSP) tells the browser exactly
  which domains are allowed to load scripts, images, and fonts. Right now, the
  backend explicitly disables it, and `apphosting.yaml` doesn't enforce one. If
  an attacker injects a malicious script, the browser will execute it.
- **The Fix**: Add a CSP header to `apphosting.yaml` to protect the web app.
  ```yaml
  - header: Content-Security-Policy
    value:
      "default-src 'self' https:; script-src 'self' 'unsafe-inline'
      'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src
      'self' data: blob: https:; font-src 'self' data: https:; connect-src
      'self' https: wss:;"
  ```

**4. Test Job `continue-on-error: true` (Quality Gate)**

- **The Problem**: In the GitHub Actions CI pipeline
  (`.github/workflows/ci.yml`), automated tests are set to
  `continue-on-error: true`. If a developer opens a Pull Request that completely
  breaks the app and causes 50 tests to fail, the CI pipeline will still show a
  green ✅ checkmark. It prevents your tests from actually blocking bad code
  from merging into `main`.
- **The Fix**: Simply remove the `continue-on-error: true` line so that failing
  tests cause the GitHub Action to fail and block the PR.

## 🟡 Medium Priority

**5. Duplicate Rate Limiting Middleware**

- **Impact**: Confusion from unused legacy code (`rate-limit.middleware.ts` vs
  `redis-rate-limit.middleware.ts`).
- **The Fix**: Remove the non-Redis version if no longer referenced.

**6. No Database Migration Strategy**

- **Impact**: Schema drift for MongoDB and Firestore over time.
- **The Fix**: Document schema versioning strategy or use a migration tool like
  `migrate-mongo`.

**7. Missing `package-lock.json` in Turbo Cache**

- **The Problem**: Turborepo caches your builds heavily to speed up development.
  To know if it's safe to use a cached build, it looks at the files listed in
  `globalDependencies` in `turbo.json`. Right now, `package-lock.json` isn't in
  that list. If you update a dependency (like updating a vulnerable version of a
  library), Turbo might not realize the dependency changed, and it could serve
  you a stale cached build that still has the old version.
- **The Fix**: Add `"package-lock.json"` to the array in `turbo.json`:
  ```json
  "globalDependencies": [".env", ".env.local", "tsconfig.base.json", "package-lock.json"],
  ```

**8. Backend Dev Server Uses Full Rebuild**

- **Impact**: Slow DX. Nodemon triggers a full `tsc` compile on every file
  change.
- **The Fix**: Switch to `tsx watch src/index.ts` for local dev.

**9. Redis Client Library Mismatch**

- **Impact**: Using both `redis` (in `@nxt1/cache`) and `ioredis` (in
  `backend`). Doubles the connection pool and the bundle size.
- **The Fix**: Standardize on one (e.g., `ioredis`).

**11. Missing `isFollowing()` Rule in Firestore**

- **The Problem**: In your `firestore.rules`, the logic that determines if
  someone is allowed to read a private "followers-only" post relies on a helper
  function called `isFollowing(userId)`. However, that function is never
  actually defined anywhere in the file. If a user tries to view a post that is
  set to "followers only", the database will throw a permission denied error.
- **The Fix**: Add the missing helper function to the top of your
  `firestore.rules`:
  ```javascript
  /**
   * Check if the authenticated user is following the given user
   */
  function isFollowing(targetUserId) {
    return isAuthenticated() &&
      exists(/databases/$(database)/documents/Users/$(request.auth.uid)/following/$(targetUserId));
  }
  ```

## 🟢 Lower Priority (Good Hygiene)

**10. No Turbo Remote Cache Verification**

- **The Fix**: Verify CI builds show `cache hit` messages. Misconfigured remote
  caches fall back to rebuilding everything.

**12. Missing `storage.rules`**

- **The Fix**: Add the missing `storage.rules` file to your workspace. Firebase
  Storage without rules defaults to denying everything.

**13. Angular Packages Duplicated in deps and devDeps**

- **The Fix**: Clean up `package.json` duplicates to avoid confusion and
  mismatch issues.

**14. Web Dockerfile Copies Only `dist` — No `node_modules`**

- **The Fix**: Fix Dockerfile to correctly resolve `@nxt1/*` workspace packages
  if utilizing Docker for standalone SSR deployments.

---

## Summary Priority Matrix

| #   | Issue                           | Impact                   | Effort  |
| --- | ------------------------------- | ------------------------ | ------- |
| 1   | No APM / OpenTelemetry          | High (blind production)  | Medium  |
| 2   | `minInstances: 0` backend       | High (cold starts)       | Trivial |
| 3   | No CSP headers                  | High (security)          | Low     |
| 4   | Tests don't block PRs           | High (quality gate)      | Trivial |
| 5   | Duplicate rate limit files      | Low (confusion)          | Trivial |
| 6   | No DB migration strategy        | Medium (schema drift)    | Medium  |
| 7   | Missing lock file in Turbo deps | Medium (stale cache)     | Trivial |
| 8   | Slow backend dev rebuild        | Medium (DX)              | Low     |
| 9   | Two Redis clients               | Medium (resources)       | Medium  |
| 10  | Verify remote cache             | Low (CI speed)           | Trivial |
| 11  | Missing `isFollowing()` rule    | High (deploy failure)    | Low     |
| 12  | Missing `storage.rules`         | Medium (upload breakage) | Low     |
| 13  | Duplicate Angular deps          | Low (confusion)          | Low     |
| 14  | Broken Dockerfile for monorepo  | Medium (if using Docker) | Medium  |
