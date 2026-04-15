# 🔐 Firebase Password Hash Key Recovery Guide

**Date:** April 11, 2026  
**Project:** NXT1 Legacy → V2 Migration  
**Issue:** Firebase deprecated "Database Secrets" section → SCRYPT hash key
inaccessible

---

## 🎯 Problem Statement

When migrating Firebase Authentication users between projects, preserving
passwords requires the SCRYPT hash configuration including the **signer key**.
Firebase removed access to this key via:

- ❌ Firebase Console → Database Secrets (section empty/deprecated)
- ❌ Firebase CLI → `auth:export` (excludes hash key deliberately)
- ❌ gcloud SDK → Identity Platform API (requires interactive auth)

**Security Rationale:** Firebase intentionally hides hash keys to prevent
password theft if export files are leaked.

---

## ✅ Solution: Identity Toolkit Admin API

### **Method:** Use Firebase Identity Toolkit Admin API v2

Firebase provides an undocumented Admin API endpoint that returns the full
authentication configuration including hash keys when accessed with proper
service account credentials.

### **API Endpoint:**

```
GET https://identitytoolkit.googleapis.com/admin/v2/projects/{projectId}/config
```

### **Requirements:**

1. **Service Account Credentials:**
   - Firebase Admin SDK service account
   - Must have `firebase-adminsdk` role
   - Requires scopes:
     - `https://www.googleapis.com/auth/cloud-platform`
     - `https://www.googleapis.com/auth/identitytoolkit`

2. **Google Auth Library:**
   ```bash
   npm install google-auth-library
   ```

---

## 📝 Step-by-Step Implementation

### **1. Setup Environment Variables**

Add to `.env`:

```bash
LEGACY_FIREBASE_PROJECT_ID=nxt-1-de054
LEGACY_FIREBASE_CLIENT_EMAIL=firebase-adminsdk-w01w0@nxt-1-de054.iam.gserviceaccount.com
LEGACY_FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### **2. Create Script to Retrieve Hash Key**

**File:** `scripts/migration/try-api-hash-key.ts`

```typescript
#!/usr/bin/env tsx
import { GoogleAuth } from 'google-auth-library';

const projectId = process.env.LEGACY_FIREBASE_PROJECT_ID;

// Initialize GoogleAuth with service account
const auth = new GoogleAuth({
  credentials: {
    client_email: process.env.LEGACY_FIREBASE_CLIENT_EMAIL,
    private_key: process.env.LEGACY_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/identitytoolkit',
  ],
});

const client = await auth.getClient();
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;

// Make authenticated request
const response = await client.request({ url });

console.log('Hash Config:', response.data.signIn.hashConfig);
```

### **3. Execute Script**

```bash
cd /Users/sotatek/Downloads/Source_Code/NXT1/nxt1-repo/backend
npx tsx scripts/migration/try-api-hash-key.ts
```

### **4. Expected Response**

```json
{
  "signIn": {
    "email": {
      "enabled": true,
      "passwordRequired": true
    },
    "hashConfig": {
      "algorithm": "SCRYPT",
      "signerKey": "Ul0yk3ZKlvEUhin6ujgLd7GczdL+Onl4IhvuclnmdXPzxMcTcM8RTUJJe7GArhaOUwA1evaSegm9yv+EOVIiTQ==",
      "saltSeparator": "Bw==",
      "rounds": 8,
      "memoryCost": 14
    }
  }
}
```

### **5. Save Hash Configuration**

**File:** `scripts/migration/hash-config.json`

```json
{
  "algorithm": "SCRYPT",
  "signerKey": "Ul0yk3ZKlvEUhin6ujgLd7GczdL+Onl4IhvuclnmdXPzxMcTcM8RTUJJe7GArhaOUwA1evaSegm9yv+EOVIiTQ==",
  "saltSeparator": "Bw==",
  "rounds": 8,
  "memoryCost": 14,
  "retrievedAt": "2026-04-11",
  "sourceProject": "nxt-1-de054"
}
```

---

## 🚀 Using Hash Key for Import

### **Firebase CLI Import with Passwords:**

```bash
firebase auth:import auth-export-filtered.json \
  --project nxt-1-staging-v2 \
  --hash-algo=SCRYPT \
  --rounds=8 \
  --mem-cost=14 \
  --salt-separator="Bw==" \
  --hash-key="Ul0yk3ZKlvEUhin6ujgLd7GczdL+Onl4IhvuclnmdXPzxMcTcM8RTUJJe7GArhaOUwA1evaSegm9yv+EOVIiTQ=="
```

### **Result:**

✅ **All users imported with original passwords preserved!**

Users can login immediately with their legacy passwords without needing to
reset.

---

## 🔍 Alternative Endpoints (for reference)

We tried multiple endpoints before finding the working one:

| Endpoint                                                              | Result             | Notes                   |
| --------------------------------------------------------------------- | ------------------ | ----------------------- |
| `identitytoolkit.googleapis.com/v1/projects/{id}/config`              | ❌ 404             | Not Found               |
| `identitytoolkit.googleapis.com/admin/v2/projects/{id}/config`        | ✅ SUCCESS         | Returns hash config     |
| `www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig` | ❌ Invalid API key | Requires different auth |
| `firebase.googleapis.com/v1beta1/projects/{id}`                       | ✅ Project info    | No hash config          |

**Key Finding:** Only the **admin/v2** endpoint returns the hash configuration.

---

## 📚 Important Notes

### **Security Considerations:**

1. **Never commit `hash-config.json` to version control**
   - Add to `.gitignore`
   - Hash keys are sensitive credentials

2. **Limit access to service accounts**
   - Only authorized personnel should have service account keys
   - Rotate keys regularly

3. **Delete hash config after migration**
   - Once migration complete, delete `hash-config.json`
   - Hash keys are only needed during migration

### **Firebase Security Policy:**

Firebase intentionally makes hash keys difficult to access because:

- Leaked export files with hash keys = full password database compromise
- Without hash keys, leaked exports only contain salted hashes (useless to
  attackers)
- This forces separating "data export" (auth-export.json) from "hash config"
  (requires API access)

### **Production Migration:**

When migrating full production (4,843 users):

1. Use same API method to retrieve hash key
2. Import ALL users in single batch (or batches of 1000)
3. Verify password login works for sample users
4. Delete hash-config.json after confirmation
5. Rotate service account keys as security best practice

---

## 🎓 Lessons Learned

### **What Worked:**

✅ Firebase Identity Toolkit Admin API v2  
✅ Google Auth Library with service account  
✅ Proper OAuth scopes (cloud-platform + identitytoolkit)  
✅ Separating hash key retrieval from user export

### **What Didn't Work:**

❌ Firebase Console (Database Secrets section removed)  
❌ Firebase CLI export options (deliberately excludes keys)  
❌ gcloud SDK (requires interactive authentication)  
❌ REST API v1 endpoint (404)  
❌ Identity Platform API v3 (wrong authentication method)

### **Key Insight:**

Google provides necessary tools for enterprise migrations, but intentionally
makes them non-obvious to prevent casual exposure of sensitive hash keys. The
Admin API v2 endpoint is the "proper" way to retrieve hash configuration
programmatically.

---

## 📞 Support Resources

If this method fails in the future:

1. **Firebase Support Ticket**
   - https://firebase.google.com/support
   - Subject: "Request SCRYPT Hash Key for Enterprise Migration"
   - Wait time: 2-5 business days

2. **Google Cloud Support**
   - https://cloud.google.com/support
   - Required for production-critical migrations
   - Faster response with paid support plans

3. **Stack Overflow**
   - Tag: `firebase-authentication`, `google-cloud-identity`
   - Search: "Firebase SCRYPT hash key migration"

---

## 🔗 Related Files

- `try-api-hash-key.ts` - Script that successfully retrieved hash key
- `hash-config.json` - Saved SCRYPT configuration (DO NOT COMMIT!)
- `MIGRATION-PROGRESS.md` - Overall migration progress
- `PHASE-2-AUTH-MIGRATION.md` - Authentication migration details

---

**Last Updated:** April 11, 2026  
**Status:** ✅ Method Verified Working  
**Next Review:** Before production migration (4,843 users)
