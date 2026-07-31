import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve relative to this spec file so tests work regardless of cwd (monorepo root vs backend/).
const __specDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__specDir, '../../../..');

const boundaryFiles = [
  'src/modules/billing/budget.service.ts',
  'src/modules/billing/usage-deduction.service.ts',
  'src/modules/billing/webhook.service.ts',
  'src/routes/auth/onboarding.routes.ts',
];

describe('domain event architecture boundary', () => {
  it('keeps core billing and onboarding entry points free of direct marketing outbox imports', () => {
    for (const relativePath of boundaryFiles) {
      const fileContents = readFileSync(resolve(backendRoot, relativePath), 'utf8');
      expect(fileContents).not.toContain('/services/marketing/outbox/marketing-outbox.service');
      expect(fileContents).not.toContain('/services/marketing/lifecycle/');
    }
  });
});
