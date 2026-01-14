# E2E Testing Guide

This directory contains end-to-end tests for the NXT1 web application using
Playwright.

## 📁 Directory Structure

```
e2e/
├── playwright.config.ts    # Playwright configuration
├── tsconfig.json           # TypeScript configuration for E2E
├── .env.example            # Environment variables template
├── global.setup.ts         # Authentication setup (runs before tests)
├── global.teardown.ts      # Cleanup (runs after tests)
├── fixtures/
│   ├── index.ts            # Barrel export
│   └── test.fixture.ts     # Custom test fixtures with page objects
├── pages/
│   ├── index.ts            # Barrel export
│   ├── base.page.ts        # Base page object class
│   └── auth/
│       ├── index.ts        # Auth pages export
│       ├── login.page.ts   # Login page object
│       ├── signup.page.ts  # Signup page object
│       └── forgot-password.page.ts
├── tests/
│   └── auth/
│       ├── login.spec.ts   # Login tests
│       ├── signup.spec.ts  # Signup tests
│       └── forgot-password.spec.ts
└── utils/
    ├── index.ts            # Barrel export
    ├── test-helpers.ts     # Common test utilities
    ├── environment.ts      # Environment configuration
    └── test-data.ts        # Test data constants
```

## 🚀 Quick Start

### 1. Install Playwright

```bash
cd apps/web
npm install -D @playwright/test@latest
npx playwright install
```

### 2. Configure Environment

```bash
# Copy environment template
cp e2e/.env.example e2e/.env

# Edit with your test credentials
nano e2e/.env
```

### 3. Run Tests

```bash
# Run all tests
npx playwright test

# Run specific browser
npx playwright test --project=chromium

# Run specific test file
npx playwright test tests/auth/login.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# Run headed (visible browser)
npx playwright test --headed

# Debug mode
npx playwright test --debug
```

## 📝 Writing New Tests

### 1. Create a Page Object

Page objects encapsulate selectors and actions for a page:

```typescript
// pages/profile/profile.page.ts
import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';

export class ProfilePage extends BasePage {
  readonly url = '/profile';

  // Define selectors
  readonly displayName: Locator;
  readonly bioInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.displayName = page.getByTestId('display-name');
    this.bioInput = page.getByTestId('bio-input');
    this.saveButton = page.getByRole('button', { name: /save/i });
  }

  // Define actions
  async updateBio(bio: string): Promise<void> {
    await this.bioInput.fill(bio);
    await this.saveButton.click();
  }
}
```

### 2. Register in Fixtures

Add the page object to `fixtures/test.fixture.ts`:

```typescript
import { ProfilePage } from '../pages/profile/profile.page';

export interface TestFixtures {
  // ... existing fixtures
  profilePage: ProfilePage;
}

export const test = base.extend<TestFixtures>({
  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },
});
```

### 3. Write Tests

```typescript
// tests/profile/profile.spec.ts
import { test, expect } from '../../fixtures';

test.describe('Profile Page', () => {
  test('should update bio', async ({ profilePage }) => {
    await profilePage.gotoAndVerify();
    await profilePage.updateBio('New bio text');
    // assertions...
  });
});
```

## 🎯 Best Practices

### Selectors

Use stable selectors in order of preference:

1. `data-testid` attributes (most stable)
2. ARIA roles: `getByRole('button', { name: /submit/i })`
3. Text content: `getByText('Submit')`
4. CSS selectors (last resort)

**Add test IDs to components:**

```html
<button data-testid="submit-button">Submit</button>
```

### Test Isolation

Each test should be independent:

```typescript
test.beforeEach(async ({ page }) => {
  // Start fresh for each test
  await page.goto('/auth/login');
});
```

### Assertions

Use Playwright's built-in assertions:

```typescript
// Good - auto-waits and retries
await expect(page).toHaveURL('/home');
await expect(locator).toBeVisible();
await expect(locator).toHaveText('Welcome');

// Avoid - doesn't auto-wait
expect(page.url()).toBe('/home');
```

### Waiting

Let Playwright handle waiting:

```typescript
// Good - Playwright waits automatically
await button.click();
await expect(result).toBeVisible();

// Avoid - explicit waits
await page.waitForTimeout(1000); // ❌
```

## 🔧 Configuration

### Environment Variables

| Variable                 | Description                      | Default                 |
| ------------------------ | -------------------------------- | ----------------------- |
| `E2E_BASE_URL`           | Application URL                  | `http://localhost:4200` |
| `E2E_TEST_USER_EMAIL`    | Test user email                  | -                       |
| `E2E_TEST_USER_PASSWORD` | Test user password               | -                       |
| `E2E_ENV`                | Environment (local/staging/prod) | `local`                 |

### Running Against Different Environments

```bash
# Local (default)
npx playwright test

# Staging
E2E_BASE_URL=https://staging.nxt1.com npx playwright test

# Production (be careful!)
E2E_ENV=production npx playwright test
```

## 📊 Reports

### View HTML Report

```bash
npx playwright show-report
```

### CI Reports

Reports are automatically:

- Uploaded as GitHub Actions artifacts
- Published to GitHub Pages (main branch)
- Linked in PR comments

## 🐛 Debugging

### Debug Mode

```bash
npx playwright test --debug
```

### UI Mode

```bash
npx playwright test --ui
```

### Trace Viewer

```bash
npx playwright show-trace trace.zip
```

### Screenshots on Failure

Screenshots are automatically captured on test failure and saved to
`test-results/`.

## 🔄 CI/CD Integration

Tests run automatically on:

- Push to `main` or `develop`
- Pull requests to `main` or `develop`
- Manual workflow dispatch

### Required Secrets

Add these secrets to GitHub repository:

- `E2E_TEST_USER_EMAIL`
- `E2E_TEST_USER_PASSWORD`

## 📚 Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [CI/CD Integration](https://playwright.dev/docs/ci-intro)
