# Phase 4 - Profile Images Migration (Option 2: Copy to New Bucket)

**Copy profile images from legacy Storage to staging-v2 Storage with new URLs**

---

## 🎯 Objective

Copy user profile images from `nxt-1-de054.appspot.com` to
`nxt-1-staging-v2.firebasestorage.app` and update Firestore with new URLs
pointing to staging bucket.

**Result:** Complete independence from legacy storage - staging uses its own
bucket.

---

## 📋 Prerequisites

- ✅ **Phase 2 complete** - Users imported to staging Auth
- ✅ **Phase 3 complete** - Firestore users migrated (if doing Firestore first)
  - OR run Phase 4 standalone if only migrating storage
- ✅ **gsutil CLI installed** - Google Cloud SDK
- ✅ **Authenticated** - Access to both legacy and staging buckets
- ✅ **Environment variables** - `.env` configured with storage bucket names

### **Add to .env if not present:**

```bash
# Legacy Storage
LEGACY_FIREBASE_STORAGE_BUCKET=nxt-1-de054.appspot.com

# Staging Storage
STAGING_FIREBASE_STORAGE_BUCKET=nxt-1-staging-v2.firebasestorage.app
```

---

## 🛠️ Tools Required

### **1. Install Google Cloud SDK (if not installed)**

```bash
# Check if installed
which gsutil

# If not installed:
# macOS
brew install --cask google-cloud-sdk

# Or download from:
# https://cloud.google.com/sdk/docs/install
```

### **2. Authenticate**

```bash
# Authenticate with Google account
gcloud auth login

# Set default project
gcloud config set project nxt-1-de054

# Verify access to both buckets
gsutil ls gs://nxt-1-de054.appspot.com/
gsutil ls gs://nxt-1-staging-v2.firebasestorage.app/
```

---

## 📝 Implementation

### **Scripts Created:**

1. **`migrate-profile-images.ts`** - Main migration script
   - Reads user images from legacy Firestore
   - Copies files using `gsutil` to staging bucket
   - Updates Firestore with new URLs
   - Supports `--dry-run` and `--apply` modes

2. **`verify-image-migration.ts`** - Verification script
   - Checks all user images in staging
   - Verifies URLs point to staging bucket
   - Tests image accessibility via HTTP
   - Reports broken links

### **Key Features:**

- ✅ Preserves file structure (same paths in new bucket)
- ✅ Handles both `profileImg` (old) and `profileImgs[]` (new) schemas
- ✅ Supports dry-run mode for safety
- ✅ Makes files publicly accessible
- ✅ Updates Firestore with new URLs
- ✅ Tracks migration metadata (`_imagesUpdatedAt`, `_imagesMigratedFrom`)

---

## 🚀 Execution Steps

### **Step 1: Verify gsutil access**

```bash
# Check both buckets are accessible
gsutil ls gs://nxt-1-de054.appspot.com/ | head -5
gsutil ls gs://nxt-1-staging-v2.firebasestorage.app/
```

### **Step 2: Run dry-run first**

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# Dry-run: show what would be copied (no changes made)
npx tsx scripts/migration/migrate-profile-images.ts --dry-run
```

Review output to ensure paths look correct.

### **Step 3: Apply migration**

```bash
# Actual migration: copy files and update Firestore
npx tsx scripts/migration/migrate-profile-images.ts --apply
```

**Expected output:**

```
🖼️  PHASE 4: PROFILE IMAGES MIGRATION - 🔥 APPLY

📋 Target users: 6

📸 Processing: john@nxt1sports.com
   UID: p8OiVVIknKhgncxVahKeRs8HzD63
   Found 2 image(s) to migrate

   🔗 Original: https://firebasestorage.googleapis.com/.../nxt-1-de054.appspot.com/...
   📁 File path: users/p8OiV.../profile.jpg
   📤 Copying: users/p8OiV.../profile.jpg...
   ✅ Copied successfully
   🔗 New URL: https://firebasestorage.googleapis.com/.../nxt-1-staging-v2.firebasestorage.app/...

   📝 Updating Firestore with 2 new URL(s)...
   ✅ Firestore updated
   ✅ User complete: 2/2 images copied

...

📊 MIGRATION SUMMARY - 🔥 APPLY

👥 Users:
   ✅ Success: 4
   ❌ Failed: 0
   ℹ️  No images: 2
   📝 Total: 6

🖼️  Images:
   ✅ Copied: 8
```

### **Step 4: Verify migration**

```bash
# Verify all images copied and accessible
npx tsx scripts/migration/verify-image-migration.ts
```

**Expected output:**

```
🔍 VERIFYING IMAGE MIGRATION

📋 Checking 6 users...

📸 john@nxt1sports.com
   UID: p8OiVVIknKhgncxVahKeRs8HzD63
   Found 2 image(s) in Firestore

   Image 1:
      URL: https://firebasestorage.googleapis.com/.../nxt-1-staging-v2.firebasestorage.app/...
      Bucket: ✅ STAGING
      Status: ✅ 200 - Image accessible

   Image 2:
      URL: https://firebasestorage.googleapis.com/.../nxt-1-staging-v2.firebasestorage.app/...
      Bucket: ✅ STAGING
      Status: ✅ 200 - Image accessible

...

📊 VERIFICATION SUMMARY

👥 Users:
   ✅ With images: 4
   ℹ️  Without images: 2
   📝 Total: 6

🖼️  Images:
   ✅ Working: 8/8
   ❌ Broken: 0/8

✅ All images verified and working!
```

---

## 🔍 Additional Verification

### **Check in Firebase Console:**

1. Open Storage:
   https://console.firebase.google.com/project/nxt-1-staging-v2/storage
2. Navigate to `users/{uid}/` folders
3. Verify files exist and match legacy bucket structure

### **Check in staging app:**

1. Login with migrated user (e.g., `john@nxt1sports.com`)
2. Navigate to profile page
3. Verify profile images display correctly
4. Open browser DevTools → Network tab
5. Confirm image URLs point to `nxt-1-staging-v2.firebasestorage.app`

### **Manual gsutil checks:**

```bash
# List user-specific folders in staging
gsutil ls -r gs://nxt-1-staging-v2.firebasestorage.app/users/ | grep -E "jpg|png|jpeg"

# Compare file counts between buckets
echo "Legacy files:"
gsutil ls -r gs://nxt-1-de054.appspot.com/users/ | grep -E "jpg|png|jpeg" | wc -l

echo "Staging files:"
gsutil ls -r gs://nxt-1-staging-v2.firebasestorage.app/users/ | grep -E "jpg|png|jpeg" | wc -l
```

---

## ⚠️ Important Notes

### **Storage Bucket Naming**

- **Legacy:** `nxt-1-de054.appspot.com` (old project default bucket)
- **Staging:** `nxt-1-staging-v2.firebasestorage.app` (new bucket format)

Firebase automatically creates buckets in format
`{project-id}.firebasestorage.app` for newer projects.

### **Phase Dependencies**

You can run Phase 4 in two ways:

**Option A: After Phase 3 (Recommended)**

```
Phase 2 (Auth) → Phase 3 (Firestore) → Phase 4 (Storage)
```

- Firestore already has `profileImgs[]` from Phase 3
- Phase 4 copies files and updates URLs

**Option B: Standalone (Phase 3 not done yet)**

```
Phase 2 (Auth) → Phase 4 (Storage)
```

- Script reads images from **legacy Firestore**
- Copies to staging bucket
- **Does not update Firestore** (since Phase 3 not done)
- Phase 3 will handle Firestore migration later

### **File Paths Preservation**

Images maintain same path structure:

```
Legacy:  gs://nxt-1-de054.appspot.com/users/{uid}/profile.jpg
            ↓
Staging: gs://nxt-1-staging-v2.firebasestorage.app/users/{uid}/profile.jpg
                                                  └─ Same path ─┘
```

### **URL Format Changes**

```
Old URL (legacy):
https://firebasestorage.googleapis.com/v0/b/nxt-1-de054.appspot.com/o/users%2F{uid}%2Fprofile.jpg?alt=media

New URL (staging):
https://firebasestorage.googleapis.com/v0/b/nxt-1-staging-v2.firebasestorage.app/o/users%2F{uid}%2Fprofile.jpg?alt=media
                                         └───────────────────────────┘
                                              Only bucket changes
```

### **File Permissions**

After copying, files are made public via:

```typescript
await file.makePublic();
```

Or rely on Storage Security Rules:

```javascript
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read: if true; // Public read
      allow write: if request.auth.uid == userId;
    }
  }
}
```

### **Cost Considerations**

- ✅ **Intra-region copies:** FREE (both buckets in same region)
- ⚠️ **Cross-region copies:** Egress charges may apply
- ℹ️ **Storage cost:** Duplicates storage cost temporarily

Check bucket regions:

```bash
gsutil ls -L -b gs://nxt-1-de054.appspot.com/ | grep location
gsutil ls -L -b gs://nxt-1-staging-v2.firebasestorage.app/ | grep location
```

### **Rollback Plan**

If migration fails or images broken:

#### **Option 1: Delete copied files (start over)**

```bash
# Delete all user images from staging bucket
gsutil -m rm -r gs://nxt-1-staging-v2.firebasestorage.app/users/

# Then re-run migration
npx tsx scripts/migration/migrate-profile-images.ts --apply
```

#### **Option 2: Revert Firestore URLs to legacy bucket**

If Phase 3 already ran and you want to use legacy bucket again:

```typescript
// Create: scripts/migration/revert-image-urls.ts
import { getFirestore } from 'firebase-admin/firestore';

const stagingDb = getFirestore(stagingApp);
const users = await stagingDb.collection('users').get();

for (const doc of users.docs) {
  const data = doc.data();
  if (data._legacy?.profileImg) {
    // Revert to legacy URLs
    await doc.ref.update({
      profileImgs: [data._legacy.profileImg],
      _imagesRevertedAt: new Date(),
    });
  }
}
```

#### **Option 3: Keep both (hybrid approach)**

Configure CORS on legacy bucket to allow staging app to access old images:

```bash
# See: PHASE-4-OPTION-1-KEEP-OLD-LINKS.md
gsutil cors set cors-config.json gs://nxt-1-de054.appspot.com
```

Then Phase 3 can write legacy URLs to staging Firestore - no file copying
needed.

---

## ✅ Success Criteria

After successful migration, verify:

- [ ] **Files copied:** All profile images exist in staging bucket

  ```bash
  gsutil ls -r gs://nxt-1-staging-v2.firebasestorage.app/users/
  ```

- [ ] **Firestore updated:** URLs point to staging bucket

  ```
  profileImgs: ["https://.../nxt-1-staging-v2.firebasestorage.app/..."]
  ```

- [ ] **Images accessible:** HTTP 200 response when accessing URLs

  ```bash
  curl -I "https://firebasestorage.googleapis.com/.../nxt-1-staging-v2.firebasestorage.app/..."
  # Should return: HTTP/2 200
  ```

- [ ] **App displays images:** Login to staging app and view profile - images
      load correctly

- [ ] **No legacy references:** Check Firestore - no URLs point to
      `nxt-1-de054.appspot.com`

---

## 📊 Migration Summary

**What this phase does:**

```
┌─────────────────────────────────────────────────────────────┐
│                  PHASE 4: STORAGE MIGRATION                 │
└─────────────────────────────────────────────────────────────┘

1. READ legacy Firestore (nxt-1-de054)
   └─ Extract profileImg URLs

2. PARSE URLs to get file paths
   └─ Example: users/p8OiVV.../profile.jpg

3. COPY files using gsutil
   ├─ Source: gs://nxt-1-de054.appspot.com/users/...
   └─ Dest:   gs://nxt-1-staging-v2.firebasestorage.app/users/...

4. GENERATE new URLs
   └─ https://.../nxt-1-staging-v2.firebasestorage.app/...

5. UPDATE staging Firestore
   ├─ profileImgs: [new URLs]
   ├─ _imagesUpdatedAt: timestamp
   └─ _imagesMigratedFrom: "nxt-1-de054"

RESULT:
✅ Staging app uses its own storage bucket
✅ Complete independence from legacy
✅ Safe to decommission legacy storage later
```

**For 6 canary users:**

- Estimated images: ~10-15 files (varies by user)
- Time: 5-10 minutes
- Storage cost: Minimal (few MB duplicated)

**For full production (4,843 users):**

- Estimated images: ~5,000-10,000 files
- Time: 30-60 minutes
- Storage cost: Review with `gsutil du -sh gs://nxt-1-de054.appspot.com/users/`

---

**Estimated Time:** 10-15 minutes for 6 users  
**Prerequisites:** Phase 2 complete, gsutil installed  
**Optional:** Phase 3 complete (recommended but not required)  
**Next Phase:** Phase 5 - Verification & Testing
