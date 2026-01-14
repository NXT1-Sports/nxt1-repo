# E2E Testing Strategy

This document provides a comprehensive guide to end-to-end testing in the NXT1
monorepo using Playwright.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Configuration](#configuration)
5. [Page Object Pattern](#page-object-pattern)
6. [Writing Tests](#writing-tests)
7. [Test Fixtures](#test-fixtures)
8. [Authentication](#authentication)
9. [CI/CD Integration](#cicd-integration)
10. [Visual Regression Testing](#visual-regression-testing)
11. [Best Practices](#best-practices)
12. [Troubleshooting](#troubleshooting)

---

## Overview

### Why Playwright?

We chose Playwright over alternatives for these reasons:

| Feature          | Playwright     | Cypress     | Selenium  |
| ---------------- | -------------- | ----------- | --------- |
| Multi-browser    | ✅ Native      | ⚠️ Limited  | ✅ Native |
| Speed            | ⚡ Fast        | 🐢 Slower   | 🐢 Slower |
| Auto-wait        | ✅ Built-in    | ✅ Built-in | ❌ Manual |
| Mobile emulation | ✅ Excellent   | ⚠️ Basic    | ⚠️ Basic  |
| Parallel tests   | ✅ Native      | ⚠️ Paid     | ✅ Grid   |
| TypeScript       | ✅ First-class | ✅ Good     | ⚠️ Basic  |
| Angular SSR      | ✅ Works       | ⚠️ Issues   | ✅ Works  |
| Maintenance      | Microsoft      | Cypress.io  | Selenium  |

### Test Philosophy

```
┌─────────────────────────────────────────────────────────────┐
│                      E2E TESTS                               │
│   Test complete user flows through the real application      │
│   "Does the user achieve their goal?"                        │
├─────────────────────────────────────────────────────────────┤
│                   INTEGRATION TESTS                          │
│   Test service interactions and API contracts                │
│   "Do components work together?"                             │
├─────────────────────────────────────────────────────────────┤
│                      UNIT TESTS                              │
│   Test individual functions and components in isolation      │
│   "Does this function return the right value?"               │
└─────────────────────────────────────────────────────────────┘
          More tests ↑              ↑ Fewer tests
          Faster      ↑              ↑ Slower
          Less realistic ↑          ↑ More realistic
```

---

## Architecture

### Layer Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    TEST SPECS (*.spec.ts)                    │
│   Describe user scenarios and assertions                     │
├─────────────────────────────────────────────────────────────┤
│                    FIXTURES (test.fixture.ts)                │
│   Dependency injection for page objects and test data        │
├─────────────────────────────────────────────────────────────┤
│                    PAGE OBJECTS (*.page.ts)                  │
│   Encapsulate selectors, actions, and page-specific logic    │
├─────────────────────────────────────────────────────────────┤
│                    UTILITIES (utils/)                        │
│   Helpers, constants, environment config, test data          │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
Test Spec
    │
    ├── Uses fixtures to get page objects
    │       │
    │       └── Page objects encapsulate DOM interactions
    │               │
    │               └── Base page provides common utilities
    │
    └── Uses utils for test data and helpers
```

---

## Directory Structure

```
apps/web/e2e/
├── playwright.config.ts       # Main configuration
├── tsconfig.json              # TypeScript config
├── .env.example               # Environment template
├── global.setup.ts            # Pre-test authentication
├── global.teardown.ts         # Post-test cleanup
├── README.md                  # Quick reference
│
├── .auth/                     # Auth state storage (gitignored)
│   └── user.json              # Saved session cookies/tokens
│
├── fixtures/                  # Playwright Fixtures
│   ├── index.ts               # Barrel export
│   └── test.fixture.ts        # Custom test fixtures
│
├── pages/                     # Page Object Models
│   ├── index.ts               # Barrel export
│   ├── base.page.ts           # Abstract base class
│   └── auth/
│       ├── index.ts
│       ├── login.page.ts
│       ├── signup.page.ts
│       └── forgot-password.page.ts
│
├── tests/                     # Test Specifications
│   └── auth/
│       ├── index.ts
│       ├── login.spec.ts
│       ├── signup.spec.ts
│       └── forgot-password.spec.ts
│
├── utils/                     # Shared Utilities
│   ├── index.ts
│   ├── test-helpers.ts        # Data generation, wait helpers
│   ├── environment.ts         # Multi-env configuration
│   └── test-data.ts           # Constants and test data
│
├── playwright-report/         # HTML reports (gitignored)
└── test-results/              # Artifacts (gitignored)
```

---

## Configuration

### Playwright Config Highlights

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './tests',

  // Parallel execution
  fullyParallel: true,
  workers: CI ? '50%' : 4,

  // Retry flaky tests in CI
  retries: CI ? 2 : 0,

  // Global settings
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },

  // Browser projects
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
    { name: 'mobile-chrome', use: devices['Pixel 7'] },
    { name: 'mobile-safari', use: devices['iPhone 14'] },
  ],

  // Start dev server
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4200',
    reuseExistingServer: !CI,
  },
});
```

### Environment Variables

| Variable                 | Description           | Default                 |
| ------------------------ | --------------------- | ----------------------- |
| `E2E_BASE_URL`           | Application URL       | `http://localhost:4200` |
| `E2E_TEST_USER_EMAIL`    | Test account email    | -                       |
| `E2E_TEST_USER_PASSWORD` | Test account password | -                       |
| `E2E_ENV`                | Environment name      | `local`                 |
| `CI`                     | CI environment flag   | -                       |

### Multi-Environment Support

```typescript
// utils/environment.ts
const environments = {
  local: {
    baseUrl: 'http://localhost:4200',
    apiUrl: 'http://localhost:3001',
  },
  staging: {
    baseUrl: 'https://staging.nxt1.com',
    apiUrl: 'https://api-staging.nxt1.com',
  },
  production: {
    baseUrl: 'https://www.nxt1.com',
    apiUrl: 'https://api.nxt1.com',
  },
};
```

---

## Page Object Pattern

### Why Page Objects?

Page Objects provide:

1. **Encapsulation** - Selectors in one place
2. **Reusability** - Same actions across tests
3. **Maintainability** - UI changes = one file update
4. **Readability** - Tests read like user stories

### Base Page Class

```typescript
// pages/base.page.ts
export abstract class BasePage {
  abstract readonly url: string;

  constructor(protected readonly page: Page) {}

  // Navigation
  async goto(): Promise<void> {
    await this.page.goto(this.url);
  }

  // Wait utilities
  async waitForElement(locator: Locator): Promise<void> {
    await locator.waitFor({ state: 'visible' });
  }

  // Assertions
  async assertVisible(locator: Locator): Promise<void> {
    await expect(locator).toBeVisible();
  }

  // Screenshots
  async screenshot(name: string): Promise<Buffer> {
    return this.page.screenshot({ path: `test-results/${name}.png` });
  }
}
```

### Page Object Example

```typescript
// pages/auth/login.page.ts
export class LoginPage extends BasePage {
  readonly url = '/auth/login';

  // Selectors - prefer data-testid for stability
  readonly emailInput = this.page.getByTestId('email-input');
  readonly passwordInput = this.page.getByTestId('password-input');
  readonly submitButton = this.page.getByTestId('login-submit');
  readonly errorMessage = this.page.getByTestId('error-message');

  // Actions
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  // Assertions
  async assertLoginSuccess(): Promise<void> {
    await this.page.waitForURL(/\/(home|dashboard)/);
  }

  async assertError(message?: RegExp): Promise<void> {
    await this.assertVisible(this.errorMessage);
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }
}
```

---

## Writing Tests

### Test Structure

```typescript
// tests/auth/login.spec.ts
import { test, expect } from '../../fixtures';

test.describe('Login Page', () => {
  // Runs before each test in this describe block
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test.describe('Successful Login', () => {
    test('should login with valid credentials', async ({
      loginPage,
      testUser,
    }) => {
      await loginPage.login(testUser.email, testUser.password);
      await loginPage.assertLoginSuccess();
    });
  });

  test.describe('Failed Login', () => {
    test('should show error for invalid credentials', async ({ loginPage }) => {
      await loginPage.login('invalid@test.com', 'wrongpassword');
      await loginPage.assertError(/invalid credentials/i);
    });
  });
});
```

### Selector Priority

Use selectors in this order (most to least preferred):

```typescript
// 1. data-testid (BEST - stable, explicit)
page.getByTestId('submit-button');

// 2. ARIA roles (good for accessibility)
page.getByRole('button', { name: /submit/i });

// 3. Label text (good for form inputs)
page.getByLabel('Email');

// 4. Placeholder text
page.getByPlaceholder('Enter email');

// 5. Text content (can be brittle)
page.getByText('Submit');

// 6. CSS selectors (AVOID - brittle)
page.locator('.btn-primary');
```

### Adding data-testid to Components

```html
<!-- In Angular component template -->
<button data-testid="login-submit" (click)="onSubmit()">Sign In</button>

<ion-input data-testid="email-input" type="email" [(ngModel)]="email" />
```

---

## Test Fixtures

### What Are Fixtures?

Fixtures provide dependency injection for tests:

```typescript
// fixtures/test.fixture.ts
export const test = base.extend<TestFixtures>({
  // Page object fixtures
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  signupPage: async ({ page }, use) => {
    await use(new SignupPage(page));
  },

  // Test data fixtures
  testUser: async ({}, use) => {
    await use({
      email: process.env.E2E_TEST_USER_EMAIL,
      password: process.env.E2E_TEST_USER_PASSWORD,
    });
  },
});
```

### Using Fixtures in Tests

```typescript
// Fixtures are injected automatically
test('login test', async ({ loginPage, testUser }) => {
  // loginPage and testUser are ready to use
  await loginPage.login(testUser.email, testUser.password);
});
```

---

## Authentication

### Auth State Reuse

Instead of logging in before every test, we:

1. Run `global.setup.ts` once before all tests
2. Save authenticated state to `.auth/user.json`
3. Load state in each test (instant auth!)

```typescript
// global.setup.ts
async function globalSetup(config: FullConfig): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Perform login
  await page.goto('/auth/login');
  await page.fill('[data-testid="email"]', process.env.E2E_TEST_USER_EMAIL);
  await page.fill(
    '[data-testid="password"]',
    process.env.E2E_TEST_USER_PASSWORD
  );
  await page.click('[data-testid="submit"]');

  // Wait for auth to complete
  await page.waitForURL(/\/(home|dashboard)/);

  // Save auth state
  await page.context().storageState({ path: '.auth/user.json' });

  await browser.close();
}
```

### Unauthenticated Tests

For testing login/signup flows, use a separate project:

```typescript
// playwright.config.ts
projects: [
  // Authenticated tests
  {
    name: 'chromium',
    use: { storageState: '.auth/user.json' },
    dependencies: ['setup'],
  },

  // Unauthenticated tests (no setup dependency)
  {
    name: 'chromium-unauthenticated',
    testMatch: '**/auth/**/*.spec.ts',
    use: { /* no storageState */ },
  },
],
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  e2e:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps ${{ matrix.browser }}

      - name: Run E2E tests
        run: npm run e2e -- --project=${{ matrix.browser }}
        env:
          E2E_TEST_USER_EMAIL: ${{ secrets.E2E_TEST_USER_EMAIL }}
          E2E_TEST_USER_PASSWORD: ${{ secrets.E2E_TEST_USER_PASSWORD }}

      - name: Upload report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report-${{ matrix.browser }}
          path: apps/web/e2e/playwright-report/
```

### Required Secrets

Add these to your GitHub repository:

- `E2E_TEST_USER_EMAIL` - Dedicated test account email
- `E2E_TEST_USER_PASSWORD` - Test account password

---

## Visual Regression Testing

Visual regression testing captures screenshots of your UI and compares them
against baseline images to detect unintended visual changes.

### Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FIRST RUN                                 │
│   Creates baseline screenshots in ./snapshots/               │
├─────────────────────────────────────────────────────────────┤
│                 SUBSEQUENT RUNS                              │
│   Compares current screenshots against baselines             │
│   ✅ Match → Test passes                                     │
│   ❌ Diff → Test fails with visual diff report               │
├─────────────────────────────────────────────────────────────┤
│                 UPDATE BASELINES                             │
│   npx playwright test --update-snapshots                     │
└─────────────────────────────────────────────────────────────┘
```

### Configuration

Visual regression settings are in `playwright.config.ts`:

```typescript
expect: {
  toHaveScreenshot: {
    maxDiffPixels: 100,           // Allow small differences
    maxDiffPixelRatio: 0.01,      // Max 1% different pixels
    animations: 'disabled',        // Disable animations
    caret: 'hide',                // Hide blinking cursor
    threshold: 0.2,               // Color comparison threshold
  },
},
snapshotDir: './snapshots',
snapshotPathTemplate: '{snapshotDir}/{testFileDir}/{testFileName}/{projectName}/{arg}{ext}',
```

### Writing Visual Tests

#### Full Page Screenshots

```typescript
test('login page visual', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.waitForElement(loginPage.pageTitle);

  // Wait for animations to complete
  await page.waitForTimeout(500);

  await expect(page).toHaveScreenshot('login-page.png', {
    fullPage: true,
  });
});
```

#### Component Screenshots

```typescript
test('social buttons component', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();

  // Screenshot just a specific component
  await expect(loginPage.socialButtons).toHaveScreenshot('social-buttons.png');
});
```

#### Masking Sensitive/Dynamic Content

```typescript
test('form with masked password', async ({ page }) => {
  await expect(page).toHaveScreenshot('form.png', {
    mask: [
      page.getByTestId('auth-input-password'),
      page.locator('[data-testid="timestamp"]'),
    ],
  });
});
```

#### Responsive Screenshots

```typescript
test('mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  const loginPage = new LoginPage(page);
  await loginPage.goto();

  await expect(page).toHaveScreenshot('login-mobile.png', {
    fullPage: true,
  });
});
```

### Commands

| Command                                                                   | Description             |
| ------------------------------------------------------------------------- | ----------------------- |
| `npx playwright test tests/visual/`                                       | Run visual tests        |
| `npx playwright test --update-snapshots`                                  | Update baselines        |
| `npx playwright test --update-snapshots tests/visual/auth-visual.spec.ts` | Update specific test    |
| `npx playwright show-report`                                              | View visual diff report |

### Directory Structure

```
apps/web/e2e/
├── tests/
│   └── visual/
│       └── auth-visual.spec.ts    # Visual regression tests
│
└── snapshots/                      # Baseline screenshots
    └── tests/
        └── visual/
            └── auth-visual.spec.ts/
                ├── chromium/
                │   ├── login-initial.png
                │   ├── login-email-form.png
                │   └── signup-initial.png
                ├── firefox/
                │   └── ...
                └── webkit/
                    └── ...
```

### Best Practices for Visual Testing

#### DO ✅

```typescript
// Wait for animations to complete
await page.waitForTimeout(500);

// Mask dynamic content (timestamps, random IDs)
await expect(page).toHaveScreenshot('page.png', {
  mask: [page.locator('.timestamp')],
});

// Use meaningful screenshot names
('login-email-form.png'); // ✅
('screenshot-1.png'); // ❌

// Test specific components, not just full pages
await expect(loginPage.form).toHaveScreenshot('form.png');
```

#### DON'T ❌

```typescript
// Don't screenshot without waiting
await expect(page).toHaveScreenshot(); // ❌ May catch mid-animation

// Don't include dynamic content in screenshots
await expect(page).toHaveScreenshot(); // ❌ Without masking dates/IDs

// Don't screenshot large pages without fullPage option
await expect(page).toHaveScreenshot(); // ❌ May miss below-fold content
```

### CI/CD Considerations

Visual tests in CI require consistent rendering:

```yaml
# .github/workflows/e2e.yml
- name: Run visual tests
  run: npx playwright test tests/visual/

- name: Upload diff report
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: visual-diff-report
    path: apps/web/e2e/test-results/
```

### Updating Baselines

When intentional UI changes are made:

```bash
# Update all baselines
npx playwright test --update-snapshots

# Update specific test baselines
npx playwright test --update-snapshots tests/visual/auth-visual.spec.ts

# Update for specific browser
npx playwright test --project=chromium --update-snapshots
```

**⚠️ Important**: Review updated screenshots before committing!

---

## Best Practices

### Data-TestId Conventions

All E2E selectors use `data-testid` attributes for maximum stability. Follow
these naming conventions:

#### Naming Pattern

```
[page/component]-[element-type]-[identifier]
```

#### Examples

| Element         | data-testid            | Description                  |
| --------------- | ---------------------- | ---------------------------- |
| Page container  | `login-page`           | Top-level page wrapper       |
| Page title      | `login-title`          | Main heading                 |
| Input field     | `auth-input-email`     | Email input in auth form     |
| Button          | `login-btn-email`      | "Continue with Email" button |
| Link            | `signup-link-login`    | "Already have account?" link |
| Error message   | `auth-form-error`      | Form error container         |
| Loading spinner | `auth-loading-spinner` | Loading indicator            |

#### Shared Component Prefixes

Components from `@nxt1/ui` use the `auth-` prefix:

```typescript
// @nxt1/ui/auth components
'auth-social-buttons'; // Social buttons container
'auth-btn-google'; // Google sign-in button
'auth-btn-apple'; // Apple sign-in button
'auth-btn-microsoft'; // Microsoft sign-in button
'auth-email-form'; // Email form container
'auth-input-email'; // Email input
'auth-input-password'; // Password input
'auth-submit-button'; // Form submit button
'auth-link-forgot-password'; // Forgot password link
'auth-form-error'; // Error message container
```

#### Page-Specific Prefixes

Each page uses its own prefix:

```typescript
// Login page
('login-page', 'login-title', 'login-btn-email');

// Signup page
('signup-page', 'signup-title', 'signup-input-teamcode');

// Forgot password page
('forgot-password-page', 'forgot-password-success');
```

#### Adding New Test IDs

When adding new `data-testid` attributes:

1. Follow the naming convention
2. Update the page object to use `getByTestId()`
3. Document the new ID in this section

### DO ✅

```typescript
// Use data-testid for stability
page.getByTestId('submit-button')

// Use page objects for reusability
await loginPage.login(email, password);

// Use explicit waits
await expect(element).toBeVisible();

// Group related tests
test.describe('Login', () => { ... });

// Skip tests conditionally
test.skip(!testUser.email, 'No test credentials');

// Clean up test data
test.afterEach(async () => { ... });
```

### DON'T ❌

```typescript
// Don't use arbitrary waits
await page.waitForTimeout(1000);  // ❌

// Don't use CSS selectors
page.locator('.btn-primary');  // ❌

// Don't hardcode credentials
await page.fill('#email', 'real@email.com');  // ❌

// Don't test implementation details
expect(service.internalState).toBe(...);  // ❌

// Don't share state between tests
let sharedData;  // ❌
```

### Flaky Test Prevention

1. **Use auto-waiting** - Playwright waits automatically
2. **Avoid fixed timeouts** - Use `waitFor` conditions
3. **Isolate tests** - No shared state
4. **Retry in CI** - Set `retries: 2` for CI
5. **Use traces** - Enable on first retry for debugging

---

## Troubleshooting

### Common Issues

#### "Element not found"

```typescript
// Problem: Element not loaded yet
await page.click('#button'); // ❌

// Solution: Wait for element
await page.getByTestId('button').click(); // ✅ auto-waits
```

#### "Test timeout"

```typescript
// Increase timeout for slow pages
test('slow test', async ({ page }) => {
  test.setTimeout(120_000);
  // ...
});
```

#### "Auth state not working"

```bash
# Delete cached auth state
rm -rf apps/web/e2e/.auth/

# Re-run with fresh login
npm run e2e
```

### Debug Commands

```bash
# Interactive UI mode
npm run e2e:ui

# Run with visible browser
npm run e2e:headed

# Debug with inspector
npm run e2e:debug

# View last report
npm run e2e:report
```

### Viewing Traces

When a test fails with tracing enabled:

```bash
# Open trace viewer
npx playwright show-trace test-results/trace.zip
```

---

## Commands Reference

| Command                | Description                     |
| ---------------------- | ------------------------------- |
| `npm run e2e`          | Run all E2E tests               |
| `npm run e2e:ui`       | Interactive UI mode             |
| `npm run e2e:headed`   | Run with visible browser        |
| `npm run e2e:debug`    | Debug with Playwright Inspector |
| `npm run e2e:chromium` | Run Chrome only                 |
| `npm run e2e:firefox`  | Run Firefox only                |
| `npm run e2e:webkit`   | Run Safari only                 |
| `npm run e2e:mobile`   | Run mobile viewports            |
| `npm run e2e:report`   | View HTML report                |
| `npm run e2e:install`  | Install browsers                |

---

## Adding New Tests Checklist

When adding tests for a new feature:

- [ ] Create page object in `pages/[feature]/[feature].page.ts`
- [ ] Extend `BasePage` class
- [ ] Add `data-testid` attributes to components
- [ ] Register page in `fixtures/test.fixture.ts`
- [ ] Export from `pages/index.ts`
- [ ] Create test spec in `tests/[feature]/[feature].spec.ts`
- [ ] Group tests with `describe` blocks
- [ ] Add to CI workflow if needed
