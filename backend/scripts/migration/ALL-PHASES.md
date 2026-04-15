# 🗺️ Complete Migration Roadmap - All Phases

**NXT1 Legacy → V2 Migration (Canary Complete)**  
**Last Updated:** April 12, 2026

---

## 🚀 Run Everything

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# Dry run first
npx tsx scripts/migration/migrate-all.ts --dry-run

# Live run
npx tsx scripts/migration/migrate-all.ts

# Skip auth (already done) + skip storage (run gsutil separately)
npx tsx scripts/migration/migrate-all.ts --skip-auth --skip-storage

# Run specific phases only
npx tsx scripts/migration/migrate-all.ts --only=users,unicodes,teamcodes,content
```

**Bulk storage (run separately):**

```bash
gsutil -m cp -r gs://nxt-1-de054.appspot.com/HighLightImages gs://nxt-1-staging-v2.firebasestorage.app/
gsutil -m cp -r gs://nxt-1-de054.appspot.com/profileImages  gs://nxt-1-staging-v2.firebasestorage.app/
```

---

## 📍 Current Status

**✅ ALL CANARY PHASES COMPLETE**

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: Setup & Validation                     ✅ DONE    │
│  └─ Target users, environment, validation                   │
│                                                              │
│  Phase 2: Firebase Authentication                ✅ DONE    │
│  └─ UIDs, emails, providers, SCRYPT passwords               │
│                                                              │
│  Phase 3a: Firestore Users                       ✅ DONE    │
│  └─ V3 schema migration (14 field categories)               │
│                                                              │
│  Phase 3b: Unicodes                              ✅ DONE    │
│  └─ Unicodes collection created                             │
│                                                              │
│  Phase 3c: TeamCodes → V3 Collections            ✅ DONE    │
│  └─ Organizations + Teams + RosterEntries                   │
│                                                              │
│  Phase 3d: User Content                          ✅ DONE    │
│  └─ Recruiting, Posts, Stats                                │
│                                                              │
│  Phase 4: Storage (Profile Images)               ✅ DONE    │
│  └─ Copied files, updated URLs                              │
│                                                              │
│  Phase 5: Verification & Testing                 ✅ DONE    │
│                                                              │
│  Phase 6: Rollback Plan                         🧊 STANDBY  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Phase Details

### **Phase 1: Prerequisites & Validation** ✅

- ✅ Added environment variables (.env)
- ✅ Created target user list (5 emails)
- ✅ Validated users exist in source
- ✅ Generated UID mapping

**Key Files:** `target-users.json`, `user-uid-mapping.json`

---

### **Phase 2: Firebase Authentication** ✅

- ✅ Exported 4,843 auth users from legacy
- ✅ Filtered to 5 target users
- ✅ Imported to staging-v2 (UIDs + SCRYPT passwords preserved)
- ✅ Fixed 2 missing emails
- ✅ Deleted duplicate & anonymous artifacts

**Script:** `migrate-auth-master.ts`  
**Key Files:** `auth-export-filtered.json`, `hash-config.json`

---

### **Phase 3a: Firestore Users** ✅

- ✅ Migrated 5 canary users with full V3 schema transformation
- ✅ All 14 field categories mapped (sports, athlete, academics, etc.)

**Script:** `migrate-target-users-data.ts --apply`  
(Full migration → `migrate-users-to-v2.ts`)

---

### **Phase 3b: Unicodes** ✅

- ✅ Created Unicodes collection docs for all canary users

**Script:** `migrate-unicodes.ts --target-users`

---

### **Phase 3c: TeamCodes → V3 Collections** ✅

For each user's embedded `teamCode`:

- ✅ Created **Organization** doc (`Organizations/{org_<teamId>}`)
- ✅ Created **Team** doc (`Teams/{teamId}`) with slug + organizationId
- ✅ Created **RosterEntries** for all members[] + memberIds[]

**Script:** `migrate-target-teamcodes.ts`  
(Full migration → `migrate-teamcodes-to-v2.ts`)

---

### **Phase 3d: User Content** ✅

- ✅ Migrated RecruitingActivity, Posts, Stats sub-collections

**Script:** `migrate-user-content-to-v2.ts`

---

### **Phase 4: Storage** ✅

- ✅ Profile images copied from legacy → staging-v2
- ✅ Firestore profileImgs URLs rewritten
- ✅ Bulk assets (HighlightImages) copied via gsutil

**Scripts:** `migrate-profile-images.ts --apply` + gsutil

---

### **Phase 5: Verification** ✅

- ✅ Auth verified (5/5 users login works)
- ✅ Firestore docs verified
- ✅ Team profile endpoints return correct data
- ✅ `/api/v1/staging/teams/by-slug/:slug` resolves teamCode fallback

---

### **Phase 6: Rollback Plan** 🧊

See [PHASE-6-ROLLBACK-PLAN.md](./PHASE-6-ROLLBACK-PLAN.md)

---

## 📍 Current Status

**✅ Completed:** Phase 1 (Setup), Phase 2 (Authentication)  
**🔜 Next:** Phase 3 (Firestore Data)  
**📅 Started:** April 10, 2026

---

## 🎯 Migration Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Migration Pipeline                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: Setup & Validation                     ✅ DONE    │
│  └─ Target users, environment, validation                   │
│                                                              │
│  Phase 2: Firebase Authentication                ✅ DONE    │
│  └─ UIDs, emails, providers (passwords blocked)             │
│                                                              │
│  Phase 3: Firestore Data Transformation         ⏳ TODO    │
│  └─ Users collection, schema migration                      │
│                                                              │
│  Phase 4: Storage (Profile Images)              ⏳ TODO    │
│  └─ Copy files, update URLs                                 │
│                                                              │
│  Phase 5: Verification & Testing                ⏳ TODO    │
│  └─ E2E testing, manual QA                                  │
│                                                              │
│  Phase 6: Rollback Plan                         🧊 STANDBY │
│  └─ Emergency procedures (if needed)                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📚 Phase Details

### **Phase 1: Prerequisites & Validation** ✅

**Status:** Complete  
**Time:** 1-2 hours  
**Documentation:** [MIGRATION-PROGRESS.md](./MIGRATION-PROGRESS.md)

**What was done:**

- ✅ Added environment variables (.env)
- ✅ Created target user list (5 emails)
- ✅ Validated users exist in source
- ✅ Generated UID mapping

**Key Files:**

- `target-users.json`
- `user-uid-mapping.json`
- `check-users-exist.ts`

---

### **Phase 2: Firebase Authentication** ✅

**Status:** Complete  
**Time:** 2-3 hours  
**Documentation:** [PHASE-2-AUTH-MIGRATION.md](./PHASE-2-AUTH-MIGRATION.md)

**What was done:**

- ✅ Exported 4,843 auth users from legacy
- ✅ Filtered to 5 target users
- ✅ Imported to staging-v2 (UIDs preserved)
- ✅ Fixed 2 missing emails
- ✅ Deleted duplicate & anonymous artifacts
- ⚠️ Passwords NOT preserved (Firebase limitation)

**Key Results:**

- 5/5 users migrated successfully
- 3 users can login via Google OAuth
- 2 users need password reset

**Key Files:**

- `auth-export.json` (1.6MB)
- `auth-export-filtered.json` (2.7KB)
- `verify-auth-import.ts`
- `fix-missing-emails.ts`

---

### **Phase 3: Firestore Users Collection** ⏳

**Status:** TODO  
**Time:** 2-3 hours  
**Documentation:** [PHASE-3-QUICK-START.md](./PHASE-3-QUICK-START.md)

**What to do:**

1. Create `user-mapper.ts` - Transform old schema → new schema
2. Create `migrate-users-to-v2.ts` - Main migration script
3. Test with `--dry-run` mode
4. Execute with `--apply` mode
5. Run `verify-firestore-migration.ts`

**Data Transformations:**

- `profileImg` → `profileImgs[]` (string to array)
- `primarySport` + `secondarySport` → `sports[]` (unified array)
- `academicInfo` → `athlete.academics` (nested)
- Add migration metadata

**Commands:**

```bash
# Dry-run
npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run

# Apply
npx tsx scripts/migration/migrate-users-to-v2.ts --apply

# Verify
npx tsx scripts/migration/verify-firestore-migration.ts
```

---

### **Phase 4: Storage / Profile Images** ⏳

**Status:** TODO  
**Time:** 30 min - 1 hour  
**Documentation:** [PHASE-4-STORAGE-MIGRATION.md](./PHASE-4-STORAGE-MIGRATION.md)

**What to do:**

1. Install/verify gsutil CLI
2. Authenticate with Google Cloud
3. Create `migrate-profile-images.ts`
4. Copy images: legacy bucket → staging bucket
5. Update Firestore URLs

**Tools Required:**

- Google Cloud SDK (gsutil)
- Storage bucket access permissions

**Commands:**

```bash
# Check access
gsutil ls gs://nxt-1-de054.appspot.com/

# Dry-run
npx tsx scripts/migration/migrate-profile-images.ts --dry-run

# Apply
npx tsx scripts/migration/migrate-profile-images.ts --apply
```

---

### **Phase 5: Verification & Testing** ⏳

**Status:** TODO  
**Time:** 1-2 hours  
**Documentation:** [PHASE-5-VERIFICATION-TESTING.md](./PHASE-5-VERIFICATION-TESTING.md)

**What to do:**

1. Run automated verification scripts
2. Manual login testing (all 5 users)
3. Check profile data visibility
4. Test app functionality
5. Generate test report

**Scripts to Create:**

- `verify-storage-migration.ts` - Check images accessible
- `e2e-migration-test.ts` - Comprehensive E2E test

**Manual Tests:**

- [ ] Google OAuth login works
- [ ] Profile data displays correctly
- [ ] Images load properly
- [ ] App features functional

**Commands:**

```bash
# Auth verification
npx tsx scripts/migration/verify-auth-import.ts

# Firestore verification
npx tsx scripts/migration/verify-firestore-migration.ts

# Storage verification
npx tsx scripts/migration/verify-storage-migration.ts

# E2E test
npx tsx scripts/migration/e2e-migration-test.ts
```

---

### **Phase 6: Rollback Plan** 🧊

**Status:** Standby (use if needed)  
**Time:** 30 min - 1 hour  
**Documentation:** [PHASE-6-ROLLBACK-PLAN.md](./PHASE-6-ROLLBACK-PLAN.md)

**When to use:**

- 🔴 Data corruption detected
- 🔴 >50% users cannot login
- 🔴 Critical functionality broken
- 🔴 Data loss confirmed

**Rollback Scripts:**

- `rollback-auth.ts` - Delete migrated Auth users
- `rollback-firestore.ts` - Revert/delete Firestore docs
- `rollback-storage.ts` - Delete copied images

**Rollback Order:**

```bash
# 1. Storage (least destructive)
npx tsx scripts/migration/rollback-storage.ts --confirm

# 2. Firestore (soft first)
npx tsx scripts/migration/rollback-firestore.ts --soft

# 3. Firestore (hard if needed)
npx tsx scripts/migration/rollback-firestore.ts --hard --confirm

# 4. Auth (last resort)
npx tsx scripts/migration/rollback-auth.ts --confirm
```

---

## 📊 Overall Timeline

| Phase     | Duration  | Dependencies | Critical Path |
| --------- | --------- | ------------ | ------------- |
| Phase 1   | 1-2h      | None         | ✅            |
| Phase 2   | 2-3h      | Phase 1      | ✅            |
| Phase 3   | 2-3h      | Phase 2      | ⚠️ Next       |
| Phase 4   | 0.5-1h    | Phase 3      |               |
| Phase 5   | 1-2h      | Phase 3, 4   |               |
| Phase 6   | 0.5-1h    | On-demand    |               |
| **Total** | **7-12h** |              |               |

---

## 🎯 Success Criteria (All Phases)

**Migration is successful if:**

- ✅ 5/5 users authenticated in staging-v2
- ✅ 5/5 users have complete Firestore data
- ✅ All profile images accessible
- ✅ Data schema transformed correctly
- ✅ Migration metadata tracked
- ✅ At least 3 users can login
- ✅ App functionality verified
- ✅ No critical errors
- ✅ Rollback plan tested (dry-run)

---

## 📂 Complete File Structure

```
backend/scripts/migration/
├── README.md                              # This overview
├── ALL-PHASES.md                          # ← You are here
├── MIGRATION-PROGRESS.md                  # Detailed progress
│
├── PHASE-2-AUTH-MIGRATION.md              # Phase 2 docs
├── PHASE-3-QUICK-START.md                 # Phase 3 templates
├── PHASE-4-STORAGE-MIGRATION.md           # Phase 4 guide
├── PHASE-5-VERIFICATION-TESTING.md        # Phase 5 testing
├── PHASE-6-ROLLBACK-PLAN.md               # Phase 6 emergency
│
├── target-users.json                      # Input: 5 emails
├── user-uid-mapping.json                  # Generated: UID map
│
├── auth-export.json                       # Phase 2: Full export
├── auth-export-filtered.json              # Phase 2: 5 users
├── auth-export-no-password-v2.json        # Phase 2: Import file
│
├── check-users-exist.ts                   # ✅ Phase 1
├── filter-auth-export.ts                  # ✅ Phase 2
├── verify-auth-import.ts                  # ✅ Phase 2
├── fix-missing-emails.ts                  # ✅ Phase 2
├── delete-duplicate-account.ts            # ✅ Phase 2
├── cleanup-anonymous-artifacts.ts         # ✅ Phase 2
│
├── user-mapper.ts                         # ⏳ Phase 3 (to create)
├── migrate-users-to-v2.ts                 # ⏳ Phase 3 (to create)
├── verify-firestore-migration.ts          # ⏳ Phase 3 (to create)
│
├── migrate-profile-images.ts              # ⏳ Phase 4 (to create)
│
├── verify-storage-migration.ts            # ⏳ Phase 5 (to create)
├── e2e-migration-test.ts                  # ⏳ Phase 5 (to create)
│
├── rollback-auth.ts                       # 🧊 Phase 6 (to create)
├── rollback-firestore.ts                  # 🧊 Phase 6 (to create)
└── rollback-storage.ts                    # 🧊 Phase 6 (to create)
```

---

## 🚀 Quick Resume Commands

**On this machine:**

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# View progress
cat scripts/migration/ALL-PHASES.md

# Start Phase 3
cat scripts/migration/PHASE-3-QUICK-START.md
```

**On different machine:**

```bash
# 1. Clone repo
git clone <repo-url>
cd nxt1-repo/backend

# 2. Copy .env with credentials

# 3. View progress
cat scripts/migration/ALL-PHASES.md

# 4. Continue from current phase
```

---

## 💡 Key Learnings

**From Phase 2:**

- ❌ Firebase deprecated password hash key access
- ✅ Google OAuth providers preserved successfully
- ✅ UID preservation is critical (achieved)
- ⚠️ Always check for duplicates and anonymous artifacts
- 💡 Firebase Console doesn't always show complete picture

**For Phase 3:**

- Must handle UID mismatches between Auth and Firestore
- Data transformation requires careful mapping
- Dry-run testing essential before apply
- Keep legacy data backup (\_legacy field)

**For Phase 4:**

- gsutil more reliable than Admin SDK for bulk copy
- Need proper permissions on both buckets
- Public URLs vs signed URLs consideration

---

## 📞 Support Resources

**Documentation:**

- Firebase Docs: https://firebase.google.com/docs
- Google Cloud Storage: https://cloud.google.com/storage/docs

**Console Links:**

- Legacy: https://console.firebase.google.com/project/nxt-1-de054
- Staging: https://console.firebase.google.com/project/nxt-1-staging-v2
- Production: https://console.firebase.google.com/project/nxt-1-v2

**Code References:**

- Old Model: `/nxt1/src/app/models/user.ts`
- New Model: `/nxt1-repo/packages/core/src/models/user/`

---

**Last Updated:** April 10, 2026 01:45 AM  
**Status:** Phase 2 complete, ready for Phase 3  
**Next Action:** Create user-mapper.ts and start Firestore migration
