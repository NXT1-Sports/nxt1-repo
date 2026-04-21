// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const deepLinkSource = readFileSync(
  fileURLToPath(new URL('./deep-link.service.ts', import.meta.url)),
  'utf8'
);

const teamPageSource = readFileSync(
  fileURLToPath(new URL('../../../features/team/team.page.ts', import.meta.url)),
  'utf8'
);

describe('mobile share and deep-link hardening', () => {
  it('supports the canonical profile and team deep-link routes', () => {
    expect(deepLinkSource).toContain("route: '/profile/:sport/:name/:unicode'");
    expect(deepLinkSource).toContain("route: '/team/:slug/:teamCode'");
  });

  it('normalizes both current and legacy app URL schemes', () => {
    expect(deepLinkSource).toContain("'nxt1://'");
    expect(deepLinkSource).toContain("'nxt1sports://'");
    expect(deepLinkSource).toContain("'com.nxt1sports.app.twa://'");
  });

  it('routes the team copy-link action through the real copy handler', () => {
    expect(teamPageSource).toContain("case 'Copy Link':\n        await this.onCopyLink();");
  });
});
