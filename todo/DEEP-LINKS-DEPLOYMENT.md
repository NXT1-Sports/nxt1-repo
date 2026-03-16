# Deep Links — Remaining Deployment Steps

> Last updated: March 15, 2026 Code is complete. Only deployment and store
> submissions remain.

---

## 1. Deploy Web App

- [ ] Deploy web app to Firebase hosting (includes `.well-known` files)
- [ ] Verify `https://nxt1sports.com/.well-known/apple-app-site-association`
      returns 200 with `application/json`
- [ ] Verify `https://nxt1sports.com/.well-known/assetlinks.json` returns 200

## 2. Enable iOS Associated Domains

- [ ] Go to Apple Developer Portal → App ID `com.nxt1sports.nxt1` → Enable
      "Associated Domains"

## 3. Rebuild & Submit Apps

- [ ] iOS: Clean build → Archive → Submit to App Store
- [ ] Android: Clean build → Generate signed bundle → Submit to Play Store

## 4. Device Testing

- [ ] iOS: Tap a deep link → app opens (not Safari)
- [ ] Android: Tap a deep link → app opens (not Chrome)

# Force verification

adb shell pm verify-app-links --re-verify com.nxt1sports.app.twa

````

### Deep link received but app doesn't navigate

**Check logs:**

```bash
# iOS: Use Xcode console
# Android: Use Logcat with filter "DeepLinkService"
````

Look for:

- `"Deep link received"` — Handler triggered
- `"Navigating to deep link route"` — Route resolved
- `"No route found for deep link"` — Pattern not matched (add to route map)

---

## 📝 Code Changes Summary

All changes are complete. No code changes needed, just deployment:

1. ✅ iOS Bundle ID: `com.nxt1sports.nxt1` (matches App Store)
2. ✅ Android Package: `com.nxt1sports.app.twa` (matches Play Store)
3. ✅ Associated Domains entitlement added
4. ✅ Android App Links intent filters added
5. ✅ DeepLinkService created with route mapping
6. ✅ Service integrated in app.component.ts
7. ✅ Server files created (apple-app-site-association, assetlinks.json)
8. ✅ Build config updated to include .well-known directory

**These apps can update existing listings — no new app required.**

---

## 🎯 Next Actions (Priority Order)

1. [ ] Deploy web app with .well-known files
2. [ ] Verify both URLs are accessible (curl tests)
3. [ ] Enable Associated Domains in Apple Developer Portal
4. [ ] Rebuild + submit iOS app update
5. [ ] Rebuild + submit Android app update
6. [ ] Test deep links on real devices
7. [ ] Monitor logs for any issues

**Estimated time:** 30 minutes (excluding App Store/Play Store review)
