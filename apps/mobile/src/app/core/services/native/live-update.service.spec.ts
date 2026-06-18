// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const liveUpdateSource = readFileSync(
  fileURLToPath(new URL('./live-update.service.ts', import.meta.url)),
  'utf8'
);

describe('LiveUpdateService first-install OTA behavior', () => {
  it('applies eligible first-launch OTA bundles immediately, including on cellular', () => {
    expect(liveUpdateSource).toContain(
      'const forceImmediateOnFirstLaunch = !(await this.hasHandledFirstLaunch());'
    );
    expect(liveUpdateSource).toContain('immediate: forceImmediateOnFirstLaunch');
    expect(liveUpdateSource).toContain('requireWifi: !forceImmediateOnFirstLaunch');
    expect(liveUpdateSource).toContain("return 'applied';");
  });

  it('does not consume the first-launch immediate path after a transient check failure', () => {
    expect(liveUpdateSource).toContain("result.status !== 'error'");
    expect(liveUpdateSource).not.toContain('finally {\n      if (forceImmediateOnFirstLaunch)');
    expect(liveUpdateSource).not.toContain(
      'failureCount: 0,\n          },\n          { firstLaunchHandled: true }'
    );
  });
});
