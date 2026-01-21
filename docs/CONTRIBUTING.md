# Contributing to NXT1

Thank you for your interest in contributing to the NXT1 platform! We are
building the next generation of sports recruiting technology, and your
contributions help us maintain a high standard of engineering excellence.

This document outlines the standards and workflows required for contributing to
this monorepo.

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing Strategy](#testing-strategy)
6. [Submission Guidelines](#submission-guidelines)

---

## Code of Conduct

We expect all contributors to adhere to professional standards of conduct.

- **Be Respectful**: Treat all team members and contributors with respect.
- **Be Collaborative**: Accept constructive feedback and offer it kindly.
- **Be Professional**: Maintain a professional tone in all code comments, commit
  messages, and documentation.

---

## Getting Started

### Prerequisites

Ensure your development environment meets these requirements:

- **Node.js**: v20.0.0 or higher
- **npm**: v10.0.0 or higher
- **Git**: Latest stable version
- **Firebase CLI**: `npm install -g firebase-tools`
- **Native Tools** (for mobile):
  - Xcode (iOS)
  - Android Studio (Android)

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/nxt1/nxt1-monorepo.git
   cd nxt1-monorepo
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

   _Note: We use NPM workspaces and Turborepo. Do not use `yarn` or `pnpm`._

3. **Environment Setup:** Copy `.env.example` to `.env` in the relevant
   package/app directories and populate the required API keys.

---

## Development Workflow

### Branching Strategy

We follow a strict branching model:

- **`main`**: Production-ready code. Protected branch. Triggers production
  deployments.
- **`develop`**: Integration branch for the next release. Staging environment.
- **`feat/feature-name`**: For new features.
- **`fix/issue-description`**: For bug fixes.
- **`refactor/description`**: For code restructuring.
- **`chore/maintenance`**: For tooling/config updates.
- **`docs/description`**: For documentation updates.

### Commit Messages

We adhere to the [Conventional Commits](https://www.conventionalcommits.org/)
specification using `commitlint`.

**Format:** `<type>(<scope>): <subject>`

**Allowed Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Formatting, semicolons, etc.
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding missing tests
- `build`: Changes to build process
- `ci`: CI configuration
- `chore`: Other changes that don't modify src or test
- `revert`: Reverts a previous commit

**Example:**

```text
feat(auth): implement apple sign-in for mobile
fix(api): handle timeout in profile service
docs(readme): update deployment instructions
```

---

## Coding Standards

**CRITICAL**: All code must strictly follow the architecture patterns defined in
`docs/ARCHITECTURE.md`.

### 1. Angular & UI Patterns

- **Standalone Components**: All new components must be standalone.
- **Signals**: Use Signals for state management; avoid `BehaviorSubject` for new
  local state.
- **`@nxt1/core` First**: Type definitions, validations, and API factories MUST
  reside in `packages/core`.
- **`@nxt1/ui` Shared**: Reusable UI components must go to `packages/ui` for
  cross-platform sharing.

### 2. Mobile Compatibility

- Do NOT use DOM APIs (`window`, `localStorage`) directly in services or core
  logic.
- Use `NxtPlatformService` or Dependency Injection tokens for platform-specific
  implementations.

### 3. Code Quality

- **Type Safety**: Strictly typed TypeScript. No `any` without explicit
  justification in comments.
- **Linting**: Code must pass ESLint configuration defined in `@nxt1/config`.
- **Formatting**: Run `npm run format` before committing.

---

## Testing Strategy

We employ a comprehensive testing pyramid strategy. (See `docs/E2E-TESTING.md`)

- **Unit Tests** (`.spec.ts`): Required for all business logic, pipes, and
  services.
- **Component Tests**: Required for complex UI interactions.
- **E2E Tests** (Playwright): Required for critical user flows (Auth, Payments,
  Core Features).

**Running Tests:**

```bash
# Unit tests (all packages)
npm run test

# Unit tests with coverage
npm run test:coverage

# E2E tests (Playwright)
npm run e2e

# E2E with UI mode
npm run e2e:ui

# E2E in headed mode (visible browser)
npm run e2e:headed
```

### Git Hooks (Husky)

We use Husky to enforce quality standards before commits:

- **`pre-commit`**: Runs `lint-staged` to lint and format only staged files
- **`commit-msg`**: Validates commit messages against Conventional Commits using
  `commitlint`

**Bypassing Hooks (Emergency Only):**

```bash
git commit --no-verify -m "fix: emergency hotfix"
```

_Note: Bypassing hooks is strongly discouraged. Use only for critical production
issues._

---

## Submission Guidelines

### Pull Requests (PR)

1. **Title**: Use the conventional commit format (e.g.,
   `feat(auth): add biometric login`).
2. **Description**: Clear summary of changes, motivation, and context.
3. **Type of Change**: Mark the relevant category (bug fix, feature, breaking
   change, etc.).
4. **Affected Packages**: Indicate which packages are modified (`@nxt1/web`,
   `@nxt1/mobile`, etc.).
5. **Checklist** (from PR template):
   - [ ] Code follows style guidelines
   - [ ] Self-review performed
   - [ ] Tests added/updated and passing
   - [ ] Documentation updated if needed
   - [ ] No new warnings generated
   - [ ] Tested on web (and mobile if applicable)

### Code Review Process

- All PRs require at least **one approval** from a maintainer.
- The **CI pipeline** must pass:
  - ✅ Lint & Format check
  - ✅ Type checking
  - ✅ Unit tests
  - ✅ Build succeeds
  - ✅ E2E tests (if web/mobile changes)
- Address all unresolved comments before merging.
- PRs targeting `main` require additional review and testing.

---

**Thank you for contributing to NXT1!**
