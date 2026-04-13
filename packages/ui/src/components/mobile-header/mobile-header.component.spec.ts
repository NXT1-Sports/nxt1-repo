import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  fileURLToPath(new URL('./mobile-header.component.ts', import.meta.url)),
  'utf8'
);

describe('NxtMobileHeaderComponent template wiring', () => {
  it('uses the shared avatar component for authenticated user rendering', () => {
    expect(componentSource).toContain('<nxt1-avatar');
    expect(componentSource).toContain('[src]="user()!.profileImg"');
    expect(componentSource).toContain('[name]="user()!.name"');
    expect(componentSource).toContain('[initials]="user()!.initials"');
    expect(componentSource).toContain('[isTeamRole]="user()!.isTeamRole ?? false"');
  });

  it('does not keep the legacy raw initials fallback markup', () => {
    expect(componentSource).not.toContain("{{ user()!.initials || 'U' }}");
    expect(componentSource).not.toContain('mobile-header__avatar-initials');
  });
});
