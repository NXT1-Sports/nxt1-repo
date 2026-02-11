# Firebase Analytics Share Events Testing

## ✅ Setup Complete

- [x] Installed `@capacitor-firebase/analytics@8.0.1`
- [x] Capacitor plugins synced
- [x] Firebase configs present (staging environment)
- [x] Share event tracking implemented

---

## 📱 Test on iOS Device

### Build & Install

```bash
cd apps/mobile

# Build for iOS staging
npm run build:staging

# Sync and open Xcode
npx cap sync ios
npx cap open ios
```

**In Xcode:**

1. Select your iOS device (not simulator - Analytics don't work in simulator)
2. Product → Build (`Cmd+B`)
3. Product → Run (`Cmd+R`)

### Test Share Events

1. **Open app** on your iPhone
2. **Navigate to Home feed**
3. **Tap Share button** on a post/profile
4. **Complete the share** (share to Messages, Notes, or copy link)

### Verify in Firebase Console

1. Go to: https://console.firebase.google.com/
2. Select project: **nxt-1-staging**
3. Navigate to: **Analytics → Events**
4. Wait 1-2 minutes for events to appear
5. Look for event: **`share`**
6. Click on event to see parameters:
   - `content_type`: `post`, `profile`, `team`, etc.
   - `item_id`: ID of shared content
   - `method`: `native_share`, `copy_link`, etc.

### Debug Logs (Optional)

Enable Xcode console to see logs:

- Window → Devices and Simulators
- Select your device
- View Device Logs
- Filter by: "Analytics"

Look for:

- `[Analytics] Event tracked: share`
- `[Analytics] Parameters: {...}`

---

## 🤖 Test on Android Device

### Build & Install

```bash
cd apps/mobile

# Build for Android staging
npm run build:staging

# Sync and open Android Studio
npx cap sync android
npx cap open android
```

**In Android Studio:**

1. Select your Android device
2. Build → Make Project
3. Run → Run 'app'

### Test Share Events

1. **Open app** on your Android phone
2. **Navigate to Home feed**
3. **Tap Share button** on a post/profile
4. **Complete the share**

### Verify in Firebase Console

Same as iOS - check Firebase Console for `share` events.

### Debug Logs (Optional)

Use Logcat in Android Studio:

- View → Tool Windows → Logcat
- Filter by: "Analytics"

Look for:

- `FA: Logging event (FE): share`
- `FA-SVC: Bundle: {...}`

---

## 📊 Expected Results

### Share Event Parameters

```json
{
  "event": "share",
  "params": {
    "method": "native_share", // or "copy_link"
    "content_type": "post", // or "profile", "team", "video"
    "item_id": "abc123xyz", // ID of shared content
    "platform": "ios" // or "android"
  }
}
```

### Success Criteria

- ✅ Events appear in Firebase Console within 1-2 minutes
- ✅ All parameters are present and correct
- ✅ Different content types tracked correctly
- ✅ Both "native_share" and "copy_link" methods work

---

## ⚠️ Important Notes

### iOS Specific

- **Analytics do NOT work in iOS Simulator** - must use real device
- Events may take longer on first app install
- Ensure device has internet connection

### Android Specific

- Events work in emulator but prefer real device for accurate testing
- Check Google Play Services is up to date on device

### Staging vs Production

Currently testing against **staging environment**:

- Project: `nxt-1-staging`
- Bundle ID (iOS): `com.nxt1.sports`
- Package Name (Android): `com.nxt1.sports`

For production testing, you'll need to:

1. Switch to production Firebase configs
2. Update Bundle/Package IDs
3. Build production variants

---

## 🐛 Troubleshooting

### Events not appearing in Firebase

**Possible causes:**

1. Device offline
2. Using iOS Simulator (not supported)
3. Analytics disabled in Firebase project
4. Wrong Firebase config files

**Fix:**

```bash
# Verify config files
cat android/app/google-services.json | grep project_id
cat ios/App/App/GoogleService-Info.plist | grep PROJECT_ID

# Should show: nxt-1-staging
```

### Share button not working

Check logs for errors:

- iOS: Xcode Device Logs
- Android: Android Studio Logcat

Common issues:

- Missing Share plugin (already installed ✅)
- Permission issues on device

---

## ✅ Completion Checklist

- [ ] Built app for iOS staging
- [ ] Installed on iOS device
- [ ] Tested share on iOS
- [ ] Verified events in Firebase Console (iOS)
- [ ] Built app for Android staging
- [ ] Installed on Android device
- [ ] Tested share on Android
- [ ] Verified events in Firebase Console (Android)

---

## Next Steps

After successful testing:

1. ✅ Mark "Verify Firebase Analytics share events" as complete
2. Continue with Deep Linking setup
3. Prepare for production deployment
