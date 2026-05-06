import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeTrackMock = vi.fn().mockResolvedValue(undefined);
const dispatchMock = vi
  .fn()
  .mockResolvedValue({ activityId: 'activity_1', notificationId: 'push_1' });

vi.mock('../../services/core/analytics-logger.service.js', () => ({
  getAnalyticsLoggerService: () => ({
    safeTrack: safeTrackMock,
  }),
}));

vi.mock('../../services/communications/notification.service.js', () => ({
  dispatch: dispatchMock,
}));

const { default: analyticsRoutes } = await import('../analytics/index.js');

describe('Analytics tracker attribution', () => {
  const app = express();

  app.use((req, _res, next) => {
    req.firebase = {
      db: { batch: vi.fn() } as never,
      auth: {} as never,
      storage: {} as never,
    };
    next();
  });

  app.use('/api/v1/analytics', analyticsRoutes);

  beforeEach(() => {
    safeTrackMock.mockClear();
    dispatchMock.mockClear();
  });

  it('tracks open events with hash-only recipient attribution', async () => {
    const recipientEmailHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const response = await request(app).get(
      `/api/v1/analytics/track/open?subjectId=user_1&recipientEmailHash=${recipientEmailHash}`
    );

    expect(response.status).toBe(200);
    expect(safeTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'email_opened',
        source: 'user',
        metadata: expect.objectContaining({
          recipientEmailHash,
          attributionConfidence: 'known-recipient',
        }),
      })
    );
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('ignores legacy recipientEmail query param for attribution', async () => {
    const response = await request(app).get(
      '/api/v1/analytics/track/open?subjectId=user_1&recipientEmail=coach%40example.com'
    );

    expect(response.status).toBe(200);
    expect(safeTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          recipientEmailHash: null,
          attributionConfidence: 'anonymous',
        }),
      })
    );
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('tracks click redirects with hash-only recipient attribution', async () => {
    const recipientEmailHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const response = await request(app).get(
      `/api/v1/analytics/track/click?subjectId=user_1&destination=https%3A%2F%2Fexample.com&recipientEmailHash=${recipientEmailHash}`
    );

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('https://example.com/');
    expect(safeTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'link_clicked',
        metadata: expect.objectContaining({
          recipientEmailHash,
          attributionConfidence: 'known-recipient',
        }),
      })
    );
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('dispatches a push notification for tracked email opens', async () => {
    const recipientEmailHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

    const response = await request(app).get(
      `/api/v1/analytics/track/open?subjectId=user_1&subjectType=user&surface=email&sourceRecordId=track_123&recipientEmailHash=${recipientEmailHash}`
    );

    expect(response.status).toBe(200);
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user_1',
        type: 'email_opened',
        deepLink: '/analytics',
        data: expect.objectContaining({
          sourceRecordId: 'track_123',
          recipientEmailHash,
          eventType: 'email_opened',
        }),
      })
    );
  });

  it('dispatches a deduped push notification for tracked email link clicks', async () => {
    const response = await request(app).get(
      '/api/v1/analytics/track/click?subjectId=user_1&subjectType=user&surface=email&sourceRecordId=track_456&destination=https%3A%2F%2Fexample.com%2Foffer'
    );

    expect(response.status).toBe(302);
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user_1',
        type: 'link_clicked',
        idempotencyKey: expect.stringContaining('email-engagement:link_clicked:user_1:track_456'),
        data: expect.objectContaining({
          destinationUrl: 'https://example.com/offer',
          normalizedUrl: 'https://example.com/offer',
        }),
      })
    );
  });
});
