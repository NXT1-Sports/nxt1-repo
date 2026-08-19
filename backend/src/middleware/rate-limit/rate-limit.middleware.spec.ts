import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_CONFIGS } from './rate-limit.config.js';
import { uploadRateLimit } from './rate-limit.middleware.js';

describe('uploadRateLimit', () => {
  it('returns a structured 429 response instead of throwing when the limit is exceeded', async () => {
    const userId = `rate-limit-test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    try {
      const app = express();
      app.use((req, _res, next) => {
        (req as express.Request & { user?: { uid?: string } }).user = { uid: userId };
        next();
      });

      app.post('/upload/video', uploadRateLimit, (_req, res) => {
        res.status(200).json({ success: true });
      });

      for (let index = 0; index < RATE_LIMIT_CONFIGS.upload.max; index += 1) {
        const response = await request(app).post('/upload/video');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true });
      }

      const limitedResponse = await request(app).post('/upload/video');

      expect(limitedResponse.status).toBe(429);
      expect(limitedResponse.body).toMatchObject({
        success: false,
        error: {
          code: 'RATE_API_REQUESTS',
          category: 'rate_limit',
          statusCode: 429,
          action: 'wait',
        },
      });
    } finally {
      process.env['NODE_ENV'] = previousNodeEnv;
    }
  });
});
