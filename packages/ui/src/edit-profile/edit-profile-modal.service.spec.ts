import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync(
  fileURLToPath(new URL('./edit-profile-modal.service.ts', import.meta.url)),
  'utf8'
);

const webModalSource = readFileSync(
  fileURLToPath(new URL('./edit-profile-web-modal.component.ts', import.meta.url)),
  'utf8'
);

const shellSource = readFileSync(
  fileURLToPath(new URL('./edit-profile-shell.component.ts', import.meta.url)),
  'utf8'
);

describe('EditProfileModalService browser presentation guard', () => {
  it('does not route mobile web browsers through the bottom sheet heuristics', () => {
    expect(serviceSource).not.toContain('if (viewportWidth < 768)');
    expect(serviceSource).not.toContain('if (hasTouch && viewportWidth < 1024)');
  });

  it('keeps the native app bottom sheet path intact', () => {
    expect(serviceSource).toContain('return this.platform.isNative();');
  });

  it('keeps the web modal body stretched so the profile content is visible', () => {
    expect(webModalSource).toContain('nxt1-edit-profile-shell {');
    expect(webModalSource).toContain('flex: 1 1 auto;');
    expect(webModalSource).toContain('min-height: 0;');
  });

  it('uses a plain scroll container for the web overlay instead of ion-content', () => {
    expect(shellSource).not.toContain('<ion-content class="nxt1-edit-content">');
    expect(shellSource).toContain('<div class="nxt1-edit-content">');
  });
});
