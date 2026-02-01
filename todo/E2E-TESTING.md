# E2E Testing Setup

## Status: ✅ Complete (86 passing, 9 skipped)

> Last updated: February 1, 2026  
> From: `docs/E2E-TESTING.md`

---

## Current Test Results

**86 passed, 9 skipped** - All critical auth flows covered with real Firebase
Auth.

### Tech Stack

- Playwright v1.49.0 with Chromium
- MSW v2.7.0 for API mocking
- Real Firebase Auth (`E2E_REAL_AUTH=true`)
- Page Object Model pattern
- 4 parallel workers

---

## ✅ Initial Setup Complete

All setup tasks have been completed:

- [x] Install Playwright: `npm install -D @playwright/test`
- [x] Create `playwright.config.ts` at `apps/web/e2e/`
- [x] Create `e2e/` folder structure:
  ```
  apps/web/e2e/
  ├── fixtures/
  │   └── test.fixture.ts
  ├── pages/
  │   ├── index.ts
  │   ├── base.page.ts
  │   └── auth/
  │       ├── login.page.ts
  │       ├── signup.page.ts
  │       └── forgot-password.page.ts
  ├── tests/
  │   └── auth/
  │       ├── login.spec.ts
  │       ├── signup.spec.ts
  │       ├── forgot-password.spec.ts
  │       └── onboarding.spec.ts
  ├── mocks/
  ├── snapshots/
  └── utils/
      └── test-data.ts
  ```
- [x] Add test scripts to `apps/web/e2e/package.json`
- [x] Configure CI workflow for E2E tests (`.github/workflows/e2e.yml`)

---

## ✅ Auth Flow E2E Tests Implemented

- [x] Login with email/password
- [x] Sign up flow
- [x] Forgot password flow
- [x] Protected route redirects
- [x] Sign out
- [ ] Login with Google OAuth (skipped - requires manual test)
- [ ] Login with Apple OAuth (skipped - iOS simulator only)
- [ ] Onboarding wizard completion (partial coverage)

---

## Best Practices Checklist

From the documentation:

- [ ] Use `data-testid` over CSS selectors
- [ ] Use Page Object Model pattern
- [ ] Tests are independent (no shared state)
- [ ] Use proper waiting strategies (not `sleep()`)
- [ ] Mock external APIs where appropriate
- [ ] Test on multiple viewport sizes
