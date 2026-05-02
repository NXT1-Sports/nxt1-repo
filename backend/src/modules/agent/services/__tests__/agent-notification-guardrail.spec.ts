import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICES_DIR = fileURLToPath(new URL('../', import.meta.url));
const TRIGGERS_DIR = fileURLToPath(new URL('../../triggers/', import.meta.url));

function walkTsFiles(rootDir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(rootDir);

  for (const entry of entries) {
    const fullPath = join(rootDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      results.push(...walkTsFiles(fullPath));
      continue;
    }

    if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('agent notification dispatch guardrail', () => {
  it('prevents direct NotificationService.dispatch imports outside adapter', () => {
    const files = [...walkTsFiles(SERVICES_DIR), ...walkTsFiles(TRIGGERS_DIR)];
    const violations: string[] = [];

    for (const filePath of files) {
      if (filePath.endsWith('agent-push-adapter.service.ts') || filePath.includes('__tests__')) {
        continue;
      }

      const source = readFileSync(filePath, 'utf-8');
      const importsNotificationService =
        source.includes('services/communications/notification.service') ||
        source.includes('services/communications/notification.service.js');

      if (importsNotificationService) {
        violations.push(filePath);
      }
    }

    expect(violations).toEqual([]);
  });
});
