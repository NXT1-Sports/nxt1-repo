import { describe, it, beforeEach, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ShareService } from '../share.service';
import { ANALYTICS_ADAPTER } from '@nxt1/ui';
import { FIREBASE_EVENTS } from '@nxt1/core/analytics';
import { Platform, ToastController } from '@ionic/angular/standalone';

const createToastController = () => ({
  create: vi.fn().mockResolvedValue({ present: vi.fn() }),
});

describe('ShareService (mobile)', () => {
  const analytics = { trackEvent: vi.fn() };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ShareService,
        { provide: ANALYTICS_ADAPTER, useValue: analytics },
        { provide: Platform, useValue: { is: vi.fn().mockReturnValue(false) } },
        { provide: ToastController, useValue: createToastController() },
      ],
    });
  });

  it('tracks share event when share completes', async () => {
    const service = TestBed.inject(ShareService);

    vi.spyOn(service, 'shareCustom').mockResolvedValue({
      completed: true,
      activityType: 'clipboard',
    });

    await service.shareContent({
      type: 'profile',
      id: 'profile_1',
      title: 'Test Profile',
      description: 'Profile description',
    });

    expect(analytics.trackEvent).toHaveBeenCalledWith(FIREBASE_EVENTS.SHARE, {
      method: 'copy_link',
      content_type: 'profile',
      item_id: 'profile_1',
    });
  });
});
