# 🎴 Migration Quick Reference Card

**One-page cheat sheet for NXT1 migration**

---

## 🎯 Current Status

```
✅ Phase 1: Setup              (100%)
✅ Phase 2: Authentication      (100%)  ← We are here
⏳ Phase 3: Firestore          (0%)    ← Next
⏳ Phase 4: Storage            (0%)
⏳ Phase 5: Verification       (0%)
🧊 Phase 6: Rollback           (Standby)
```

---

## 📁 Important Files

| File                     | Purpose           | Location                         |
| ------------------------ | ----------------- | -------------------------------- |
| `ALL-PHASES.md`          | Complete roadmap  | [Open](./ALL-PHASES.md)          |
| `MIGRATION-PROGRESS.md`  | Detailed progress | [Open](./MIGRATION-PROGRESS.md)  |
| `PHASE-3-QUICK-START.md` | Next phase guide  | [Open](./PHASE-3-QUICK-START.md) |
| `target-users.json`      | 5 target emails   | [Open](./target-users.json)      |
| `user-uid-mapping.json`  | UID mapping       | [Open](./user-uid-mapping.json)  |

---

## ⌨️ Essential Commands

### **Navigation**

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
```

### **Check Status**

```bash
# Verify Auth (Phase 2)
npx tsx scripts/migration/verify-auth-import.ts

# View progress
cat scripts/migration/ALL-PHASES.md
```

### **Phase 3 - Next Steps**

```bash
# 1. View templates
cat scripts/migration/PHASE-3-QUICK-START.md

# 2. Create scripts (copy templates)
touch scripts/migration/user-mapper.ts
touch scripts/migration/migrate-users-to-v2.ts
touch scripts/migration/verify-firestore-migration.ts

# 3. Test
npx tsx scripts/migration/migrate-users-to-v2.ts --dry-run

# 4. Apply
npx tsx scripts/migration/migrate-users-to-v2.ts --apply

# 5. Verify
npx tsx scripts/migration/verify-firestore-migration.ts
```

---

## 🔑 Environment Variables

**Location:** `/Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend/.env`

**Required:**

- `LEGACY_FIREBASE_PROJECT_ID=nxt-1-de054`
- `STAGING_FIREBASE_PROJECT_ID=nxt-1-staging-v2`
- Plus CLIENT_EMAIL, PRIVATE_KEY, STORAGE_BUCKET for each

---

## 👥 Migrated Users (5)

| Email                      | UID (first 8 chars) | Login Method             |
| -------------------------- | ------------------- | ------------------------ |
| john@nxt1sports.com        | p8OiVVIk            | Google OAuth ✅          |
| ngocsonxx98@gmail.com      | aQCDuA3X            | Google OAuth ✅          |
| sonngoc.dev@gmail.com      | evIdVndq            | Google OAuth ✅          |
| web.developer.gz@gmail.com | pXBew7UK            | Google OAuth ✅          |
| superadmin@nxt1sports.com  | 8bFPSc7L            | ⚠️ Password reset needed |

---

## 🌐 Firebase Console Links

**Legacy (Source):**

- Auth:
  https://console.firebase.google.com/project/nxt-1-de054/authentication/users
- Firestore: https://console.firebase.google.com/project/nxt-1-de054/firestore

**Staging (Destination):**

- Auth:
  https://console.firebase.google.com/project/nxt-1-staging-v2/authentication/users
- Firestore:
  https://console.firebase.google.com/project/nxt-1-staging-v2/firestore/data/~2Fusers

---

## 🎯 Data Transformations (Phase 3)

```
Old Schema → New Schema:

profileImg (string)           → profileImgs[] (array)
primarySport + secondarySport → sports[] (unified)
academicInfo                  → athlete.academics
classOf.year                  → athlete.classOf

+ Add: _schemaVersion, _migratedAt, _sourceProject, _legacy
```

---

## ⚡ Quick Troubleshooting

**Problem:** "Module not found"

```bash
npm install           # Re-install dependencies
```

**Problem:** "Cannot connect to Firebase"

```bash
cat .env | grep FIREBASE_PROJECT_ID    # Check env vars
firebase login --reauth                # Re-authenticate
```

**Problem:** "Permission denied"

```bash
firebase projects:list                 # Check access
gcloud auth login                      # For Storage/gsutil
```

**Problem:** "TypeError: Cannot read properties of undefined"

```bash
# Check imports at top of script
# Use: import { cert } from 'firebase-admin/app'
# Not: import * as admin from 'firebase-admin'
```

---

## 📞 Where to Find Help

1. **Full Details:** [ALL-PHASES.md](./ALL-PHASES.md)
2. **Current Progress:** [MIGRATION-PROGRESS.md](./MIGRATION-PROGRESS.md)
3. **Next Phase:** [PHASE-3-QUICK-START.md](./PHASE-3-QUICK-START.md)
4. **Rollback:** [PHASE-6-ROLLBACK-PLAN.md](./PHASE-6-ROLLBACK-PLAN.md)

---

## 💾 Backup Locations

**Scripts:**
`/Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend/scripts/migration/`

**Configs:** `/Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend/.env`

**Auth Export:** `auth-export.json` (1.6MB), `auth-export-filtered.json` (2.7KB)

---

## ⏱️ Estimated Time Remaining

- Phase 3: 2-3 hours
- Phase 4: 30 min - 1 hour
- Phase 5: 1-2 hours
- **Total:** 3.5 - 6 hours

---

## ✅ Phase 2 Achievements

- ✅ 5/5 users migrated
- ✅ UIDs preserved
- ✅ Emails verified
- ✅ Google OAuth working
- ✅ Duplicates cleaned
- ⚠️ 2 users need password reset (acceptable trade-off)

---

## 🎯 Next Immediate Actions

1. ✅ Read [PHASE-3-QUICK-START.md](./PHASE-3-QUICK-START.md)
2. ✅ Create `user-mapper.ts` (copy template)
3. ✅ Create `migrate-users-to-v2.ts` (copy template)
4. ✅ Create `verify-firestore-migration.ts` (copy template)
5. ✅ Run dry-run test
6. ✅ Execute migration
7. ✅ Verify results

---

**Print this card or save for easy reference! 📌**

**Last Updated:** April 10, 2026
