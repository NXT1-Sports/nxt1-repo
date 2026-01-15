# Native Auth Testing Checklist

## Status: Not Started

> From: `docs/NATIVE-AUTH-SETUP.md`

---

## Pre-Release Verification

Before releasing the mobile app with native OAuth, verify these items:

### Google Sign-In

- [ ] Google Sign-In shows native system UI (not web popup)
- [ ] Successful sign-in creates Firebase user
- [ ] User appears in Firebase Console → Authentication → Users
- [ ] ID token is valid (check with backend API call)
- [ ] Sign-out clears native credentials
- [ ] Cancellation is handled gracefully (no error shown to user)

### Apple Sign-In (iOS Only)

- [ ] Apple Sign-In shows native sheet (not web popup)
- [ ] Successful sign-in creates Firebase user
- [ ] User name/email captured on first sign-in
- [ ] ID token is valid
- [ ] Sign-out clears credentials
- [ ] Cancellation handled gracefully

### Microsoft Sign-In

- [ ] OAuth flow opens in-app browser (not external)
- [ ] Successful sign-in creates Firebase user
- [ ] ID token is valid
- [ ] Sign-out clears credentials
- [ ] Cancellation handled gracefully

---

## Security Checklist

From `docs/SECURITY.md`:

- [ ] Implement certificate pinning for production builds
- [ ] Tokens stored securely via Capacitor Preferences API (not localStorage)
- [ ] No API keys hardcoded in mobile app binary
- [ ] All inputs validated on backend (Zero Trust)

---

## Platform Configuration

### iOS Setup

- [ ] GoogleService-Info.plist added to Xcode project
- [ ] URL schemes configured for Google Sign-In
- [ ] Sign in with Apple capability enabled
- [ ] Associated Domains configured (if using universal links)

### Android Setup

- [ ] google-services.json added to `app/` directory
- [ ] SHA-1 fingerprint added to Firebase Console
- [ ] Release keystore SHA-1 also added

---

## Testing Environments

| Environment | Firebase Project | Status |
| ----------- | ---------------- | ------ |
| Development | nxt-1-staging    | - [ ]  |
| Staging     | nxt-1-staging    | - [ ]  |
| Production  | nxt-1-de054      | - [ ]  |

---

## Error Scenarios to Test

- [ ] Network disconnected during sign-in
- [ ] User cancels mid-flow
- [ ] Invalid/expired tokens
- [ ] Account already exists with different provider
- [ ] Rate limiting triggered
