# Testing Firebase Cloud Functions Locally

## Quick Start

### Option 1: Unit Tests (Recommended for fast iteration)

```bash
cd apps/functions

# Create a test file
touch src/auth/__tests__/beforeUserCreate.spec.ts

# Run tests
npm run test
```

### Option 2: Firebase Emulator (Full integration)

```bash
cd apps/functions

# Start emulator (requires Docker or Java installed)
npm run serve

# Emulator UI: http://localhost:4000
# Functions at: http://localhost:5001/{project-id}/{region}/{function-name}
```

### Option 3: Interactive Shell (Quick manual testing)

```bash
cd apps/functions

# Start Firebase functions shell
npm run shell

# Inside shell, call functions:
> const result = await beforeUserCreate({data: {uid: "test123", email: "test@example.com"}})
> console.log(result)
```

---

## Unit Testing with firebase-functions-test

### Test Template: Callable Function

```typescript
// src/util/__tests__/validateEmail.spec.ts
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions-test';
import { validateEmail } from '../validateEmail';

const testEnv = functions();

let wrapped: any;

beforeAll(() => {
  // Wrap the callable function for testing
  wrapped = testEnv.wrap(validateEmail);
});

describe('validateEmail', () => {
  it('should reject invalid email strings', async () => {
    const req = {
      data: { email: 'not-an-email' },
    };

    const result = await wrapped(req);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Invalid email format');
  });

  it('should allow valid emails', async () => {
    const req = {
      data: { email: 'test12345@example.com' },
    };

    const result = await wrapped(req);
    expect(result.valid).toBe(true);
  });
});
```

### Test Template: Firestore Trigger

```typescript
// src/user/__tests__/onUserProfileUpdated.spec.ts
import * as functions from 'firebase-functions';
import { onUserProfileUpdated } from '../onUserProfileUpdated';

describe('onUserProfileUpdated', () => {
  it('should update search index when profile changes', async () => {
    const beforeSnap = {
      data: () => ({ name: 'Old Name', bio: '' }),
    };

    const afterSnap = {
      data: () => ({ name: 'New Name', bio: 'Updated bio' }),
      ref: { update: jest.fn() },
    };

    const change = functions.change(beforeSnap, afterSnap);

    await onUserProfileUpdated(change);

    expect(afterSnap.ref.update).toHaveBeenCalledWith(
      expect.objectContaining({
        searchIndex: expect.any(Array),
      })
    );
  });
});
```

---

## Emulator Environment Variables

Create `.env.emulator` (if needed):

```env
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

---

## Debugging Functions

### Option 1: Run in Watch Mode

```bash
npm run build:watch

# In another terminal:
npm run shell
```

Then you can call functions interactively and add `console.log` statements.

### Option 2: VSCode Debugger

Add `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Firebase Functions",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/firebase",
      "args": ["emulators:start", "--only", "functions"],
      "console": "integratedTerminal",
      "cwd": "${workspaceFolder}"
    }
  ]
}
```

Then press F5 to debug.

### Option 3: View Function Logs

```bash
# Stream logs from deployed functions
npm run logs

# Or view emulator logs:
# http://localhost:4000/logs
```

---

## CI/CD Testing

In GitHub Actions:

```yaml
- name: Test Functions
  run: |
    cd apps/functions
    npm run build
    npm run typecheck
    npm run lint
    npm run test  # if you add jest/vitest
```

---

## Next Steps

1. **Add vitest to package.json** for faster testing:

   ```bash
   npm install --save-dev vitest @vitest/ui
   ```

2. **Create test files** for each module (auth, user, util, etc.)

3. **Run emulator** locally to test triggers and HTTP endpoints

4. **Deploy to staging** first before production
