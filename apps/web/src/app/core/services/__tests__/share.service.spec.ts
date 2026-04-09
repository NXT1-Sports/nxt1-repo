import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { ShareService } from '../web/share.service';
import { ANALYTICS_ADAPTER } from '@nxt1/ui/services/analytics/analytics-adapter.token';
import { NxtLoggingService } from '@nxt1/ui/services/logging';
import { NxtToastService } from '@nxt1/ui/services/toast';
import { FIREBASE_EVENTS } from '@nxt1/core/analytics';

const createNavigator = (overrides: Partial<Navigator> = {}): Navigator =>
  ({
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  }) as unknown as Navigator;

describe('ShareService (web)', () => {
  const analytics = { trackEvent: vi.fn() };
  const toast = { success: vi.fn(), error: vi.fn() };
  const logger = {
    child: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  };

  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ShareService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: ANALYTICS_ADAPTER, useValue: analytics },
        { provide: NxtToastService, useValue: toast },
        { provide: NxtLoggingService, useValue: logger },
      ],
    });

    Object.defineProperty(globalThis, 'navigator', {
      value: createNavigator({
        share: vi.fn().mockResolvedValue(undefined),
      }),
      configurable: true,
    });
  });

  afterEach(() => {
    analytics.trackEvent.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();

    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
      });
    } else {
      // @ts-expect-error navigator may not exist in test env
      delete globalThis.navigator;
    }
  });

  it('tracks share event when native share succeeds', async () => {
    const service = TestBed.inject(ShareService);

    await service.shareContent({
      type: 'post',
      id: 'post_1',
      title: 'Test Post',
      description: 'Test description',
    });

    expect(analytics.trackEvent).toHaveBeenCalledWith(FIREBASE_EVENTS.SHARE, {
      method: 'native_share',
      content_type: 'post',
      item_id: 'post_1',
    });
  });

  it('tracks share event when clipboard fallback succeeds', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: createNavigator(),
      configurable: true,
    });

    const service = TestBed.inject(ShareService);

    await service.shareContent({
      type: 'team',
      id: 'team_1',
      title: 'Test Team',
      description: 'Team description',
    });

    expect(analytics.trackEvent).toHaveBeenCalledWith(FIREBASE_EVENTS.SHARE, {
      method: 'copy_link',
      content_type: 'team',
      item_id: 'team_1',
    });
  });
});
