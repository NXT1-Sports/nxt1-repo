# Phase 4 - Option 1: Keep Old Storage Links

**Simple approach: Let staging app access legacy storage bucket directly**

---

## 🎯 Objective

Configure staging app to access profile images from legacy storage bucket
without copying files.

**Result:** Firestore docs in staging will reference images from legacy bucket.

---

## ✅ Advantages

- ✅ No file copying needed
- ✅ Zero storage duplication cost
- ✅ Instant - no migration time
- ✅ Perfect for canary testing (6 users)
- ✅ Legacy links continue working during migration

---

## ⚠️ When NOT to use

- ❌ Production full migration (4,843 users) - should use Option 2
- ❌ Decommissioning legacy project immediately
- ❌ Need complete independence from legacy
- ❌ Compliance requires data in specific bucket

---

## 🛠️ Setup Steps

### **Step 1: Configure CORS on Legacy Bucket**

Allow staging app to access legacy storage:

```bash
# Create CORS config file
cat > /tmp/cors-config.json << 'EOF'
[
  {
    "origin": [
      "https://nxt-1-staging-v2.web.app",
      "https://nxt-1-staging-v2.firebaseapp.com",
      "http://localhost:4200",
      "http://localhost:4201"
    ],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
EOF

# Apply to legacy bucket
gsutil cors set /tmp/cors-config.json gs://nxt-1-de054.appspot.com
```

### **Step 2: Verify CORS Applied**

```bash
gsutil cors get gs://nxt-1-de054.appspot.com
```

### **Step 3: Test Image Access**

Open browser and test if staging app can load images:

```
https://firebasestorage.googleapis.com/v0/b/nxt-1-de054.appspot.com/o/users%2F{uid}%2Fprofile.jpg?alt=media
```

### **Step 4: Update Firestore (if needed)**

If Firestore migration **already ran** and converted `profileImg` →
`profileImgs[]`, the URLs are already correct. No changes needed!

```typescript
// Firestore doc in staging already has:
{
  profileImgs: [
    "https://firebasestorage.googleapis.com/v0/b/nxt-1-de054.appspot.com/o/users%2F...",
    // ↑ These URLs point to legacy bucket - that's OK!
  ],
  _migratedAt: "2026-04-12T...",
  _sourceProject: "nxt-1-de054"
}
```

---

## 🔍 Verification

### **Check images load in staging app:**

1. Login to staging app with migrated user
2. View profile page
3. Confirm profile images display correctly

### **Check Network tab:**

```
Request URL: https://firebasestorage.googleapis.com/.../nxt-1-de054.appspot.com/...
Status: 200 OK
CORS headers present: ✓
```

---

## 📊 Summary

**Firestore Migration (Phase 3):**

```typescript
// Legacy Firestore (nxt-1-de054)
{
  profileImg: "https://.../nxt-1-de054.appspot.com/users/abc/img1.jpg"
}

// ↓ Transform during migration ↓

// Staging Firestore (nxt-1-staging-v2)
{
  profileImgs: [
    "https://.../nxt-1-de054.appspot.com/users/abc/img1.jpg" // Same URL!
  ],
  _legacy: {
    profileImg: "..." // Backup
  }
}
```

**Storage:**

- ✅ Files stay in `nxt-1-de054.appspot.com`
- ✅ CORS allows staging app to access
- ✅ No file copying needed
- ✅ Works immediately

---

## 🔐 Security Considerations

### **Read-only access:**

CORS config above only allows `GET` and `HEAD` - staging app **cannot modify**
legacy files.

### **Firebase Storage Rules:**

Legacy bucket rules should allow public read (typical for profile images):

```javascript
// Legacy bucket rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read: if true; // Public read
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Since staging app users have **same UIDs** as legacy, authentication works!

---

## 💡 Future Migration Path

When ready for **production full migration** (Option 2):

1. Copy files to staging bucket
2. Update Firestore URLs
3. Remove CORS from legacy bucket
4. Decommission legacy storage

But for **6-user canary test**, Option 1 is perfect! ✅

---

## ✅ Success Criteria

- [ ] CORS configured on legacy bucket
- [ ] Staging app can load profile images
- [ ] No CORS errors in browser console
- [ ] Profile pages display correctly

---

**Estimated Time:** 10 minutes  
**Recommended for:** Canary testing, small migrations  
**Next Phase:** Phase 5 - Verification & Testing
