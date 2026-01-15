# E2E Testing Setup

## Status: Not Started

> From: `docs/E2E-TESTING.md`

---

## New Feature Checklist

When adding a new feature, complete these E2E testing steps:

### Page Object Setup

- [ ] Create page object in `e2e/pages/[feature]/[feature].page.ts`
- [ ] Extend `BasePage` class
- [ ] Add `data-testid` attributes to all interactive components
- [ ] Register page in `e2e/fixtures/test.fixture.ts`
- [ ] Export from `e2e/pages/index.ts`

### Test Spec Setup

- [ ] Create test spec in `e2e/tests/[feature]/[feature].spec.ts`
- [ ] Group tests with `describe` blocks
- [ ] Add to CI workflow if needed

---

## Initial Setup Tasks

- [ ] Install Playwright: `npm install -D @playwright/test`
- [ ] Create `playwright.config.ts` at monorepo root
- [ ] Create `e2e/` folder structure:
  ```
  e2e/
  ├── fixtures/
  │   └── test.fixture.ts
  ├── pages/
  │   ├── index.ts
  │   └── base.page.ts
  ├── tests/
  │   └── auth/
  │       └── login.spec.ts
  └── utils/
      └── test-data.ts
  ```
- [ ] Add test scripts to root `package.json`
- [ ] Configure CI workflow for E2E tests

---

## Auth Flow E2E Tests

- [ ] Login with email/password
- [ ] Login with Google OAuth
- [ ] Login with Apple OAuth (iOS simulator)
- [ ] Sign up flow
- [ ] Forgot password flow
- [ ] Onboarding wizard completion
- [ ] Protected route redirects
- [ ] Sign out

---

## Best Practices Checklist

From the documentation:

- [ ] Use `data-testid` over CSS selectors
- [ ] Use Page Object Model pattern
- [ ] Tests are independent (no shared state)
- [ ] Use proper waiting strategies (not `sleep()`)
- [ ] Mock external APIs where appropriate
- [ ] Test on multiple viewport sizes
