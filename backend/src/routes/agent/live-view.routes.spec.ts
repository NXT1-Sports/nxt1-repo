import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const startSessionMock = vi.fn();
const navigateMock = vi.fn();
const refreshMock = vi.fn();
const closeSessionMock = vi.fn();
const getLiveViewSessionServiceMock = vi.fn(() => ({
  startSession: startSessionMock,
  navigate: navigateMock,
  refresh: refreshMock,
  closeSession: closeSessionMock,
}));

vi.mock('../../middleware/auth/auth.middleware.js', () => ({
  appGuard: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('./shared.js', () => ({
  getLiveViewSessionService: getLiveViewSessionServiceMock,
  queueService: null,
  llmService: null,
}));

const { default: liveViewRoutes } = await import('./live-view.routes.js');

describe('live-view.routes request Firestore binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    startSessionMock.mockResolvedValue({
      session: {
        sessionId: 'session-1',
        interactiveUrl: 'https://liveview.example.com/session-1',
      },
    });
    navigateMock.mockResolvedValue({ resolvedUrl: 'https://example.com' });
    refreshMock.mockResolvedValue(undefined);
    closeSessionMock.mockResolvedValue(undefined);
  });

  it('uses the request firebase db when starting a staging live-view session', async () => {
    const stagingDb = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn().mockResolvedValue({
            data: () => ({ connectedAccounts: {} }),
          }),
        })),
      })),
    };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { uid: 'user-1' };
      req.firebase = {
        db: stagingDb as never,
        auth: {} as never,
        storage: {} as never,
      };
      next();
    });
    app.use('/api/v1/staging/agent-x', liveViewRoutes);

    const response = await request(app)
      .post('/api/v1/staging/agent-x/live-view/start')
      .send({ url: 'https://example.com' });

    expect(response.status).toBe(200);
    expect(getLiveViewSessionServiceMock).toHaveBeenCalledWith(stagingDb);
    expect(startSessionMock).toHaveBeenCalledWith(
      'user-1',
      { url: 'https://example.com', platformKey: null },
      {}
    );
  });
});
