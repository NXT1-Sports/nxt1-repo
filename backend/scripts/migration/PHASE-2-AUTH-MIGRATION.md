# Phase 2: Firebase Authentication Migration

## Prerequisites

1. **Install Firebase CLI** (if not already installed):

```bash
npm install -g firebase-tools
```

2. **Login to Firebase:**

```bash
firebase login
```

3. **Verify access to both projects:**

```bash
# Check legacy production
firebase projects:list | grep nxt-1-de054

# Check staging v2
firebase projects:list | grep nxt-1-staging-v2
```

---

## Step 5: Export Auth Users from Legacy Production

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend/scripts/migration

# Export ALL users from legacy production
firebase auth:export auth-export.json \
  --project nxt-1-de054 \
  --format=json

# This will create auth-export.json with ALL auth users + password hashes
```

**Expected output:**

- File: `auth-export.json`
- Contains: All auth users with password hashes (SCRYPT)
- Size: Several KB to MB depending on user count

**Important:** Do NOT commit this file to Git! It contains sensitive password
hashes.

---

## Step 6: Filter Auth Export (Target Users Only)

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# Run filter script
npx tsx scripts/migration/filter-auth-export.ts
```

**This script will:**

- Read `auth-export.json` (all users)
- Filter to only our 5 target users
- Output: `auth-export-filtered.json` (ready for import)

**Expected output:**

```
🎯 Target users for auth migration:
   Emails: 5
   UIDs with Auth: 5
   1. john@nxt1sports.com → p8OiVVIknKhgncxVahKeRs8HzD63
   2. ngocsonxx98@gmail.com → aQCDuA3XYdcJdLt6wpzpxWgeHge2
   3. sonngoc.dev@gmail.com → evIdVndqrIPCVUjFyKZyc5WTQeA3
   4. web.developer.gz@gmail.com → pXBew7UKMPPuMvpX8HBDZaqjvIA3
   5. superadmin@nxt1sports.com → 8bFPSc7LY6VoAL6kEDO6pEha8yE2

✅ Filtered users: 5/5
💾 Filtered export saved to: auth-export-filtered.json
```

---

## Step 7: Import Auth Users to Staging V2

**⚠️ IMPORTANT:** Check the `auth-export.json` file for hash parameters first:

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend/scripts/migration

# Look for passwordHashInfo in auth-export.json
grep -A 10 '"passwordHashInfo"' auth-export.json
```

You'll see something like:

```json
"passwordHashInfo": {
  "hashAlgorithm": "SCRYPT",
  "saltSeparator": "...",
  "rounds": 8,
  "memoryCost": 14
}
```

**Then import with correct hash parameters:**

```bash
firebase auth:import auth-export-filtered.json \
  --project nxt-1-staging-v2 \
  --hash-algo=SCRYPT \
  --rounds=8 \
  --mem-cost=14 \
  --hash-input-order=SALT_FIRST
```

**Expected output:**

```
Processing auth-export-filtered.json...
✔ Imported 5 accounts successfully.
✔ 0 accounts failed to import.
```

**If you get hash parameter errors:**

- Double-check the `passwordHashInfo` in `auth-export.json`
- Adjust `--rounds` and `--mem-cost` to match
- See: https://firebase.google.com/docs/cli/auth#import_users

---

## Step 8: Verify Auth Import

### Manual Verification (Firebase Console)

1. Open:
   https://console.firebase.google.com/project/nxt-1-staging-v2/authentication/users
2. Check that 5 users are present:
   - john@nxt1sports.com
   - ngocsonxx98@gmail.com
   - sonngoc.dev@gmail.com (might show UID only, no email)
   - web.developer.gz@gmail.com (might show UID only, no email)
   - superadmin@nxt1sports.com

### Automated Verification (Script)

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# Run verification script (will create this next)
npx tsx scripts/migration/verify-auth-import.ts
```

---

## Troubleshooting

### Issue: "Permission denied"

**Solution:** Make sure you're logged in with correct account:

```bash
firebase login --reauth
```

### Issue: "Hash algorithm mismatch"

**Solution:** Check `passwordHashInfo` in `auth-export.json` and use exact
parameters.

### Issue: "User already exists"

**Solution:** This is OK for testing! Firebase will skip existing users. If you
want to overwrite:

```bash
# Delete users from staging-v2 first (via Console or Admin SDK)
# Then re-run import
```

### Issue: "Some users missing email"

**Solution:** For `sonngoc.dev@gmail.com` and `web.developer.gz@gmail.com`:

- Auth records exist but email field is null
- They'll import with UID only
- Need to update email manually after import using Admin SDK

---

## Security Notes

- ✅ `auth-export.json` and `auth-export-filtered.json` contain password hashes
- ✅ These files are in `.gitignore`
- ✅ **DELETE** these files after migration completes
- ✅ Never commit or share these files

---

## Next Steps

After successful import, proceed to:

- **Phase 3:** Firestore Users Collection Migration (with data transformation)
