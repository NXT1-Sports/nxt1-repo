# NXT1 Monorepo - TODO Index

> Master tracking file for all pending work items. Last updated: January 21,
> 2026

---

## 🔴 High Priority

### [AUTH-FLOW.md](./AUTH-FLOW.md)

Complete the authentication system for web and mobile.

- ✅ Login page (email + OAuth)
- ✅ Signup page
- ⬜ Forgot password
- 🟡 Onboarding wizard (UI complete, needs persistence testing)
- ⬜ Auth guards

### [NATIVE-AUTH-TESTING.md](./NATIVE-AUTH-TESTING.md)

Verify native OAuth before mobile release.

- Google Sign-In testing
- Apple Sign-In testing (iOS)
- Microsoft Sign-In testing
- Security checklist

### [ANALYTICS-INTEGRATION.md](./ANALYTICS-INTEGRATION.md)

Complete Firebase Analytics integration.

- Mobile auth tracking (parity with web)
- Page view tracking
- GDPR consent UI
- Firebase Console setup

---

## 🟡 Medium Priority

### [CI-CD-SETUP.md](./CI-CD-SETUP.md)

Configure GitHub Actions workflows and secrets.

- GitHub secrets configuration
- Workflow files creation
- n8n/Slack notifications
- Turborepo remote caching

### [SEO-CHECKLIST.md](./SEO-CHECKLIST.md)

Implement SEO for public pages.

- Per-page SEO setup
- SSR render modes
- Sitemap generation
- Structured data

### [E2E-TESTING.md](./E2E-TESTING.md)

Set up Playwright E2E testing.

- Initial Playwright setup
- Page object model
- Auth flow tests
- CI integration

---

## 🟢 Lower Priority

### [DESIGN-SYSTEM-MIGRATION.md](./DESIGN-SYSTEM-MIGRATION.md)

Consolidate Tailwind configuration (8-week roadmap).

- Phase 1: `@nxt1/tailwind-preset` package
- Phase 2: Style Dictionary token pipeline
- Phase 3: CVA component utilities
- Phase 4: Bundle optimization

### [SECURITY-HARDENING.md](./SECURITY-HARDENING.md)

Production security checklist.

- Mobile certificate pinning
- API security audit
- Dependency scanning
- Incident response

---

## Quick Status

| Area          | Status         | Blocking Release?                    |
| ------------- | -------------- | ------------------------------------ |
| Auth Flow     | 🟡 In Progress | Yes                                  |
| Onboarding    | 🟡 In Progress | Yes                                  |
| Native Auth   | ⬜ Blocked     | Yes (Mobile) - needs package install |
| Analytics     | 🟡 Partial     | Yes (Mobile parity)                  |
| CI/CD         | ⬜ Not Started | No                                   |
| SEO           | ⬜ Not Started | No                                   |
| E2E Testing   | ⬜ Not Started | No                                   |
| Design System | ⬜ Not Started | No                                   |
| Security      | ⬜ Not Started | Yes (Production)                     |

---

## Legend

- ⬜ Not Started
- 🟡 In Progress
- ✅ Complete
