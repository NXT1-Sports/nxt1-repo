# Firebase Cloud Functions Architecture

> **Status**: Production-ready | **Version**: 2.0.0 (Gen 2) | **Runtime**:
> Node.js 22  
> **Last Updated**: January 2026

---

## Overview

NXT1's Cloud Functions are built with **2026 enterprise best practices**:

- ✅ File-per-function pattern (no monolithic index.ts)
- ✅ 100% TypeScript with strict mode
- ✅ Uses `@nxt1/core` for shared constants/types
- ✅ Barrel exports for clean imports
- ✅ Unit testing with Vitest
- ✅ Firebase Secrets for credentials (no hardcoding)
- ✅ Gen 2 Cloud Functions (latest architecture)

**Location**: `apps/functions/src/`

---

## Function Inventory (17 Active)

### Auth Module (`auth/`)

Lifecycle hooks for Firebase Authentication.

| Function                 | Type      | Trigger                  | Purpose                                                      |
| ------------------------ | --------- | ------------------------ | ------------------------------------------------------------ |
| `beforeUserCreate`       | Blocking  | Auth.beforeCreate        | Validate email (block disposables), check reserved usernames |
| `beforeUserSignIn`       | Blocking  | Auth.beforeSignIn        | Check account status (suspended, deleted)                    |
| `onUserProfileCreatedV2` | Firestore | `users/{userId}` created | Initialize analytics, notification preferences               |

**Key Features**:

- Blocks disposable email domains (from `@nxt1/core`)
- Enforces reserved username list
- Atomic user initialization

---

### User Module (`user/`)

Handle user profile lifecycle and data integrity.

| Function                 | Type      | Trigger                  | Purpose                                               |
| ------------------------ | --------- | ------------------------ | ----------------------------------------------------- |
| `generateProfileSlug`    | Callable  | Client call              | Generate unique username from display name            |
| `onUserProfileUpdatedV2` | Firestore | `users/{userId}` updated | Recalculate profile completeness, update search index |
| `onUserDeletedV2`        | Firestore | `users/{userId}` deleted | Cleanup orphaned data (posts, analytics, tokens)      |

**Profile Completeness Algorithm**:

```typescript
calculateProfileCompleteness(userData) {
  required: ['displayName', 'photoURL', 'bio', 'primarySport', 'positions',
             'location', 'highSchool', 'graduationYear']
  bonus: ['height', 'weight', 'gpa', 'satScore', 'actScore', 'videoHighlights']

  score = (filledRequired / totalRequired) * 70 + (filledBonus / totalBonus) * 30
}
```

---

### Notification Module (`notification/`)

Push notifications via Firebase Cloud Messaging.

| Function                  | Type      | Trigger                      | Purpose                                 |
| ------------------------- | --------- | ---------------------------- | --------------------------------------- |
| `onNotificationCreatedV2` | Firestore | `notifications/{id}` created | Send push via FCM to registered devices |
| `registerFcmToken`        | Callable  | Client call                  | Register device token for push          |
| `unregisterFcmToken`      | Callable  | Client call                  | Remove device token                     |
| `sendNotification`        | Callable  | Client call                  | Send custom notification                |

**Token Management**:

- Tokens stored in `user_tokens/{userId}/tokens/{tokenId}`
- Supports multiple devices per user
- Automatic cleanup of expired/invalid tokens

---

### Scheduled Tasks (`scheduled/`)

Cron jobs for automated maintenance.

| Function            | Schedule        | Purpose                                       |
| ------------------- | --------------- | --------------------------------------------- |
| `dailyDigest`       | 8:00 AM daily   | Send daily email digest to opted-in users     |
| `weeklyCleanup`     | Sundays 2:00 AM | Delete expired data, cleanup orphaned records |
| `subscriptionCheck` | Hourly          | Check expiring subscriptions, send reminders  |

**Cron Syntax**:

```typescript
schedule: 'every day 08:00'; // dailyDigest
schedule: 'every sunday 02:00'; // weeklyCleanup
schedule: 'every 60 minutes'; // subscriptionCheck
```

---

### Utility Functions (`util/`)

General-purpose callable functions.

| Function                    | Type     | Purpose                                | Rate Limit      |
| --------------------------- | -------- | -------------------------------------- | --------------- |
| `healthCheck`               | Callable | Liveness probe (requires auth)         | None            |
| `healthCheckHttp`           | HTTP     | Public health endpoint                 | None            |
| `checkUsernameAvailability` | Callable | Validate username availability         | 10/min per user |
| `validateEmail`             | Callable | Check email domain (disposable check)  | 10/min per user |
| `buildSearchIndex`          | Callable | Rebuild Algolia/Firestore search index | Admin only      |
| `deleteUserAccount`         | Callable | Full account deletion with cleanup     | Auth required   |

**Username Validation Rules**:

- Min 3 characters, lowercase alphanumeric + underscore
- Not in `RESERVED_USERNAMES` (admin, support, nxt1, etc.)
- Unique in Firestore `users` collection

---

### Email Module (`email/`) - DISABLED

_Not deployed until SMTP credentials configured._

| Function            | Type      | Purpose                                             |
| ------------------- | --------- | --------------------------------------------------- |
| `sendEmail`         | Callable  | Send transactional email with template              |
| `processEmailQueue` | Firestore | Process queued emails from `email_queue` collection |

**Templates Available**:

- `welcome` - New user welcome
- `verification` - Email verification link
- `password_reset` - Password reset link
- `offer_notification` - College offer alert
- `weekly_digest` - Weekly stats summary

**To Enable**:

```bash
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
# Uncomment export in apps/functions/src/index.ts
npm run deploy:staging
```

---

## Local Testing

### Option 1: Unit Tests (Fastest)

```bash
cd apps/functions

# Run all tests
npm test

# Watch mode (auto-rerun on changes)
npm test -- --watch

# UI dashboard
npm run test:ui

# Coverage report
npm run test:coverage
```

**Example Test**:

```typescript
// src/util/__tests__/checkUsernameAvailability.spec.ts
import { RESERVED_USERNAMES } from '@nxt1/core';

describe('checkUsernameAvailability', () => {
  it('should reject reserved usernames', () => {
    expect(RESERVED_USERNAMES).toContain('admin');
  });
});
```

---

### Option 2: Firebase Emulator (Full Integration)

```bash
cd apps/functions

# Start emulator suite
npm run serve

# Emulator UI: http://localhost:4000
# Functions: http://localhost:5001/nxt-1-staging/us-central1/{functionName}
```

**Test Auth Triggers**:

1. Open Emulator UI → Authentication tab
2. Create test user → triggers `beforeUserCreate`
3. Check Functions logs for execution

**Test Firestore Triggers**:

1. Emulator UI → Firestore tab
2. Create/update document in `users` collection
3. Triggers `onUserProfileCreatedV2` or `onUserProfileUpdatedV2`

---

### Option 3: Interactive Shell

```bash
cd apps/functions
npm run shell

# Inside shell:
> const result = await checkUsernameAvailability({data: {username: 'testuser'}})
> console.log(result)
{ available: true }
```

---

## Deployment

### Staging

```bash
cd apps/functions
npm run deploy:staging
```

**Prompts**:

- "Delete legacy functions?" → Answer **N** (keep both systems running)
- Deploys to: `nxt-1-staging` project
- Region: `us-central1`

### Production

```bash
cd apps/functions
npm run deploy:prod
```

**Deploys to**: `nxt-1-de054` (production)

---

## Architecture Decisions

### Why V2 Suffixes?

Functions named `onUserProfileCreatedV2` instead of `onUserProfileCreated` to
avoid conflicts with legacy Gen 1 functions still deployed. This allows:

- Side-by-side deployment (legacy + new)
- Gradual migration without downtime
- Rollback if issues arise

**Naming Convention**:

- Firestore triggers: `*V2` suffix (conflict avoidance)
- Callable functions: Original names (no conflicts)
- Scheduled tasks: Original names

---

### Why No Shared Barrel Exports for Helpers?

Firebase Cloud Functions loader expects only deployable functions at the top
level. Exporting helpers/constants caused `Maximum call stack size exceeded`
errors.

**Solution**:

```typescript
// ❌ WRONG: Export helpers from barrel
export { sendWelcomeEmail } from './sendWelcomeEmail'; // Helper, not a Cloud Function

// ✅ CORRECT: Only export Cloud Functions
export { sendEmail } from './sendEmail'; // Actual Cloud Function
```

Helpers stay internal to modules, imported directly when needed.

---

### Why @nxt1/core Dependency?

Functions use `@nxt1/core` for:

- Constants: `RESERVED_USERNAMES`, `DISPOSABLE_EMAIL_DOMAINS`, `FIELD_LENGTHS`
- Validation: `VALIDATION_PATTERNS` for email/username checks
- Types: `User`, `AuthState`, etc.

**Must be published or bundled**: Firebase Cloud Build can't access private
workspace packages. Currently removed from `package.json` devDependencies.

---

## Security

### Auth Enforcement

```typescript
// Callable functions check auth
if (!request.auth) {
  throw new HttpsError('unauthenticated', 'Login required');
}
```

### Secrets Management

```typescript
// Define secrets (never hardcoded)
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

// Access at runtime
const transporter = createTransporter(SMTP_USER.value(), SMTP_PASS.value());
```

Set secrets via CLI:

```bash
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

### Rate Limiting

Implemented via `maxInstances` and function-level checks:

```typescript
setGlobalOptions({
  maxInstances: 10, // Horizontal scaling limit
  timeoutSeconds: 60, // Function timeout
  memory: '256MiB', // Memory allocation
});
```

---

## Monitoring

### View Logs

```bash
# Stream live logs
npm run logs

# Or: Firebase Console → Functions → Logs
```

### Health Checks

```bash
# Public endpoint (no auth)
curl https://us-central1-nxt-1-staging.cloudfunctions.net/healthCheckHttp

# Authenticated check
# (Call from frontend with Firebase auth token)
```

---

## Troubleshooting

### "Function not found" Error

**Cause**: Function not deployed or wrong region  
**Fix**: Check Firebase Console → Functions tab, verify deployment

### "Maximum call stack size exceeded"

**Cause**: Circular imports or exporting non-function exports  
**Fix**: Only export Cloud Functions from barrel `index.ts`

### "Cannot find module '@nxt1/core'"

**Cause**: Private workspace package not accessible to Cloud Build  
**Fix**: Remove from dependencies or publish to npm

### "SMTP secrets not set"

**Cause**: Email functions require secrets  
**Fix**:

```bash
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

---

## Migration from Legacy

### Current State

- **Legacy** (`nxt1/functions/index.js`): 45 functions deployed (Gen 1,
  Node.js 18)
- **Monorepo** (`apps/functions`): 17 functions (Gen 2, Node.js 22)

### Migration Strategy

1. ✅ Deploy monorepo functions with `V2` suffix (done)
2. Update mobile/web apps to call new functions
3. Monitor logs for errors
4. Gradually delete legacy functions
5. Remove `V2` suffix when legacy fully retired

### Breaking Changes

- Function names changed (`onUserProfileCreated` → `onUserProfileCreatedV2`)
- Function URLs changed (Gen 2 has different URL format)
- Auth context structure differs between Gen 1 and Gen 2

**Frontend Update Required**:

```typescript
// OLD (Gen 1 legacy)
const func = httpsCallable(functions, 'checkUsernameAvailability');

// NEW (Gen 2 monorepo) - same call, different backend
const func = httpsCallable(functions, 'checkUsernameAvailability');
```

No client changes needed for Firestore/Auth triggers (automatic).

---

## Performance

### Cold Start Optimization

- Min instances: 0 (cost-effective)
- Warm-up: First request ~2-3s, subsequent <100ms
- Consider `minInstances: 1` for critical functions

### Memory Allocation

| Function Type      | Memory | Typical Duration |
| ------------------ | ------ | ---------------- |
| Auth blockers      | 256MB  | <500ms           |
| Firestore triggers | 256MB  | 1-2s             |
| Scheduled tasks    | 512MB  | 5-10s            |
| Search indexing    | 1GB    | 30-60s           |

---

## Future Enhancements

### Planned

- [ ] Add integration tests for Firestore triggers
- [ ] Implement retry logic for failed notifications
- [ ] Add Algolia search index sync
- [ ] Enable email module with SMTP
- [ ] Add analytics event tracking function
- [ ] Implement image compression on upload
- [ ] Add video transcoding pipeline

### Considerations

- Move to different regions for multi-geo deployment
- Implement function chaining for complex workflows
- Add OpenTelemetry for distributed tracing
- Consider Cloud Tasks for reliable async processing

---

## Resources

- [Firebase Functions Docs](https://firebase.google.com/docs/functions)
- [Gen 2 Migration Guide](https://firebase.google.com/docs/functions/2nd-gen-upgrade)
- [Testing Guide](../../apps/functions/TESTING.md)
- [Quick Commands](../../apps/functions/TEST-COMMANDS.md)
- [Architecture Overview](../architecture/ARCHITECTURE.md)

**Support**: Questions? Check logs or contact the platform team.
