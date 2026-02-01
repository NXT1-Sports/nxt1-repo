# NXT1 Monorepo - TODO Index

> Master tracking file for all pending work items. Last updated: February 1,
> 2026

---

## ✅ Recently Completed

### [CI-CD-SETUP.md](./CI-CD-SETUP.md) ✅

GitHub Actions workflows fully configured.

- ✅ All workflow files created (ci.yml, deploy-web.yml, deploy-mobile.yml,
  etc.)
- ✅ AI code review workflow
- ✅ E2E test workflow
- 🟡 GitHub secrets configuration (verify in repo settings)

### [E2E-TESTING.md](./E2E-TESTING.md) ✅

Playwright E2E testing fully operational.

- ✅ 86 tests passing, 9 intentionally skipped
- ✅ Page Object Model pattern
- ✅ Real Firebase Auth integration
- ✅ CI workflow integration

---

## 🟡 In Progress

### [AUTH-FLOW.md](./AUTH-FLOW.md)

Authentication system nearly complete.

- ✅ Login page (email + OAuth)
- ✅ Signup page
- ✅ Forgot password (fully implemented)
- ✅ Auth guards (`requireAuth`, `requireGuest`, `requireOnboarding`,
  `requireRole`)
- 🟡 Onboarding wizard (UI complete, needs persistence testing)
- ⬜ Biometric authentication (mobile)

### [NATIVE-AUTH-TESTING.md](./NATIVE-AUTH-TESTING.md)

Native OAuth ready for testing.

- ✅ Native auth package installed (`@capacitor-firebase/authentication`)
- ✅ Apple Sign-In via `@capacitor-community/apple-sign-in`
- ✅ Microsoft Sign-In via `@recognizebv/capacitor-plugin-msauth`
- ⬜ Device testing verification (Google, Apple, Microsoft)
- ⬜ Security checklist

### [ANALYTICS-INTEGRATION.md](./ANALYTICS-INTEGRATION.md)

Firebase Analytics partially integrated.

- ✅ Mobile auth tracking (parity with web)
- ✅ Analytics module complete in `@nxt1/core`
- ⬜ Page view tracking
- ⬜ GDPR consent UI
- ⬜ Firebase Console setup

### [SEO-CHECKLIST.md](./SEO-CHECKLIST.md)

SEO implementation in progress.

- ✅ SeoService implemented
- ✅ Auth pages SEO complete
- ⬜ OG images (blocking social sharing)
- ⬜ Public profile/team pages
- ⬜ Dynamic sitemap

---

## 🟢 Lower Priority

### [SECURITY-HARDENING.md](./SECURITY-HARDENING.md)

Production security checklist.

- ⬜ Mobile certificate pinning
- ⬜ API security audit
- ⬜ Dependency scanning
- ⬜ Incident response plan

---

## Quick Status

| Area          | Status         | Blocking Release?       |
| ------------- | -------------- | ----------------------- |
| Auth Flow     | 🟡 90% Done    | Yes (persistence test)  |
| Onboarding    | 🟡 In Progress | Yes                     |
| Native Auth   | 🟡 Ready       | Yes - needs device test |
| Analytics     | 🟡 Partial     | No                      |
| CI/CD         | ✅ Complete    | No                      |
| SEO           | 🟡 In Progress | No                      |
| E2E Testing   | ✅ Complete    | No                      |
| Toast Service | ✅ Complete    | No                      |
| Crashlytics   | ✅ Complete    | No                      |
| Security      | ⬜ Not Started | Yes (Production)        |

---

## Legend

- ⬜ Not Started
- 🟡 In Progress
- ✅ Complete
