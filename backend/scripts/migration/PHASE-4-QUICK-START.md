# 🚀 Phase 4 Quick Start - Storage Migration

**Copy profile images to new bucket with new URLs**

---

## ⚡ Quick Commands

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend

# 1. Check gsutil installed
which gsutil
# If not found: brew install --cask google-cloud-sdk

# 2. Authenticate
gcloud auth login

# 3. Verify bucket access
gsutil ls gs://nxt-1-de054.appspot.com/ | head -5
gsutil ls gs://nxt-1-staging-v2.firebasestorage.app/

# 4. Dry-run first (safe - no changes)
npx tsx scripts/migration/migrate-profile-images.ts --dry-run

# 5. Review output, then apply
npx tsx scripts/migration/migrate-profile-images.ts --apply

# 6. Verify migration
npx tsx scripts/migration/verify-image-migration.ts
```

---

## ✅ Expected Results

**Dry-run output:**

```
🖼️  PHASE 4: PROFILE IMAGES MIGRATION - 🔍 DRY-RUN

📋 Target users: 6

📸 Processing: john@nxt1sports.com
   Found 2 image(s) to migrate
   🔍 Would copy: gs://nxt-1-de054.appspot.com/users/p8OiV.../profile.jpg
                → gs://nxt-1-staging-v2.firebasestorage.app/users/p8OiV.../profile.jpg

📊 MIGRATION SUMMARY
   ✅ Success: 4
   ℹ️  No images: 2 (users without profile pics)
```

**Apply output:**

```
🖼️  PHASE 4: PROFILE IMAGES MIGRATION - 🔥 APPLY

📸 Processing: john@nxt1sports.com
   📤 Copying: users/p8OiV.../profile.jpg...
   ✅ Copied successfully
   🔗 New URL: https://firebasestorage.googleapis.com/.../nxt-1-staging-v2.firebasestorage.app/...
   📝 Updating Firestore with 2 new URL(s)...
   ✅ Firestore updated

📊 IMAGES:
   ✅ Copied: 8
```

**Verification output:**

```
🔍 VERIFYING IMAGE MIGRATION

📸 john@nxt1sports.com
   Image 1:
      Bucket: ✅ STAGING
      Status: ✅ 200 - Image accessible

📊 VERIFICATION SUMMARY
   🖼️  Images:
      ✅ Working: 8/8
```

---

## 🔍 Troubleshooting

### **Issue: "gsutil: command not found"**

Install Google Cloud SDK:

```bash
brew install --cask google-cloud-sdk
```

### **Issue: "Access denied to bucket"**

Authenticate:

```bash
gcloud auth login
gcloud config set project nxt-1-de054
```

### **Issue: "File not found" during copy**

Verify file exists in legacy bucket:

```bash
gsutil ls gs://nxt-1-de054.appspot.com/users/{uid}/
```

### **Issue: Images return 403 Forbidden**

Make files public:

```bash
# For all user files
gsutil -m acl ch -u AllUsers:R gs://nxt-1-staging-v2.firebasestorage.app/users/**

# Or update Storage Rules to allow public read
```

### **Issue: Some users have no images**

This is normal! Not all users have profile pictures. Check output:

```
ℹ️  No images: 2
```

---

## 📝 Next Steps After Migration

1. **Test in staging app:**
   - Login with migrated user
   - View profile page
   - Confirm images display

2. **Check Firestore:**

   ```
   Firebase Console → Firestore → users/{uid}
   profileImgs: ["https://.../nxt-1-staging-v2.firebasestorage.app/..."]
   ```

3. **Proceed to Phase 5:**
   ```bash
   cat scripts/migration/PHASE-5-VERIFICATION-TESTING.md
   ```

---

## 🎯 What Gets Migrated

- ✅ Profile images (`profileImg` from legacy)
- ✅ Multiple images (`profileImgs[]` if already array)
- ✅ Firestore URLs updated to point to staging bucket
- ✅ Same file paths preserved in new bucket
- ✅ Metadata tracking (`_imagesUpdatedAt`, `_imagesMigratedFrom`)

---

## 📊 Current Status

**6 users to migrate:**

- john@nxt1sports.com
- ngocsonxx98@gmail.com
- sonngoc.dev@gmail.com
- web.developer.gz@gmail.com
- superadmin@nxt1sports.com
- devtest@test.com

**Expected:**

- ~8-12 images total (varies by user)
- ~5-10 minutes to complete
- Minimal storage cost (<1MB)

---

**Last Updated:** April 12, 2026  
**Status:** Ready to execute  
**Documentation:** [PHASE-4-STORAGE-MIGRATION.md](./PHASE-4-STORAGE-MIGRATION.md)
