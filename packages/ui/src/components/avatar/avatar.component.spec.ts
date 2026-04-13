import '@angular/compiler';

import { Injector, PLATFORM_ID, SimpleChange, runInInjectionContext } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';

import { NxtAvatarComponent } from './avatar.component';
import { HapticsService } from '../../services/haptics';

describe('NxtAvatarComponent', () => {
  it('updates from initials fallback to team icon when team-role input arrives later', () => {
    const component = createComponent();

    component.name = 'Alcoa 1';
    component.initials = 'A1';
    component.src = null;
    component.ngOnChanges({
      name: new SimpleChange(undefined, component.name, true),
      initials: new SimpleChange(undefined, component.initials, true),
      src: new SimpleChange(undefined, component.src, true),
    });

    expect(component.showInitials()).toBe(true);
    expect(component.showDefaultIcon()).toBe(false);

    component.isTeamRole = true;
    component.ngOnChanges({
      isTeamRole: new SimpleChange(false, true, false),
    });

    expect(component.showInitials()).toBe(false);
    expect(component.showDefaultIcon()).toBe(true);
  });

  it('recomputes size-derived values when size inputs change after first read', () => {
    const component = createComponent();

    component.size = 'md';
    component.ngOnChanges({
      size: new SimpleChange(undefined, 'md', true),
    });

    expect(component.sizeInPx()).toBe(40);

    component.customSize = 72;
    component.ngOnChanges({
      customSize: new SimpleChange(undefined, 72, false),
    });

    expect(component.sizeInPx()).toBe(72);
    expect(component.fontSizeInPx()).toBe(25);
  });
});

function createComponent(): NxtAvatarComponent {
  const injector = Injector.create({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      {
        provide: HapticsService,
        useValue: {
          impact: vi.fn().mockResolvedValue(undefined),
        },
      },
    ],
  });

  return runInInjectionContext(injector, () => new NxtAvatarComponent());
}
