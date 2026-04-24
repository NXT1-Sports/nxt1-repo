import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync(
  fileURLToPath(new URL('./manage-team-modal.service.ts', import.meta.url)),
  'utf8'
);

const webModalSource = readFileSync(
  fileURLToPath(new URL('./manage-team-web-modal.component.ts', import.meta.url)),
  'utf8'
);

describe('ManageTeamModalService browser presentation guard', () => {
  it('does not route mobile web browsers through the bottom sheet heuristics', () => {
    expect(serviceSource).not.toContain('if (viewportWidth < 768)');
    expect(serviceSource).not.toContain('if (hasTouch && viewportWidth < 1024)');
  });

  it('keeps the native app bottom sheet path intact', () => {
    expect(serviceSource).toContain('return this.platform.isNative();');
  });

  it('keeps the browser modal title short and disables wide layout on narrow screens', () => {
    expect(webModalSource).toContain(
      "protected readonly modalTitle = computed(() => 'Manage Team');"
    );
    expect(webModalSource).toContain('[webLayout]="useWideLayout()"');
  });

  it('forwards the requested starting section through the web modal path', () => {
    expect(serviceSource).toContain('initialSection: options.initialSection ?? undefined');
    expect(webModalSource).toContain('[initialSection]="initialSection()"');
  });
});
