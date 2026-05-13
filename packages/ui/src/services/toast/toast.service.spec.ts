import '@angular/compiler';

import { Injector, NgZone, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastController } from '@ionic/angular/standalone';

import { HapticsService } from '../haptics';
import { NxtLoggingService } from '../logging';
import { NxtPlatformService } from '../platform';
import { NXT_USE_IONIC_TOASTS, NxtToastService } from './toast.service';

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

  it('renders the DOM toast fallback on web platforms', () => {
    const service = createToastService();

    service.success('Session archived', { duration: 0 });

    const toast = document.querySelector('.nxt-toast-shell--success');

    expect(toast?.textContent).toContain('Session archived');
  });

  it('queues additional DOM toasts while one is already visible', () => {
    const service = createToastService();

    service.success('First toast', { duration: 0 });
    service.info('Second toast', { duration: 0 });

    expect(document.querySelectorAll('.nxt-toast-shell')).toHaveLength(1);
    expect(document.querySelector('.nxt-toast-shell')?.textContent).toContain('First toast');
    expect(service.queueLength()).toBe(1);
  });

  it('keeps the DOM toast on web even when Ionic providers are available', async () => {
    const create = vi.fn().mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(true),
      onDidDismiss: vi.fn().mockResolvedValue(undefined),
    });

    const service = createToastService({
      platform: {
        isBrowser: () => true,
        isNative: () => false,
        isMobile: () => true,
      },
      toastController: { create },
    });

    service.success('Web mobile viewport', { duration: 0 });
    await Promise.resolve();

    expect(create).not.toHaveBeenCalled();
    expect(document.querySelector('.nxt-toast-shell--success')?.textContent).toContain(
      'Web mobile viewport'
    );
  });

  it('uses Ionic ToastController when the mobile app enables Ionic toasts', async () => {
    const create = vi.fn().mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
      dismiss: vi.fn().mockResolvedValue(true),
      onDidDismiss: vi.fn().mockResolvedValue(undefined),
    });

    const service = createToastService({
      platform: {
        isBrowser: () => true,
        isNative: () => false,
        isMobile: () => false,
      },
      toastController: { create },
      useIonicToasts: true,
    });

    service.success('Saved successfully');
    await Promise.resolve();

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Saved successfully',
        cssClass: expect.arrayContaining(['nxt-toast', 'nxt-toast-success']),
      })
    );
    expect(document.querySelector('.nxt-toast-shell')).toBeNull();
  });

  it('falls back to DOM toast when Ionic toast presentation fails', async () => {
    const create = vi.fn().mockRejectedValue(new Error('overlay failed'));

    const service = createToastService({
      platform: {
        isBrowser: () => true,
        isNative: () => true,
        isMobile: () => true,
      },
      toastController: { create },
      useIonicToasts: true,
    });

    service.error('Offline mode');
    await Promise.resolve();
    await Promise.resolve();

    expect(create).toHaveBeenCalled();
    expect(document.querySelector('.nxt-toast-shell--error')?.textContent).toContain(
      'Offline mode'
    );
  });
});

function createToastService(options?: {
  platform?: {
    isBrowser: () => boolean;
    isNative: () => boolean;
    isMobile: () => boolean;
  };
  toastController?: Pick<ToastController, 'create'>;
  useIonicToasts?: boolean;
}): NxtToastService {
  const platform = options?.platform ?? {
    isBrowser: () => true,
    isNative: () => false,
    isMobile: () => false,
  };

  const injector = Injector.create({
    providers: [
      {
        provide: NxtPlatformService,
        useValue: platform,
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
            error: vi.fn(),
          }),
        },
      },
      {
        provide: ToastController,
        useValue: options?.toastController ?? null,
      },
      {
        provide: NXT_USE_IONIC_TOASTS,
        useValue: options?.useIonicToasts ?? false,
      },
      { provide: NgZone, useValue: { run: (callback: () => void) => callback() } },
    ],
  });

  return runInInjectionContext(injector, () => new NxtToastService());
}
