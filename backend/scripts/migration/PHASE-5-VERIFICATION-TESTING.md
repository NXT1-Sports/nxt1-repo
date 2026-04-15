# Phase 5 - Verification & Testing

**End-to-end verification of migration completeness and functionality**

---

## 🎯 Objective

Thoroughly verify that all migration phases completed successfully and users can
access the app with migrated data.

---

## 📋 Verification Checklist

### **1. Authentication Verification** ✅ (Already Done)

```bash
npx tsx scripts/migration/verify-auth-import.ts
```

**Expected:**

- ✅ 5/5 users found in staging-v2 Auth
- ✅ All emails match
- ✅ UIDs preserved

---

### **2. Firestore Data Verification**

```bash
npx tsx scripts/migration/verify-firestore-migration.ts
```

**Expected:**

- ✅ 5/5 users exist in `users` collection
- ✅ Sports array populated
- ✅ ProfileImgs array present
- ✅ Migration metadata (\_schemaVersion, \_migratedAt, \_sourceProject)

---

### **3. Storage Images Verification**

**Create:** `verify-storage-migration.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Verify profile images are accessible in staging Storage
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

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
  'staging-verify-storage'
);

const db = getFirestore(stagingApp);

async function verifyStorageImages() {
  console.log('\n🖼️  Verifying Profile Images...\n');

  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUsers = uidMapping.results.filter((r: any) => r.uid);

  let totalImages = 0;
  let accessibleImages = 0;
  let brokenImages = 0;

  for (const target of targetUsers) {
    const uid = target.uid;
    const email = target.email;

    try {
      const userDoc = await db.collection('users').doc(uid).get();

      if (!userDoc.exists) {
        console.log(`❌ ${email}: User not found`);
        continue;
      }

      const userData = userDoc.data()!;
      const profileImgs = userData.profileImgs || [];

      console.log(`\n📸 ${email}`);
      console.log(`   Images: ${profileImgs.length}`);

      if (profileImgs.length === 0) {
        console.log(`   ℹ️  No images to verify`);
        continue;
      }

      for (const imgUrl of profileImgs) {
        totalImages++;
        try {
          const response = await fetch(imgUrl, { method: 'HEAD' });
          if (response.ok) {
            console.log(`   ✅ ${imgUrl.substring(0, 80)}...`);
            accessibleImages++;
          } else {
            console.log(
              `   ❌ ${imgUrl.substring(0, 80)}... (${response.status})`
            );
            brokenImages++;
          }
        } catch (error) {
          console.log(`   ❌ ${imgUrl.substring(0, 80)}... (fetch failed)`);
          brokenImages++;
        }
      }
    } catch (error) {
      console.error(`❌ ${email}: ${(error as Error).message}`);
    }
  }

  console.log('\n' + '━'.repeat(70));
  console.log('📋 STORAGE VERIFICATION SUMMARY');
  console.log('━'.repeat(70));
  console.log(`Total images: ${totalImages}`);
  console.log(`✅ Accessible: ${accessibleImages}`);
  console.log(`❌ Broken: ${brokenImages}\n`);

  if (brokenImages === 0) {
    console.log('🎉 All images accessible!\n');
  } else {
    console.log('⚠️  Some images are not accessible.\n');
  }

  await stagingApp.delete();
}

verifyStorageImages();
```

---

### **4. End-to-End Integration Test**

**Create:** `e2e-migration-test.ts`

```typescript
#!/usr/bin/env tsx
/**
 * End-to-end migration verification
 * Comprehensive check across Auth, Firestore, and Storage
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
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
  'staging-e2e'
);

const auth = getAuth(stagingApp);
const db = getFirestore(stagingApp);

interface TestResult {
  email: string;
  uid: string;
  checks: {
    authExists: boolean;
    emailMatch: boolean;
    firestoreExists: boolean;
    hasRequiredFields: boolean;
    hasSports: boolean;
    hasProfileImgs: boolean;
    hasMigrationMeta: boolean;
    dataIntegrity: boolean;
  };
  passed: boolean;
  errors: string[];
}

async function runE2ETest() {
  console.log('\n🧪 End-to-End Migration Test\n');
  console.log('━'.repeat(70));

  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUsers = uidMapping.results.filter((r: any) => r.uid);

  const results: TestResult[] = [];

  for (const target of targetUsers) {
    const uid = target.uid;
    const email = target.email;
    const errors: string[] = [];

    const result: TestResult = {
      email,
      uid,
      checks: {
        authExists: false,
        emailMatch: false,
        firestoreExists: false,
        hasRequiredFields: false,
        hasSports: false,
        hasProfileImgs: false,
        hasMigrationMeta: false,
        dataIntegrity: false,
      },
      passed: false,
      errors,
    };

    try {
      console.log(`\n🔍 Testing: ${email}`);

      // Check 1: Auth exists
      let authUser;
      try {
        authUser = await auth.getUser(uid);
        result.checks.authExists = true;
        console.log(`   ✅ Auth exists`);
      } catch (e) {
        errors.push('Auth user not found');
        console.log(`   ❌ Auth not found`);
      }

      // Check 2: Email match
      if (authUser && authUser.email === email) {
        result.checks.emailMatch = true;
        console.log(`   ✅ Email matches`);
      } else {
        errors.push(`Email mismatch: ${authUser?.email} vs ${email}`);
        console.log(`   ❌ Email mismatch`);
      }

      // Check 3: Firestore exists
      const userDoc = await db.collection('users').doc(uid).get();
      if (userDoc.exists) {
        result.checks.firestoreExists = true;
        console.log(`   ✅ Firestore doc exists`);

        const userData = userDoc.data()!;

        // Check 4: Required fields
        if (userData.email && userData.uid) {
          result.checks.hasRequiredFields = true;
          console.log(`   ✅ Required fields present`);
        } else {
          errors.push('Missing required fields (email or uid)');
          console.log(`   ❌ Missing required fields`);
        }

        // Check 5: Has sports
        if (Array.isArray(userData.sports) && userData.sports.length > 0) {
          result.checks.hasSports = true;
          console.log(`   ✅ Sports data present (${userData.sports.length})`);
        } else {
          errors.push('No sports data');
          console.log(`   ⚠️  No sports data`);
        }

        // Check 6: Has profileImgs
        if (Array.isArray(userData.profileImgs)) {
          result.checks.hasProfileImgs = true;
          console.log(
            `   ✅ ProfileImgs array present (${userData.profileImgs.length})`
          );
        } else {
          errors.push('ProfileImgs not an array');
          console.log(`   ❌ ProfileImgs issue`);
        }

        // Check 7: Migration metadata
        if (
          userData._schemaVersion === 2 &&
          userData._migratedAt &&
          userData._sourceProject
        ) {
          result.checks.hasMigrationMeta = true;
          console.log(`   ✅ Migration metadata present`);
        } else {
          errors.push('Missing migration metadata');
          console.log(`   ❌ Missing migration metadata`);
        }

        // Check 8: Data integrity (UID match)
        if (userData.uid === uid && userData.email === email) {
          result.checks.dataIntegrity = true;
          console.log(`   ✅ Data integrity OK`);
        } else {
          errors.push('Data integrity issue (UID/email mismatch)');
          console.log(`   ❌ Data integrity issue`);
        }
      } else {
        errors.push('Firestore document not found');
        console.log(`   ❌ Firestore doc not found`);
      }

      // Overall pass/fail
      result.passed = Object.values(result.checks).filter((v) => v).length >= 6;
    } catch (error) {
      errors.push((error as Error).message);
      console.error(`   ❌ Test error: ${(error as Error).message}`);
    }

    results.push(result);
  }

  // Summary
  console.log('\n' + '━'.repeat(70));
  console.log('📊 E2E TEST SUMMARY');
  console.log('━'.repeat(70));

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  console.log(`\n✅ Passed: ${passedCount}/${results.length}`);
  console.log(`❌ Failed: ${failedCount}/${results.length}\n`);

  if (failedCount > 0) {
    console.log('❌ FAILED USERS:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`\n   ${r.email}:`);
        r.errors.forEach((err) => console.log(`      - ${err}`));
      });
    console.log('');
  }

  if (passedCount === results.length) {
    console.log('🎉 ALL TESTS PASSED! Migration successful!\n');
  } else {
    console.log('⚠️  Some tests failed. Review errors above.\n');
  }

  await stagingApp.delete();
  process.exit(failedCount > 0 ? 1 : 0);
}

runE2ETest();
```

---

## 🚀 Run All Verifications

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# 1. Verify Auth
echo "=== Phase 2: Auth Verification ==="
npx tsx scripts/migration/verify-auth-import.ts

# 2. Verify Firestore
echo "\n=== Phase 3: Firestore Verification ==="
npx tsx scripts/migration/verify-firestore-migration.ts

# 3. Verify Storage
echo "\n=== Phase 4: Storage Verification ==="
npx tsx scripts/migration/verify-storage-migration.ts

# 4. Run E2E Test
echo "\n=== End-to-End Test ==="
npx tsx scripts/migration/e2e-migration-test.ts
```

---

## 🧪 Manual Testing Checklist

### **Test 1: Google OAuth Login**

- [ ] ngocsonxx98@gmail.com can login via Google
- [ ] sonngoc.dev@gmail.com can login via Google
- [ ] john@nxt1sports.com can login via Google (if has Google provider)
- [ ] web.developer.gz@gmail.com can login via Google

### **Test 2: Profile Data Visible**

- [ ] User profile displays correctly
- [ ] Sports information shows
- [ ] Profile images load
- [ ] Academic info present

### **Test 3: App Functionality**

- [ ] Posts can be viewed
- [ ] Profile can be edited
- [ ] Images can be uploaded
- [ ] Search works

### **Test 4: Password Reset (for password-only users)**

- [ ] superadmin@nxt1sports.com receives reset email
- [ ] Can set new password
- [ ] Can login with new password

---

## 📊 Success Criteria

**Migration is successful if:**

- ✅ 5/5 Auth users verified
- ✅ 5/5 Firestore documents verified
- ✅ All profile images accessible
- ✅ E2E test passes for all users
- ✅ At least 3 users can login (Google OAuth)
- ✅ No data loss detected
- ✅ App functions normally with migrated data

---

## 🐛 Debugging Common Issues

### Issue: "Cannot login with Google"

```bash
# Check OAuth providers
npx tsx -e "
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert } from 'firebase-admin/app';
// ... check user.providerData
"
```

### Issue: "Profile images not loading"

```bash
# Check Storage permissions
gsutil iam get gs://nxt-1-staging-v2.firebasestorage.app/
```

### Issue: "Sports data missing"

```bash
# Check Firestore data
# Firebase Console → Firestore → users collection
```

---

## 📝 Test Report Template

```markdown
# Migration Test Report

**Date:** YYYY-MM-DD **Tester:** [Name] **Environment:** nxt-1-staging-v2

## Test Results

| Test                   | Status | Notes |
| ---------------------- | ------ | ----- |
| Auth Verification      | ✅/❌  |       |
| Firestore Verification | ✅/❌  |       |
| Storage Verification   | ✅/❌  |       |
| E2E Test               | ✅/❌  |       |
| Manual Login Test      | ✅/❌  |       |
| App Functionality      | ✅/❌  |       |

## Issues Found

1. [Issue description]
2. [Issue description]

## Recommendation

- [ ] Ready for production migration
- [ ] Needs fixes before production
- [ ] Rollback required
```

---

**Estimated Time:** 1-2 hours  
**Prerequisites:** Phases 2, 3, 4 complete  
**Next Phase:** Phase 6 - Rollback Plan (if needed)
