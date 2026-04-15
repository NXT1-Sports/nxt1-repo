# Phase 3 - Firestore Migration Quick Start

**Start here when continuing Phase 3**

---

## 🎯 Quick Checklist

- [ ] Verify Phase 2 complete: `npx tsx scripts/migration/verify-auth-import.ts`
- [ ] Check environment: `cat ../../.env | grep FIREBASE | head -8`
- [ ] Create user-mapper.ts (template below)
- [ ] Create migrate-users-to-v2.ts (template below)
- [ ] Test dry-run: `npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run`
- [ ] Apply: `npx tsx scripts/migration/migrate-users-to-v2.ts --apply`
- [ ] Verify: `npx tsx scripts/migration/verify-firestore-migration.ts`

---

## 📝 Template 1: user-mapper.ts

```typescript
#!/usr/bin/env tsx
/**
 * Data transformation mapper: Old User Schema → New User Schema
 * Converts primarySport/secondarySport → sports[] array
 * Converts profileImg → profileImgs[] array
 */

import type { SportProfile } from '@nxt1/core/models/user/user-sport.model';

// Old user type (from nxt1/src/app/models/user.ts)
interface OldUser {
  uid: string;
  email: string;
  displayName?: string;
  profileImg?: string;
  primarySport?: {
    name: string;
    position?: string;
    achievements?: string[];
    stats?: any;
  };
  secondarySport?: {
    name: string;
    position?: string;
  };
  academicInfo?: {
    gpa?: number;
    schoolName?: string;
  };
  classOf?: {
    year?: number;
  };
  bio?: string;
  location?: string;
  // ... add other fields as needed
}

// New user type (simplified)
interface NewUser {
  uid: string;
  email: string;
  displayName?: string;
  profileImgs: string[];
  sports: SportProfile[];
  athlete?: {
    academics?: {
      gpa?: number;
      school?: string;
    };
    classOf?: number;
  };
  bio?: string;
  location?: string;
  _schemaVersion: number;
  _migratedAt: Date;
  _sourceProject: string;
  _legacy: OldUser; // Backup original data
}

/**
 * Main transformation function
 */
export function mapOldUserToNewUser(oldUser: OldUser): NewUser {
  const sports: SportProfile[] = [];

  // Convert primarySport to sports[0]
  if (oldUser.primarySport?.name) {
    sports.push({
      sport: oldUser.primarySport.name,
      position: oldUser.primarySport.position || '',
      isPrimary: true,
      achievements: oldUser.primarySport.achievements || [],
      stats: oldUser.primarySport.stats || {},
    } as SportProfile);
  }

  // Convert secondarySport to sports[1]
  if (oldUser.secondarySport?.name) {
    sports.push({
      sport: oldUser.secondarySport.name,
      position: oldUser.secondarySport.position || '',
      isPrimary: false,
      achievements: [],
      stats: {},
    } as SportProfile);
  }

  // Convert profileImg to profileImgs array
  const profileImgs: string[] = [];
  if (oldUser.profileImg) {
    profileImgs.push(oldUser.profileImg);
  }

  // Build athlete object
  const athlete = {
    academics: oldUser.academicInfo
      ? {
          gpa: oldUser.academicInfo.gpa,
          school: oldUser.academicInfo.schoolName,
        }
      : undefined,
    classOf: oldUser.classOf?.year,
  };

  // Build new user object
  const newUser: NewUser = {
    uid: oldUser.uid,
    email: oldUser.email,
    displayName: oldUser.displayName,
    profileImgs,
    sports,
    athlete,
    bio: oldUser.bio,
    location: oldUser.location,
    _schemaVersion: 2,
    _migratedAt: new Date(),
    _sourceProject: 'nxt-1-de054',
    _legacy: oldUser, // Preserve original data
  };

  return newUser;
}

/**
 * Validate transformed user data
 */
export function validateNewUser(user: NewUser): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!user.uid) errors.push('Missing uid');
  if (!user.email) errors.push('Missing email');
  if (!Array.isArray(user.profileImgs))
    errors.push('profileImgs must be array');
  if (!Array.isArray(user.sports)) errors.push('sports must be array');
  if (!user._schemaVersion) errors.push('Missing _schemaVersion');
  if (!user._migratedAt) errors.push('Missing _migratedAt');

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

---

## 📝 Template 2: migrate-users-to-v2.ts

```typescript
#!/usr/bin/env tsx
/**
 * Phase 3: Firestore Users Collection Migration
 * Migrates 5 target users from legacy to staging-v2
 *
 * Usage:
 *   npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run
 *   npx tsx scripts/migration/migrate-users-to-v2.ts --apply
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mapOldUserToNewUser, validateNewUser } from './user-mapper';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

// Initialize Firebase apps
const legacyApp = initializeApp(
  {
    credential: cert({
      projectId: process.env.LEGACY_FIREBASE_PROJECT_ID,
      clientEmail: process.env.LEGACY_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.LEGACY_FIREBASE_PRIVATE_KEY?.replace(
        /\\n/g,
        '\n'
      ),
    }),
  },
  'legacy-firestore'
);

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
  'staging-firestore'
);

const legacyDb = getFirestore(legacyApp);
const stagingDb = getFirestore(stagingApp);

async function migrateUsers() {
  const isDryRun = process.argv.includes('--dry-run');
  const mode = isDryRun ? 'DRY-RUN' : 'APPLY';

  console.log(`\n🚀 Phase 3: Firestore Migration - ${mode} Mode\n`);

  // Load target users
  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUsers = uidMapping.results.filter(
    (r: any) => r.uid && r.firestoreExists
  );

  console.log(`📋 Migrating ${targetUsers.length} users...\n`);

  let successCount = 0;
  let failCount = 0;
  const errors: any[] = [];

  for (const target of targetUsers) {
    const uid = target.uid;
    const email = target.email;

    try {
      console.log(`\n🔄 Processing: ${email}`);
      console.log(`   UID: ${uid}`);

      // Fetch from legacy Firestore
      const legacyDocRef = legacyDb.collection('Users').doc(uid);
      const legacyDoc = await legacyDocRef.get();

      if (!legacyDoc.exists) {
        console.log(
          `   ⚠️  Not found in legacy Firestore (using UID), skipping...`
        );

        // Try by email as fallback
        const querySnapshot = await legacyDb
          .collection('Users')
          .where('email', '==', email)
          .limit(1)
          .get();

        if (querySnapshot.empty) {
          console.log(`   ❌ Not found by email either`);
          failCount++;
          errors.push({ email, uid, error: 'Not found in legacy Firestore' });
          continue;
        }

        const doc = querySnapshot.docs[0];
        console.log(`   ✅ Found by email, doc ID: ${doc.id}`);
        const oldUser = { uid, ...doc.data() };

        // Transform data
        console.log(`   🔧 Transforming data...`);
        const newUser = mapOldUserToNewUser(oldUser as any);

        // Validate
        const validation = validateNewUser(newUser);
        if (!validation.valid) {
          console.log(`   ❌ Validation failed:`, validation.errors);
          failCount++;
          errors.push({ email, uid, error: validation.errors });
          continue;
        }

        console.log(`   ✅ Validation passed`);
        console.log(`      Sports: ${newUser.sports.length}`);
        console.log(`      Profile Images: ${newUser.profileImgs.length}`);

        // Write to staging
        if (!isDryRun) {
          const stagingDocRef = stagingDb.collection('users').doc(uid);
          await stagingDocRef.set(newUser, { merge: false }); // Overwrite mode
          console.log(`   ✅ Written to staging-v2`);
        } else {
          console.log(`   🔍 DRY-RUN: Would write to staging-v2`);
        }

        successCount++;
      } else {
        const oldUser = { uid, ...legacyDoc.data() };

        // Transform data
        console.log(`   🔧 Transforming data...`);
        const newUser = mapOldUserToNewUser(oldUser as any);

        // Validate
        const validation = validateNewUser(newUser);
        if (!validation.valid) {
          console.log(`   ❌ Validation failed:`, validation.errors);
          failCount++;
          errors.push({ email, uid, error: validation.errors });
          continue;
        }

        console.log(`   ✅ Validation passed`);
        console.log(`      Sports: ${newUser.sports.length}`);
        console.log(`      Profile Images: ${newUser.profileImgs.length}`);

        // Write to staging
        if (!isDryRun) {
          const stagingDocRef = stagingDb.collection('users').doc(uid);
          await stagingDocRef.set(newUser, { merge: false }); // Overwrite mode
          console.log(`   ✅ Written to staging-v2`);
        } else {
          console.log(`   🔍 DRY-RUN: Would write to staging-v2`);
        }

        successCount++;
      }
    } catch (error) {
      console.error(`   ❌ Error:`, (error as Error).message);
      failCount++;
      errors.push({ email, uid, error: (error as Error).message });
    }
  }

  console.log('\n' + '━'.repeat(70));
  console.log(`📋 MIGRATION SUMMARY (${mode})`);
  console.log('━'.repeat(70));
  console.log(`✅ Success: ${successCount}/${targetUsers.length}`);
  console.log(`❌ Failed: ${failCount}/${targetUsers.length}\n`);

  if (errors.length > 0) {
    console.log('❌ ERRORS:');
    errors.forEach((e) => {
      console.log(`   ${e.email}: ${JSON.stringify(e.error)}`);
    });
  }

  if (isDryRun) {
    console.log('\n💡 This was a DRY-RUN. No data was written.');
    console.log('   Run with --apply to execute migration.\n');
  } else {
    console.log('\n✅ Migration complete!\n');
  }

  await legacyApp.delete();
  await stagingApp.delete();
}

migrateUsers().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

---

## 📝 Template 3: verify-firestore-migration.ts

```typescript
#!/usr/bin/env tsx
/**
 * Verify Firestore migration results
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
  'staging-verify'
);

const db = getFirestore(stagingApp);

async function verifyMigration() {
  console.log('\n🔍 Verifying Firestore Migration...\n');

  const uidMappingPath = resolve(__dirname, './user-uid-mapping.json');
  const uidMapping = JSON.parse(readFileSync(uidMappingPath, 'utf-8'));
  const targetUsers = uidMapping.results.filter((r: any) => r.uid);

  let successCount = 0;
  let failCount = 0;

  for (const target of targetUsers) {
    const uid = target.uid;
    const email = target.email;

    try {
      const docRef = db.collection('users').doc(uid);
      const doc = await docRef.get();

      if (!doc.exists) {
        console.log(`❌ ${email}`);
        console.log(`   Not found in staging Firestore\n`);
        failCount++;
        continue;
      }

      const data = doc.data()!;
      const checks = {
        hasEmail: !!data.email,
        hasSports: Array.isArray(data.sports) && data.sports.length > 0,
        hasProfileImgs: Array.isArray(data.profileImgs),
        hasSchemaVersion: data._schemaVersion === 2,
        hasMigrationMeta: !!data._migratedAt,
        hasLegacyBackup: !!data._legacy,
      };

      const allPassed = Object.values(checks).every((v) => v);

      console.log(`${allPassed ? '✅' : '⚠️'} ${email}`);
      console.log(`   UID: ${uid}`);
      console.log(`   Sports: ${data.sports?.length || 0}`);
      console.log(`   Profile Images: ${data.profileImgs?.length || 0}`);
      console.log(`   Schema Version: ${data._schemaVersion || 'MISSING'}`);
      console.log(
        `   Migrated At: ${data._migratedAt?.toDate?.() || 'MISSING'}`
      );

      if (!allPassed) {
        console.log(`   ⚠️  Issues:`);
        Object.entries(checks).forEach(([key, value]) => {
          if (!value) console.log(`      - ${key}: FAILED`);
        });
      }
      console.log('');

      if (allPassed) successCount++;
      else failCount++;
    } catch (error) {
      console.error(`❌ ${email}: ${(error as Error).message}\n`);
      failCount++;
    }
  }

  console.log('━'.repeat(70));
  console.log('📋 VERIFICATION SUMMARY');
  console.log('━'.repeat(70));
  console.log(`✅ Passed: ${successCount}/${targetUsers.length}`);
  console.log(`❌ Failed: ${failCount}/${targetUsers.length}\n`);

  if (successCount === targetUsers.length) {
    console.log('🎉 All users migrated successfully!\n');
  } else {
    console.log('⚠️  Some users failed verification.\n');
  }

  await stagingApp.delete();
}

verifyMigration();
```

---

## 🚀 Execution Steps

```bash
# 1. Navigate to backend directory
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# 2. Create the 3 scripts above
touch scripts/migration/user-mapper.ts
touch scripts/migration/migrate-users-to-v2.ts
touch scripts/migration/verify-firestore-migration.ts

# 3. Copy templates into files (use code editor)

# 4. Test mapper independently
npx tsx -e "import { mapOldUserToNewUser } from './scripts/migration/user-mapper'; console.log('Mapper loaded OK')"

# 5. Run dry-run
npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run

# 6. If dry-run passes, apply migration
npx tsx scripts/migration/migrate-users-to-v2.ts --apply

# 7. Verify results
npx tsx scripts/migration/verify-firestore-migration.ts

# 8. Check in Firebase Console
# https://console.firebase.google.com/project/nxt-1-staging-v2/firestore/data/~2Fusers
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: "Cannot find module './user-mapper'"

```bash
# Solution: Ensure user-mapper.ts exports functions
# Add to user-mapper.ts: export { mapOldUserToNewUser, validateNewUser }
```

### Issue 2: "Document not found in legacy Firestore"

```bash
# Solution: Check user-uid-mapping.json
cat scripts/migration/user-uid-mapping.json | jq '.results[] | select(.firestoreExists == false)'

# User might be in Auth but not Firestore
# Script will try fallback search by email
```

### Issue 3: TypeScript errors

```bash
# Solution: Add type assertions
# Change: const oldUser = doc.data()
# To: const oldUser = doc.data() as any
```

---

## 📚 Reference Models

**Old User Model Location:**

```
/Users/sotatek/Downloads/Source_Code/NXT1/nxt1/src/app/models/user.ts
```

**New User Model Location:**

```
/Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/packages/core/src/models/user/user.model.ts
/Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/packages/core/src/models/user/user-sport.model.ts
```

---

**Last Updated:** April 10, 2026  
**Estimated Time:** 2-3 hours
