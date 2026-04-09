# 🚀 Quick Start: Install Firebase Storage Resize Images Extension

## Copy-Paste Configuration Values

Use these **exact values** when installing the extension from the Firebase
Console:

### 📍 Basic Configuration

| Field                        | Value                    |
| ---------------------------- | ------------------------ |
| **Cloud Functions location** | `us-central1`            |
| **Cloud Storage bucket**     | `nxt1-de054-appspot.com` |

### 📸 Image Settings

| Field                                     | Value                     |
| ----------------------------------------- | ------------------------- |
| **Sizes of resized images**               | `200x200,400x400,800x800` |
| **Delete original file**                  | `Don't delete`            |
| **Make resized images public**            | `No`                      |
| **Cloud Storage path for resized images** | `thumbs`                  |

### 📁 Path Configuration

**Paths that contain images you want to resize:**

```
users/{userId}/profile,users/{userId}/media,teams/{teamId}/logo,teams/{teamId}/media,posts/{postId}/images
```

**List of absolute paths NOT included for resized images:**

```
users/{userId}/profile/thumbs,users/{userId}/media/thumbs,teams/{teamId}/logo/thumbs,teams/{teamId}/media/thumbs,posts/{postId}/images/thumbs
```

### 🔧 Advanced Settings

| Field                                       | Value                     |
| ------------------------------------------- | ------------------------- |
| **Cloud Storage path for failed images**    | `_failed_resizes`         |
| **Cache-Control header for resized images** | `max-age=31536000,public` |
| **Convert image to preferred types**        | `webp,jpg`                |
| **GIF and WebP animated option**            | `Yes`                     |
| **Cloud Function memory**                   | `1 GB`                    |
| **Assign new access token**                 | `Yes`                     |
| **Content filter level**                    | `Off (No filtering)`      |
| **Custom content filter prompt**            | _(leave empty)_           |

## Installation Steps

1. **Open Firebase Console:** https://console.firebase.google.com
2. **Navigate to Extensions:** Project → Extensions → Install Extension
3. **Search:** `storage-resize-images` (official Firebase extension)
4. **Configure:** Copy values from table above
5. **Review billing:** Extension is FREE, only pay for Cloud Functions execution
6. **Install:** Click "Install Extension"
7. **Wait:** Installation takes ~2-3 minutes

## After Installation

```bash
# Deploy storage security rules
cd /Users/johnkeller/My\ Mac\ \(Johns-MacBook-Pro.local\)/Main/NXT1/nxt1-monorepo
firebase deploy --only storage

# Test the extension
# 1. Upload an image to: users/YOUR_USER_ID/profile/test.jpg
# 2. Check for thumbnails in: users/YOUR_USER_ID/profile/thumbs/
# 3. Verify 6 files created: test_200x200.webp, test_400x400.webp, etc.
```

## Usage in Code

```typescript
// Import from @nxt1/core
import {
  createStorageService,
  STORAGE_PATHS,
  buildStoragePath,
} from '@nxt1/core';

// Upload profile image (extension auto-generates thumbnails)
const result = await storageService.uploadProfileImage(userId, file);

// result.thumbnails contains:
// {
//   small: 'users/123/profile/thumbs/avatar_200x200.webp',
//   medium: 'users/123/profile/thumbs/avatar_400x400.webp',
//   large: 'users/123/profile/thumbs/avatar_800x800.webp',
//   original: 'users/123/profile/avatar.jpg'
// }
```

## Verification Checklist

- [ ] Extension shows "Active" in Firebase Console
- [ ] Upload test image to configured path
- [ ] Check `thumbs/` subdirectory created
- [ ] Verify 6 thumbnail files exist (3 sizes × 2 formats)
- [ ] Download thumbnail URLs work
- [ ] Storage rules deployed successfully

## Support

- **Documentation:** `docs/STORAGE-RESIZE-IMAGES.md`
- **Constants:** `packages/core/src/constants/storage.constants.ts`
- **Service:** `packages/core/src/storage/storage.service.ts`
- **Security Rules:** `storage.rules`

---

**Total Setup Time:** ~10 minutes  
**Cost:** FREE extension + ~$0.40 per 1M resizes  
**Performance Gain:** 99% bandwidth reduction for images
