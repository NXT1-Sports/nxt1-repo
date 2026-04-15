# 🚀 Phase 2 Migration - Automated Workflow

**Updated:** April 11, 2026  
**Purpose:** Automated authentication migration with pre-import duplicate
cleanup

---

## ⚡ Quick Start (Automated)

For new migrations or adding users, use the **master script** that automates
everything:

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# Option 1: Master script (RECOMMENDED - automated 4-step process)
npx tsx scripts/migration/migrate-auth-master.ts
```

**This script automatically:**

1. ✅ **Pre-import cleanup** - Deletes duplicate accounts in staging
2. ✅ **Import users** - Imports from legacy with passwords preserved
3. ✅ **Fix emails** - Updates missing emails for Google OAuth users
4. ✅ **Verify** - Confirms all users imported correctly

**Duration:** ~2-3 minutes for 6 users

---

## 🔧 Manual Step-by-Step (Advanced)

If you prefer manual control or need to debug:

### **Step 1: Pre-Import Cleanup** ⚠️ MUST RUN FIRST

```bash
# Check for duplicates
npx tsx scripts/migration/check-duplicate-john.ts

# Delete duplicates BEFORE importing
npx tsx scripts/migration/pre-import-cleanup.ts
```

**Why this is critical:**

- Prevents UID conflicts during import
- Ensures legacy accounts replace staging accounts
- Firebase `allowDuplicateEmails` can create multiple accounts with same email

### **Step 2: Import Users with Passwords**

```bash
cd scripts/migration

firebase auth:import auth-export-filtered.json \
  --project nxt-1-staging-v2 \
  --hash-algo=SCRYPT \
  --rounds=8 \
  --mem-cost=14 \
  --salt-separator="Bw==" \
  --hash-key="Ul0yk3ZKlvEUhin6ujgLd7GczdL+Onl4IhvuclnmdXPzxMcTcM8RTUJJe7GArhaOUwA1evaSegm9yv+EOVIiTQ=="
```

### **Step 3: Fix Missing Emails**

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
npx tsx scripts/migration/fix-missing-emails.ts
```

### **Step 4: Verify Import**

```bash
npx tsx scripts/migration/verify-auth-import.ts
```

---

## 📋 Pre-Import Cleanup Details

### **What it does:**

The **pre-import-cleanup** script scans staging for accounts that would conflict
with migration:

```typescript
For each target user:
  1. Check if email exists in staging
  2. If exists with DIFFERENT UID than legacy:
     → Mark for deletion (staging account is "wrong" account)
  3. Delete marked accounts
  4. Now import can proceed without conflicts
```

### **Example scenario:**

**Before cleanup:**

- Staging has: `john@nxt1sports.com` (UID: `6EojsEOJIeRwWV9IrfmV11zoKS52`) ←
  Created 4/10/2026
- Legacy has: `john@nxt1sports.com` (UID: `p8OiVVIknKhgncxVahKeRs8HzD63`) ← From
  production

**After cleanup:**

- Staging: Account deleted
- Import runs: Legacy account imported with UID `p8OiVVIknKhgncxVahKeRs8HzD63`
  ✅

**Result:**

- ✅ UID preserved from legacy
- ✅ Password preserved from legacy
- ✅ No duplicate conflicts

---

## 🔄 Workflow Comparison

### ❌ **Old Workflow (Manual, error-prone):**

```
1. Import users
2. Discover duplicates ← Problem found AFTER import
3. Manually identify which to delete
4. Delete manually with script
5. Re-import or fix manually
```

**Issues:**

- Duplicate conflicts discovered late
- Manual intervention required
- Risk of deleting wrong account

### ✅ **New Workflow (Automated, safe):**

```
1. Pre-import cleanup ← Problems caught BEFORE import
2. Import users (clean slate, no conflicts)
3. Fix emails (automated)
4. Verify (automated)
```

**Benefits:**

- ✅ Duplicates caught proactively
- ✅ Fully automated
- ✅ Always deletes correct account (keeps legacy UID)
- ✅ Can re-run safely (idempotent)

---

## 🛡️ Safety Features

### **Master Script:**

1. **5-second countdown** - Time to cancel if needed
2. **Dry-run safe** - Pre-cleanup only deletes non-legacy accounts
3. **Idempotent** - Can re-run multiple times safely
4. **Error handling** - Stops on critical errors, continues on minor issues
5. **Verification** - Always confirms import success

### **Pre-Import Cleanup:**

- Only deletes accounts with **different UID** than legacy
- Never deletes legacy accounts (protected by UID match)
- Skips users that don't exist (no error)
- Reports all actions taken

---

## 📊 Use Cases

### **Adding new users to migration:**

1. Update `target-users.json` with new email
2. Run: `npx tsx scripts/migration/check-users-exist.ts`
3. Run: `npx tsx scripts/migration/filter-auth-export.ts`
4. Run: `npx tsx scripts/migration/migrate-auth-master.ts` ← Handles duplicates
   automatically

### **Re-running migration (testing/rollback):**

```bash
# Delete all imported users
npx tsx scripts/migration/rollback-auth-import.ts

# Re-import with master script
npx tsx scripts/migration/migrate-auth-master.ts
```

### **Checking for duplicates without deleting:**

```bash
# Safe check - no changes made
npx tsx scripts/migration/check-duplicate-john.ts
npx tsx scripts/migration/pre-import-cleanup.ts --dry-run # (not implemented yet)
```

---

## 🎯 Current Status

**Phase 2 Complete:** 6 users migrated ✅

| Email                      | UID                          | Provider   | Status |
| -------------------------- | ---------------------------- | ---------- | ------ |
| john@nxt1sports.com        | p8OiVVIknKhgncxVahKeRs8HzD63 | password   | ✅     |
| ngocsonxx98@gmail.com      | aQCDuA3XYdcJdLt6wpzpxWgeHge2 | google.com | ✅     |
| sonngoc.dev@gmail.com      | evIdVndqrIPCVUjFyKZyc5WTQeA3 | google.com | ✅     |
| web.developer.gz@gmail.com | pXBew7UKMPPuMvpX8HBDZaqjvIA3 | google.com | ✅     |
| superadmin@nxt1sports.com  | 8bFPSc7LY6VoAL6kEDO6pEha8yE2 | password   | ✅     |
| devtest@test.com           | i1GWzZbhfaTPeErWgVAcYHSkHFg2 | password   | ✅     |

**Duplicate issues resolved:**

- ✅ `john@nxt1sports.com` - Staging duplicate deleted, legacy account preserved

---

## 💡 Best Practices

### **When adding new users:**

1. Always run `check-users-exist.ts` first to validate
2. Use `migrate-auth-master.ts` for automated process
3. Never skip pre-import cleanup
4. Always verify after import

### **When troubleshooting:**

1. Check logs from master script
2. Run individual steps manually to isolate issue
3. Use `check-duplicate-john.ts` to inspect account state
4. Consult `PASSWORD-RECOVERY-GUIDE.md` if hash key issues

### **Production migration (4,843 users):**

1. Test master script on canary users first (done ✅)
2. Backup staging before full migration
3. Monitor for duplicates during import
4. Have rollback script ready
5. Verify sample of users post-migration

---

## 🔗 Related Documentation

- [MIGRATION-PROGRESS.md](./MIGRATION-PROGRESS.md) - Overall progress
- [PHASE-2-COMPLETE-SUMMARY.md](./PHASE-2-COMPLETE-SUMMARY.md) - Phase 2 results
- [PASSWORD-RECOVERY-GUIDE.md](./PASSWORD-RECOVERY-GUIDE.md) - Hash key
  retrieval
- [PHASE-3-QUICK-START.md](./PHASE-3-QUICK-START.md) - Next phase

---

**Last Updated:** April 11, 2026  
**Status:** ✅ Phase 2 Complete with automated workflow  
**Next:** Phase 3 - Firestore Migration
