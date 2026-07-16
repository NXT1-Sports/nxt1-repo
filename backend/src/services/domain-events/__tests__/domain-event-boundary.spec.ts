import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const boundaryFiles = [
  'src/modules/billing/budget.service.ts',
  'src/modules/billing/usage-deduction.service.ts',
  'src/modules/billing/webhook.service.ts',
  'src/routes/auth/onboarding.routes.ts',
];

describe('domain event architecture boundary', () => {
  it('keeps core billing and onboarding entry points free of direct marketing outbox imports', () => {
    for (const relativePath of boundaryFiles) {
      const fileContents = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(fileContents).not.toContain('/services/marketing/outbox/marketing-outbox.service');
      expect(fileContents).not.toContain('/services/marketing/lifecycle/');
    }
  });
});
