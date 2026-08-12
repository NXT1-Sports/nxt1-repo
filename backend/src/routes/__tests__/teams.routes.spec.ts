import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  canEditTeamSettingsMock,
  getTeamCodeByIdMock,
  updateTeamCodeMock,
  promoteStorageObjectToDurableDestinationMock,
} = vi.hoisted(() => ({
  canEditTeamSettingsMock: vi.fn(),
  getTeamCodeByIdMock: vi.fn(),
  updateTeamCodeMock: vi.fn(),
  promoteStorageObjectToDurableDestinationMock: vi.fn(),
}));

vi.mock('../../middleware/auth/auth.middleware.js', () => ({
  appGuard: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { uid: 'unauthorized-user' } as never;
    next();
  },
  optionalAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

vi.mock('../../middleware/performance/performance.middleware.js', () => ({
  performanceMiddleware: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  testPerformance: vi.fn(),
}));

vi.mock('../../services/team/team-code.service.js', () => ({
  canEditTeamSettings: canEditTeamSettingsMock,
  getTeamCodeById: getTeamCodeByIdMock,
  updateTeamCode: updateTeamCodeMock,
}));

vi.mock('../../modules/agent/tools/media/agent-media-lifecycle.service.js', () => ({
  AgentMediaLifecycleService: {
    extractStoragePathFromUrl: vi.fn(),
    isFirebaseDownloadTokenUrl: vi.fn(),
    promoteStorageObjectToDurableDestination: promoteStorageObjectToDurableDestinationMock,
  },
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({ bucket: vi.fn() }),
}));

const { default: teamRoutes } = await import('../team/teams.routes.js');

function buildApp(documentUpdate: ReturnType<typeof vi.fn>) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.firebase = {
      db: {
        collection: () => ({
          doc: () => ({ update: documentUpdate }),
        }),
      },
    } as never;
    next();
  });
  app.use('/api/v1/teams', teamRoutes);
  app.use(
    (
      error: { statusCode?: number; status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(error.statusCode ?? error.status ?? 500).json({ error: 'request rejected' });
    }
  );
  return app;
}

describe('PATCH /api/v1/teams/:id durable organization logo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTeamCodeByIdMock.mockResolvedValue({
      team: { id: 'team-1', organizationId: 'organization-1' },
    });
    canEditTeamSettingsMock.mockResolvedValue(false);
  });

  it('rejects unauthorized callers before finalizing a logo or mutating team and organization records', async () => {
    const documentUpdate = vi.fn();
    const response = await request(buildApp(documentUpdate)).patch('/api/v1/teams/team-1').send({
      organizationLogoUrl:
        'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Teams%2Fteam-1%2Flogo%2Fupload.png?alt=media&token=upload-token',
    });

    expect(response.status).toBe(403);
    expect(canEditTeamSettingsMock).toHaveBeenCalledWith(
      expect.anything(),
      'team-1',
      expect.objectContaining({ organizationId: 'organization-1' }),
      'unauthorized-user'
    );
    expect(promoteStorageObjectToDurableDestinationMock).not.toHaveBeenCalled();
    expect(updateTeamCodeMock).not.toHaveBeenCalled();
    expect(documentUpdate).not.toHaveBeenCalled();
  });

  it('persists the finalizer-returned durable logo without passing the raw upload URL to TeamCode', async () => {
    const rawLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Teams%2Fteam-1%2Flogo%2Fupload.png?alt=media&token=upload-token';
    const durableLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Organizations%2Forganization-1%2Flogo?alt=media&token=durable-token';
    const documentUpdate = vi.fn().mockResolvedValue(undefined);
    canEditTeamSettingsMock.mockResolvedValue(true);
    promoteStorageObjectToDurableDestinationMock.mockResolvedValue({ url: durableLogoUrl });
    const mediaLifecycleMock =
      await import('../../modules/agent/tools/media/agent-media-lifecycle.service.js');
    vi.mocked(
      mediaLifecycleMock.AgentMediaLifecycleService.extractStoragePathFromUrl
    ).mockReturnValue('Teams/team-1/logo/upload.png');
    vi.mocked(
      mediaLifecycleMock.AgentMediaLifecycleService.isFirebaseDownloadTokenUrl
    ).mockReturnValue(true);
    updateTeamCodeMock.mockResolvedValue({
      id: 'team-1',
      organizationId: 'organization-1',
      teamCode: 'team-code',
    });

    const response = await request(buildApp(documentUpdate))
      .patch('/api/v1/teams/team-1')
      .send({ organizationLogoUrl: rawLogoUrl });

    expect(response.status).toBe(200);
    expect(promoteStorageObjectToDurableDestinationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        storagePath: 'Teams/team-1/logo/upload.png',
        destinationPath: 'Organizations/organization-1/logo',
      })
    );
    expect(updateTeamCodeMock).toHaveBeenCalledWith(
      expect.anything(),
      'team-1',
      'unauthorized-user',
      expect.not.objectContaining({ logoUrl: rawLogoUrl, organizationLogoUrl: rawLogoUrl })
    );
    expect(documentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: durableLogoUrl })
    );
    expect(documentUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: rawLogoUrl })
    );
  });
});
