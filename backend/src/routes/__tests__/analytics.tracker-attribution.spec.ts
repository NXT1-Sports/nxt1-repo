import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeTrackMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/core/analytics-logger.service.js', () => ({
  getAnalyticsLoggerService: () => ({
    safeTrack: safeTrackMock,
  }),
}));

const { default: analyticsRoutes } = await import('../analytics/index.js');

describe('Analytics tracker attribution', () => {
  const app = express();
  app.use('/api/v1/analytics', analyticsRoutes);

  beforeEach(() => {
    safeTrackMock.mockClear();
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
  });
});
