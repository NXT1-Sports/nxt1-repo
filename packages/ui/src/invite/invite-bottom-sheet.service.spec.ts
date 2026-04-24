import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync(
  fileURLToPath(new URL('./invite-bottom-sheet.service.ts', import.meta.url)),
  'utf8'
);

describe('InviteBottomSheetService browser presentation guard', () => {
  it('keeps the native app bottom sheet path intact', () => {
    expect(serviceSource).toContain('return this.platform.isNative();');
  });

  it('supports a web overlay path for browser invite flows', () => {
    expect(serviceSource).toContain('private readonly overlay = inject(NxtOverlayService);');
    expect(serviceSource).toContain('component: InviteShellComponent');
  });
});
