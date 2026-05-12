import '@angular/compiler';

import { Injector, NgZone, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HapticsService } from '../haptics';
import { NxtLoggingService } from '../logging';
import { NxtPlatformService } from '../platform';
import { NxtToastService } from './toast.service';

describe('NxtToastService', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    document.getElementById('nxt1-toast-runtime-styles')?.remove();
  });

  it('injects the runtime DOM toast styles before showing a toast', () => {
    const service = createToastService();

    service.success('Session archived', { duration: 0 });

    const runtimeStyles = document.getElementById('nxt1-toast-runtime-styles');
    const toast = document.querySelector('.nxt-toast-shell--success');

    expect(runtimeStyles?.textContent).toContain('.nxt-toast-shell');
    expect(toast?.textContent).toContain('Session archived');
    expect(toast?.classList.contains('nxt-toast-shell--visible')).toBe(true);
  });

  it('does not duplicate runtime style tags across multiple toasts', () => {
    const service = createToastService();

    service.success('First toast', { duration: 0 });
    service.info('Second toast', { duration: 0 });

    expect(document.querySelectorAll('#nxt1-toast-runtime-styles')).toHaveLength(1);
  });
});

function createToastService(): NxtToastService {
  const injector = Injector.create({
    providers: [
      {
        provide: NxtPlatformService,
        useValue: {
          isBrowser: () => true,
          isNative: () => false,
          isMobile: () => false,
        },
      },
      {
        provide: HapticsService,
        useValue: {
          impact: vi.fn().mockResolvedValue(undefined),
          notification: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: NxtLoggingService,
        useValue: {
          child: () => ({
            debug: vi.fn(),
          }),
        },
      },
      { provide: NgZone, useValue: { run: (callback: () => void) => callback() } },
    ],
  });

  return runInInjectionContext(injector, () => new NxtToastService());
}
