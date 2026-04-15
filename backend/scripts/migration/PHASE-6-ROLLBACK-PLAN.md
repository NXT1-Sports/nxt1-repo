# Phase 6 - Rollback Plan

**Emergency rollback procedures if migration fails or causes critical issues**

---

## ⚠️ When to Rollback

**Immediate Rollback Triggers:**

- 🔴 Data corruption detected
- 🔴 >50% of users cannot login
- 🔴 Critical app functionality broken
- 🔴 Data loss confirmed
- 🔴 Security breach or exposure

**Consider Rollback:**

- 🟡 Performance degradation
- 🟡 Minor data inconsistencies
- 🟡 <30% users affected
- 🟡 Non-critical features broken

---

## 🎯 Rollback Scope

**What CAN be rolled back:**

- ✅ Firestore data (Phase 3)
- ✅ Storage files (Phase 4)
- ✅ Auth users (Phase 2) - with caution

**What CANNOT be rolled back:**

- ❌ User actions after migration
- ❌ New data created post-migration
- ❌ Password resets issued

---

## 📋 Pre-Rollback Checklist

Before executing rollback:

- [ ] **Document the issue** - Screenshot errors, save logs
- [ ] **Verify it's a migration issue** - Not app code bug
- [ ] **Check impact scope** - How many users affected?
- [ ] **Backup current staging data** - In case rollback needs revert
- [ ] **Get approval** - From project lead/stakeholder
- [ ] **Notify team** - Developers, QA, stakeholders

---

## 🔧 Rollback Scripts

### **1. Rollback Authentication (Phase 2)**

⚠️ **CAUTION:** This deletes migrated Auth users. Only use if Auth migration
caused critical issues.

**Create:** `rollback-auth.ts`

```typescript
#!/usr/bin/env tsx
/**
 * DANGER: Rollback Auth Migration
 * Deletes 5 migrated users from staging-v2
 *
 * Usage:
 *   npx tsx scripts/migration/rollback-auth.ts --confirm
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        '\n'
      ),
    }),
  },
  'staging-rollback-auth'
);

async function rollbackAuth() {
  if (!process.argv.includes('--confirm')) {
    console.log('⚠️  DANGER: This will DELETE migrated Auth users!');
    console.log('   Run with --confirm to proceed.\n');
    process.exit(1);
  }

  console.log('\n🔴 ROLLBACK: Deleting migrated Auth users...\n');

  const auth = getAuth(stagingApp);
  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUIDs = uidMapping.results.map((r: any) => r.uid).filter(Boolean);

  let deletedCount = 0;
  let failedCount = 0;

  for (const uid of targetUIDs) {
    try {
      const user = await auth.getUser(uid);
      console.log(`Deleting: ${user.email || user.uid}`);
      await auth.deleteUser(uid);
      console.log(`✅ Deleted\n`);
      deletedCount++;
    } catch (error) {
      console.error(`❌ Failed: ${(error as Error).message}\n`);
      failedCount++;
    }
  }

  console.log('━'.repeat(70));
  console.log(`Deleted: ${deletedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('━'.repeat(70));
  console.log('\n✅ Auth rollback complete.\n');

  await stagingApp.delete();
}

rollbackAuth();
```

---

### **2. Rollback Firestore Data (Phase 3)**

**Create:** `rollback-firestore.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Rollback Firestore Migration
 * Deletes migrated user documents from staging-v2
 *
 * Options:
 *   --soft: Keep documents but mark as rolled back
 *   --hard --confirm: Permanently delete documents
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        '\n'
      ),
    }),
  },
  'staging-rollback-firestore'
);

const db = getFirestore(stagingApp);

async function rollbackFirestore() {
  const isHard = process.argv.includes('--hard');
  const isSoft = process.argv.includes('--soft');
  const hasConfirm = process.argv.includes('--confirm');

  if (!isSoft && !isHard) {
    console.log('Usage:');
    console.log('  --soft              : Mark as rolled back (keep data)');
    console.log('  --hard --confirm    : Delete documents permanently\n');
    process.exit(1);
  }

  if (isHard && !hasConfirm) {
    console.log('⚠️  DANGER: --hard requires --confirm flag!\n');
    process.exit(1);
  }

  console.log(
    `\n🔴 ROLLBACK: Firestore (${isHard ? 'HARD' : 'SOFT'} mode)...\n`
  );

  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUIDs = uidMapping.results.map((r: any) => r.uid).filter(Boolean);

  let successCount = 0;
  let failCount = 0;

  for (const uid of targetUIDs) {
    try {
      const docRef = db.collection('users').doc(uid);
      const doc = await docRef.get();

      if (!doc.exists) {
        console.log(`⚠️  ${uid}: Not found, skipping`);
        continue;
      }

      const userData = doc.data()!;
      console.log(`Processing: ${userData.email || uid}`);

      if (isSoft) {
        // Soft rollback: Mark as rolled back
        await docRef.update({
          _rolledBack: true,
          _rollbackAt: new Date(),
          _rollbackReason: 'Migration rollback',
        });
        console.log(`✅ Marked as rolled back\n`);
      } else {
        // Hard rollback: Delete document
        await docRef.delete();
        console.log(`✅ Deleted\n`);
      }

      successCount++;
    } catch (error) {
      console.error(`❌ Failed: ${(error as Error).message}\n`);
      failCount++;
    }
  }

  console.log('━'.repeat(70));
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('━'.repeat(70));
  console.log(
    `\n✅ Firestore rollback (${isHard ? 'HARD' : 'SOFT'}) complete.\n`
  );

  await stagingApp.delete();
}

rollbackFirestore();
```

---

### **3. Rollback Storage Files (Phase 4)**

**Create:** `rollback-storage.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Rollback Storage Migration
 * Deletes copied profile images from staging-v2 bucket
 *
 * Usage:
 *   npx tsx scripts/migration/rollback-storage.ts --confirm
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const stagingApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.STAGING_FIREBASE_PROJECT_ID,
      clientEmail: process.env.STAGING_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.STAGING_FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        '\n'
      ),
    }),
    storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET,
  },
  'staging-rollback-storage'
);

const db = getFirestore(stagingApp);

async function rollbackStorage() {
  if (!process.argv.includes('--confirm')) {
    console.log('⚠️  DANGER: This will DELETE migrated images!');
    console.log('   Run with --confirm to proceed.\n');
    process.exit(1);
  }

  console.log('\n🔴 ROLLBACK: Deleting migrated images...\n');

  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUIDs = uidMapping.results.map((r: any) => r.uid).filter(Boolean);

  let deletedCount = 0;
  let failCount = 0;

  for (const uid of targetUIDs) {
    try {
      const userDoc = await db.collection('users').doc(uid).get();

      if (!userDoc.exists) continue;

      const userData = userDoc.data()!;
      const profileImgs = userData.profileImgs || [];

      console.log(`Processing: ${userData.email || uid}`);
      console.log(`   Images: ${profileImgs.length}`);

      for (const imgUrl of profileImgs) {
        try {
          const match = imgUrl.match(/\/([^/?]+\.[a-zA-Z]+)(\?|$)/);
          if (!match) continue;

          const path = match[1];
          const gsUrl = `gs://${process.env.STAGING_FIREBASE_STORAGE_BUCKET}/${path}`;

          console.log(`   Deleting: ${path}`);
          execSync(`gsutil rm "${gsUrl}"`, { stdio: 'pipe' });
          console.log(`   ✅ Deleted`);
          deletedCount++;
        } catch (error) {
          console.error(`   ❌ Failed: ${(error as Error).message}`);
          failCount++;
        }
      }

      // Reset profileImgs in Firestore
      await db.collection('users').doc(uid).update({
        profileImgs: [],
        _imagesRolledBack: true,
      });

      console.log('');
    } catch (error) {
      console.error(`❌ Error: ${(error as Error).message}\n`);
      failCount++;
    }
  }

  console.log('━'.repeat(70));
  console.log(`Deleted: ${deletedCount}`);
  console.log(`Failed: ${failCount}`);
  console.log('━'.repeat(70));
  console.log('\n✅ Storage rollback complete.\n');

  await stagingApp.delete();
}

rollbackStorage();
```

---

## 🚀 Rollback Execution Order

**Full Rollback (All phases):**

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# 1. Rollback Storage (Phase 4) - least destructive
npx tsx scripts/migration/rollback-storage.ts --confirm

# 2. Rollback Firestore (Phase 3) - soft first
npx tsx scripts/migration/rollback-firestore.ts --soft

# 3. If soft rollback insufficient, hard delete
npx tsx scripts/migration/rollback-firestore.ts --hard --confirm

# 4. Rollback Auth (Phase 2) - most destructive, last resort
npx tsx scripts/migration/rollback-auth.ts --confirm
```

**Partial Rollback (Firestore only):**

```bash
# Keep Auth users, revert Firestore data only
npx tsx scripts/migration/rollback-firestore.ts --soft
```

---

## 📊 Post-Rollback Verification

```bash
# 1. Verify deletions
npx tsx scripts/migration/verify-auth-import.ts
# Expected: Users not found (if Auth rolled back)

# 2. Check Firestore
# Firebase Console → Firestore → users collection
# Expected: No migrated users OR soft-deleted users

# 3. Check Storage
gsutil ls gs://nxt-1-staging-v2.firebasestorage.app/
# Expected: No profile images from migration
```

---

## 🔄 Re-Migration After Rollback

If you need to retry migration:

```bash
# 1. Fix issues identified
# 2. Clean up any remaining artifacts
# 3. Start from Phase 2 (Auth import)
npx tsx scripts/migration/verify-auth-import.ts  # Should fail
firebase auth:import auth-export-no-password-v2.json --project nxt-1-staging-v2

# 4. Continue with Phase 3, 4, 5
```

---

## 📝 Rollback Report Template

```markdown
# Rollback Report

**Date:** YYYY-MM-DD **Executed By:** [Name] **Reason:** [Description of issue]

## Scope

- [ ] Phase 2: Auth
- [ ] Phase 3: Firestore
- [ ] Phase 4: Storage

## Execution Log

[Paste command outputs]

## Verification

- [ ] Auth users deleted/restored
- [ ] Firestore documents deleted/marked
- [ ] Storage files deleted
- [ ] App functioning normally

## Next Steps

- [ ] Fix root cause
- [ ] Plan re-migration
- [ ] Test in isolated environment first

## Lessons Learned

1. [What went wrong]
2. [What to do differently]
```

---

## ⚠️ Important Warnings

1. **Rollback is NOT instant** - Takes time to propagate
2. **New user data will be lost** - If users created content post-migration
3. **Password resets cannot be undone** - Users will need to reset again
4. **OAuth tokens may need refresh** - Some users may need to re-login
5. **Backup before rollback** - Create manual backup of staging data first

---

## 🆘 Emergency Contacts

**If rollback fails:**

- Firebase Support: https://firebase.google.com/support
- Google Cloud Support: https://cloud.google.com/support
- Project Owner: [Contact info]

---

## ✅ Rollback Success Criteria

- [ ] All migrated data removed/reverted
- [ ] App returns to pre-migration state
- [ ] No errors in console
- [ ] Existing staging users unaffected
- [ ] System stable and functional

---

**Last Resort:** If all rollback fails, restore staging project from backup or
re-create fresh staging environment.

**Prevention:** Always test migration in isolated sandbox environment before
staging/production.
