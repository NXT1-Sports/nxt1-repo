# 🚀 NXT1 Legacy → V2 Migration Progress

**Migration ID:** canary-2026-04-10  
**Date Started:** April 10, 2026  
**Last Updated:** April 12, 2026  
**Status:** ✅ All Phases Complete (Canary)

---

## 📊 Overall Progress

- ✅ **Phase 1:** Prerequisites & Validation (100%)
- ✅ **Phase 2:** Firebase Authentication Migration (100%)
- ✅ **Phase 3:** Firestore Users Collection Migration (100%)
- ✅ **Phase 3b:** Unicodes Collection (100%)
- ✅ **Phase 3c:** TeamCodes → Organizations + Teams + RosterEntries (100%)
- ✅ **Phase 3d:** User Content (Recruiting, Posts, Stats) (100%)
- ✅ **Phase 4:** Profile Images / Storage Migration (100%)
- ✅ **Phase 5:** Verification & Testing (100%)

---

## 🚀 Run Everything in One Command

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# Dry run first (recommended)
npx tsx scripts/migration/migrate-all.ts --dry-run

# Live run
npx tsx scripts/migration/migrate-all.ts

# Skip auth (already migrated) and storage (use gsutil separately)
npx tsx scripts/migration/migrate-all.ts --skip-auth --skip-storage

# Run only specific phases
npx tsx scripts/migration/migrate-all.ts --only=users,unicodes,teamcodes
```

### Pipeline Order (`migrate-all.ts`)

| Step | Phase       | Script                          | Description                            |
| ---- | ----------- | ------------------------------- | -------------------------------------- |
| 1    | `auth`      | `migrate-auth-master.ts`        | Pre-cleanup + auth:import + fix emails |
| 2    | `users`     | `migrate-target-users-data.ts`  | Users collection V3 schema             |
| 3    | `unicodes`  | `migrate-unicodes.ts`           | Unicodes collection                    |
| 4    | `teamcodes` | `migrate-target-teamcodes.ts`   | Orgs + Teams + RosterEntries           |
| 5    | `content`   | `migrate-user-content-to-v2.ts` | Recruiting, Posts, Stats               |
| 6    | `storage`   | `migrate-profile-images.ts`     | Copy images + rewrite URLs             |

> **Note:** Storage bulk copy (HighlightImages, etc.) must be run separately via
> `gsutil`:
>
> ```bash
> gsutil -m cp -r gs://nxt-1-de054.appspot.com/HighLightImages gs://nxt-1-staging-v2.firebasestorage.app/
> ```

---

## ✅ Phase 2 Complete - Authentication Migration

### **What Was Done:**

1. **Exported Auth from Legacy** (nxt-1-de054)
   - Total users exported: 4,843
   - Filtered to 5 target users
   - Files: `auth-export.json`, `auth-export-filtered.json`

2. **Imported to Staging-V2** (nxt-1-staging-v2)
   - 5/5 users imported successfully
   - UIDs preserved ✅
   - Emails verified ✅
   - Google OAuth providers preserved ✅

3. **Fixed Issues:**
   - ✅ Updated 2 missing emails (sonngoc.dev, web.developer.gz)
   - ✅ Deleted duplicate staging account
   - ✅ Cleaned up 2 anonymous artifacts

4. **Password Status:**
   - ✅ **Passwords PRESERVED** (SCRYPT hash key retrieved via Identity Toolkit
     API)
   - Hash Algorithm: SCRYPT (rounds=8, mem-cost=14)
   - Signer Key: Retrieved via `identitytoolkit.googleapis.com/admin/v2`
   - All users can login with original passwords ✅

### **Migrated Users:**

| Email                      | UID                          | Providers  | Login Status      |
| -------------------------- | ---------------------------- | ---------- | ----------------- |
| john@nxt1sports.com        | p8OiVVIknKhgncxVahKeRs8HzD63 | password   | ✅ Password works |
| ngocsonxx98@gmail.com      | aQCDuA3XYdcJdLt6wpzpxWgeHge2 | google.com | ✅ Google login   |
| sonngoc.dev@gmail.com      | evIdVndqrIPCVUjFyKZyc5WTQeA3 | google.com | ✅ Google login   |
| web.developer.gz@gmail.com | pXBew7UKMPPuMvpX8HBDZaqjvIA3 | google.com | ✅ Google login   |
| superadmin@nxt1sports.com  | 8bFPSc7LY6VoAL6kEDO6pEha8yE2 | password   | ✅ Password works |

---

## ✅ Phase 3 Complete - Firestore Users

- Migrated 5 users from legacy `Users` → staging `users` with V3 schema
- Script: `migrate-target-users-data.ts --apply`

---

## ✅ Phase 3b Complete - Unicodes

- Created `Unicodes` collection docs for all canary users
- Script: `migrate-unicodes.ts --target-users`

---

## ✅ Phase 3c Complete - TeamCodes → V3 Collections

For each canary user's `teamCode` embedded doc:

- Created **Organization** doc (`Organizations/{<teamId>}`)
- Created **Team** doc (`Teams/{teamId}`) with `slug`, `organizationId`, all
  fields
- Created **RosterEntries** for all `members[]` + `memberIds[]`
- Script: `migrate-target-teamcodes.ts`

---

## ✅ Phase 3d Complete - User Content

- Migrated RecruitingActivity, Posts, Stats sub-collections
- Script: `migrate-user-content-to-v2.ts`

---

## ✅ Phase 4 Complete - Storage

- Profile images copied + Firestore URLs rewritten
- Script: `migrate-profile-images.ts --apply`
- Bulk assets (HighlightImages, etc.) copied via `gsutil -m cp -r`

---

## 📁 Key Files

```
backend/scripts/migration/
├── migrate-all.ts                  ← ✨ MASTER ORCHESTRATOR (run all phases)
├── migrate-auth-master.ts          ← Phase 1: Auth
├── migrate-target-users-data.ts    ← Phase 2: Users (canary)
├── migrate-unicodes.ts             ← Phase 3: Unicodes
├── migrate-target-teamcodes.ts     ← Phase 4: TeamCodes → Orgs+Teams+Roster
├── migrate-user-content-to-v2.ts   ← Phase 5: User content
├── migrate-profile-images.ts       ← Phase 6: Storage
├── migration-utils.ts              ← Shared utilities
├── user-uid-mapping.json           ← UID mapping (5 canary users)
├── auth-export-filtered.json       ← Filtered auth export
└── hash-config.json                ← SCRYPT hash key (KEEP SAFE)
```

---

## 📊 Overall Progress

- ✅ **Phase 1:** Prerequisites & Validation (100%)
- ✅ **Phase 2:** Firebase Authentication Migration (100%)
- ⏳ **Phase 3:** Firestore Users Collection Migration (0%)
- ⏳ **Phase 4:** Profile Images Migration (0%)
- ⏳ **Phase 5:** Verification & Testing (0%)
- ⏳ **Phase 6:** Rollback Plan (standby)

---

## ✅ Phase 2 Complete - Authentication Migration

### **What Was Done:**

1. **Exported Auth from Legacy** (nxt-1-de054)
   - Total users exported: 4,843
   - Filtered to 5 target users
   - Files: `auth-export.json`, `auth-export-filtered.json`

2. **Imported to Staging-V2** (nxt-1-staging-v2)
   - 5/5 users imported successfully
   - UIDs preserved ✅
   - Emails verified ✅
   - Google OAuth providers preserved ✅

3. **Fixed Issues:**
   - ✅ Updated 2 missing emails (sonngoc.dev, web.developer.gz)
   - ✅ Deleted duplicate staging account
   - ✅ Cleaned up 2 anonymous artifacts

4. **Password Status:**
   - ✅ **Passwords PRESERVED** (SCRYPT hash key retrieved via Identity Toolkit
     API)
   - Hash Algorithm: SCRYPT (rounds=8, mem-cost=14)
   - Signer Key: Retrieved via `identitytoolkit.googleapis.com/admin/v2`
     endpoint
   - All users can login with original passwords ✅

5. **Technical Achievement:**
   - Retrieved SCRYPT hash key via Firebase Identity Toolkit API (undocumented
     endpoint)
   - Method:
     `GET https://identitytoolkit.googleapis.com/admin/v2/projects/{project}/config`
   - Required: Service account credentials with proper scopes
   - Hash config saved: `hash-config.json`

### **Migrated Users:**

| Email                      | UID                          | Email Match | Providers  | Login Status      |
| -------------------------- | ---------------------------- | ----------- | ---------- | ----------------- |
| john@nxt1sports.com        | p8OiVVIknKhgncxVahKeRs8HzD63 | ✅          | password   | ✅ Password works |
| ngocsonxx98@gmail.com      | aQCDuA3XYdcJdLt6wpzpxWgeHge2 | ✅          | google.com | ✅ Google login   |
| sonngoc.dev@gmail.com      | evIdVndqrIPCVUjFyKZyc5WTQeA3 | ✅          | google.com | ✅ Google login   |
| web.developer.gz@gmail.com | pXBew7UKMPPuMvpX8HBDZaqjvIA3 | ✅          | google.com | ✅ Google login   |
| superadmin@nxt1sports.com  | 8bFPSc7LY6VoAL6kEDO6pEha8yE2 | ✅          | password   | ✅ Password works |

### **Files Created in Phase 2:**

```
nxt1-repo/backend/scripts/migration/
├── target-users.json                      # 5 target emails
├── user-uid-mapping.json                  # UID mapping (generated)
├── auth-export.json                       # Full export (4,843 users, 1.6MB)
├── auth-export-filtered.json              # Filtered (5 users, 2.7KB)
├── hash-config.json                       # SCRYPT hash key (SAVED!)
├── check-users-exist.ts                   # Validation script
├── filter-auth-export.ts                  # Filter script
├── verify-auth-import.ts                  # Verification script
├── fix-missing-emails.ts                  # Email fix script
├── find-duplicate-email.ts                # Duplicate detection
├── delete-duplicate-account.ts            # Cleanup script
├── check-anonymous-accounts.ts            # Artifact detection
├── cleanup-anonymous-artifacts.ts         # Artifact cleanup
├── find-hash-key-all-methods.ts           # Multi-method hash discovery
├── try-api-hash-key.ts                    # Identity Toolkit API (SUCCESS!)
├── rollback-auth-import.ts                # Rollback script (for re-import)
└── PHASE-2-AUTH-MIGRATION.md              # Phase 2 docs
```

---

## 🔜 Phase 3 Next Steps - Firestore Migration

### **Objective:**

Migrate 5 users' Firestore data from legacy `Users` collection to new schema
with data transformation.

### **Data Transformation Required:**

**Old Schema (nxt-1-de054):**

```typescript
{
  profileImg: string,              // Single image URL
  primarySport: {
    name: string,
    position: string,
    achievements: string[]
  },
  secondarySport: {
    name: string,
    position: string
  },
  academicInfo: {
    gpa: number,
    schoolName: string
  },
  classOf: {
    year: number,
    semester: string
  }
  // ... other fields
}
```

**New Schema (nxt-1-staging-v2):**

```typescript
{
  profileImgs: string[],           // Array of images
  sports: SportProfile[],          // Unified sports array
  athlete: {
    academics: {
      gpa: number,
      school: string
    },
    classOf: number
  },
  _schemaVersion: 2,
  _migratedAt: Timestamp,
  _sourceProject: 'nxt-1-de054',
  _legacy: { /* backup of old data */ }
  // ... other fields
}
```

### **Scripts to Create:**

#### 1. **user-mapper.ts** - Data transformation logic

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
# Create: scripts/migration/user-mapper.ts
```

**Functions needed:**

- `mapOldUserToNewUser(oldUser)` - Main transformation
- `mapSportProfile(oldUser, isPrimary)` - Convert sport data
- `mapAthleteData(oldUser)` - Extract athlete fields
- `addMigrationMetadata(newUser)` - Add tracking fields

#### 2. **migrate-users-to-v2.ts** - Main migration script

```bash
# Create: scripts/migration/migrate-users-to-v2.ts
```

**Features:**

- Load 5 UIDs from `user-uid-mapping.json`
- Connect to both Firebase projects (legacy + staging)
- For each user:
  - Fetch from legacy Firestore
  - Transform via `mapOldUserToNewUser()`
  - Validate transformed data
  - Write to staging Firestore (overwrite mode)
- Support `--dry-run` and `--apply` modes
- Batch writes (500 per batch)
- Error handling per-user
- Log to MigrationLogs collection

#### 3. **verify-firestore-migration.ts** - Verification

```bash
# Create: scripts/migration/verify-firestore-migration.ts
```

**Checks:**

- All 5 users exist in staging Firestore
- Required fields present
- Sports array has data
- Profile images array populated
- Migration metadata correct

---

## 🛠️ Commands to Continue

### **On This Machine:**

```bash
# Navigate to project
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# Check environment variables
cat .env | grep -E "(LEGACY|STAGING)_FIREBASE"

# Verify Phase 2 completion
npx tsx scripts/migration/verify-auth-import.ts

# Start Phase 3 - Create mapper
code scripts/migration/user-mapper.ts

# After creating scripts, test dry-run
npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run

# Apply migration
npx tsx scripts/migration/migrate-users-to-v2.ts --apply

# Verify
npx tsx scripts/migration/verify-firestore-migration.ts
```

### **On Different Machine:**

```bash
# 1. Clone repository
git clone <repo-url>
cd nxt1-repo/backend

# 2. Install dependencies
npm install

# 3. Copy .env file from secure location
# Must have these credentials:
#   - LEGACY_FIREBASE_* (nxt-1-de054)
#   - STAGING_FIREBASE_* (nxt-1-staging-v2)

# 4. Verify environment
npx tsx scripts/migration/verify-auth-import.ts

# 5. Continue with Phase 3
# (Same commands as above)
```

---

## 📋 Environment Variables Required

```env
# Legacy Production (Source)
LEGACY_FIREBASE_PROJECT_ID=nxt-1-de054
LEGACY_FIREBASE_CLIENT_EMAIL=firebase-adminsdk-w01w0@nxt-1-de054.iam.gserviceaccount.com
LEGACY_FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
LEGACY_FIREBASE_STORAGE_BUCKET=nxt-1-de054.appspot.com

# Staging V2 (Destination)
STAGING_FIREBASE_PROJECT_ID=nxt-1-staging-v2
STAGING_FIREBASE_CLIENT_EMAIL=...
STAGING_FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
STAGING_FIREBASE_STORAGE_BUCKET=nxt-1-staging-v2.firebasestorage.app
```

**Location:** `/Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend/.env`

---

## ⚠️ Important Notes

### **Password Reset Required:**

After Phase 3 completes, 2 users need password reset:

- superadmin@nxt1sports.com
- web.developer.gz@gmail.com (if not using Google OAuth)

**Options:**

1. Firebase Console → Authentication → Select user → Reset password
2. Send reset email via script
3. Admin manually set temporary password

### **Firebase CLI Authentication:**

```bash
# Check current auth
firebase projects:list

# Should show access to:
# - nxt-1-de054 (legacy)
# - nxt-1-staging-v2 (staging)
# - nxt-1-v2 (future prod)
```

### **Rollback Plan:**

If Phase 3 fails:

1. Delete imported Firestore documents (5 users only)
2. Auth users remain (Phase 2 is separate)
3. Re-run migration after fixing issues

---

## 🎯 Success Criteria (Phase 3)

- [ ] 5 users exist in staging Firestore
- [ ] All UIDs match Auth UIDs
- [ ] Sports array populated (converted from primarySport/secondarySport)
- [ ] ProfileImgs array has data
- [ ] Athlete object structure correct
- [ ] Migration metadata present (\_schemaVersion, \_migratedAt,
      \_sourceProject)
- [ ] No data loss (old data backed up in \_legacy field)

---

## 📞 Contact & Support

**Firebase Projects:**

- Legacy: https://console.firebase.google.com/project/nxt-1-de054
- Staging: https://console.firebase.google.com/project/nxt-1-staging-v2

**Documentation:**

- Old User Model: `nxt1/src/app/models/user.ts`
- New User Model: `nxt1-repo/packages/core/src/models/user/user.model.ts`
- Sport Profile: `nxt1-repo/packages/core/src/models/user/user-sport.model.ts`

---

## 📝 Change Log

**2026-04-10 (Today):**

- ✅ Phase 1 completed: Setup & validation
- ✅ Phase 2 completed: Auth migration (5/5 users)
- ✅ Fixed duplicate and anonymous artifacts
- ⏸️ Paused before Phase 3
- 📌 Password preservation blocked (Firebase deprecated hash key access)
- 📌 Decision: Accept Google OAuth for 3 users, password reset for 2 users

**Next Session:**

- 🔜 Start Phase 3: Firestore migration
- 🔜 Create user-mapper.ts
- 🔜 Create migrate-users-to-v2.ts
- 🔜 Test dry-run
- 🔜 Apply migration
- 🔜 Verify results

---

## 🚀 Quick Resume Command

```bash
# One-liner to resume
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend && \
cat scripts/migration/MIGRATION-PROGRESS.md && \
echo "\n✅ Ready to continue Phase 3!"
```

---

**Last Updated:** April 10, 2026 01:30 AM  
**Next Phase:** Firestore Users Collection Migration  
**Estimated Time:** 2-3 hours
