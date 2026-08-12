import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  canEditTeamSettingsMock,
  ensureFirebaseDownloadUrlMock,
  getTeamCodeByIdMock,
  invalidateOrganizationCacheMock,
  updateTeamCodeMock,
  promoteStorageObjectToDurableDestinationMock,
} = vi.hoisted(() => ({
  canEditTeamSettingsMock: vi.fn(),
  ensureFirebaseDownloadUrlMock: vi.fn(),
  getTeamCodeByIdMock: vi.fn(),
  invalidateOrganizationCacheMock: vi.fn(),
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

vi.mock('../../services/team/organization.service.js', () => ({
  createOrganizationService: () => ({
    invalidateCache: invalidateOrganizationCacheMock,
  }),
}));

vi.mock('../../modules/agent/tools/media/agent-media-lifecycle.service.js', () => ({
  AgentMediaLifecycleService: {
    extractStoragePathFromUrl: vi.fn(),
    ensureFirebaseDownloadUrl: ensureFirebaseDownloadUrlMock,
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
    invalidateOrganizationCacheMock.mockResolvedValue(undefined);
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

  it('persists the authorized team logo Firebase URL on the Organization document', async () => {
    const rawLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Teams%2Fteam-1%2Flogo%2Fupload.png?alt=media&token=upload-token';
    const documentUpdate = vi.fn().mockResolvedValue(undefined);
    canEditTeamSettingsMock.mockResolvedValue(true);
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
    expect(promoteStorageObjectToDurableDestinationMock).not.toHaveBeenCalled();
    expect(ensureFirebaseDownloadUrlMock).not.toHaveBeenCalled();
    expect(updateTeamCodeMock).toHaveBeenCalledWith(
      expect.anything(),
      'team-1',
      'unauthorized-user',
      expect.not.objectContaining({ logoUrl: rawLogoUrl, organizationLogoUrl: rawLogoUrl })
    );
    expect(documentUpdate).toHaveBeenCalledWith(expect.objectContaining({ logoUrl: rawLogoUrl }));
    expect(invalidateOrganizationCacheMock).toHaveBeenCalledWith('organization-1');
  });

  it('canonicalizes an authorized bare team logo path to a Firebase URL for the Organization document', async () => {
    const rawLogoPath = 'Teams/team-1/logo/upload.png';
    const firebaseLogoUrl =
      'https://firebasestorage.googleapis.com/v0/b/test-bucket/o/Teams%2Fteam-1%2Flogo%2Fupload.png?alt=media&token=upload-token';
    const documentUpdate = vi.fn().mockResolvedValue(undefined);
    canEditTeamSettingsMock.mockResolvedValue(true);
    ensureFirebaseDownloadUrlMock.mockResolvedValue(firebaseLogoUrl);
    const mediaLifecycleMock =
      await import('../../modules/agent/tools/media/agent-media-lifecycle.service.js');
    vi.mocked(
      mediaLifecycleMock.AgentMediaLifecycleService.extractStoragePathFromUrl
    ).mockReturnValue('Teams/team-1/logo/upload.png');
    vi.mocked(
      mediaLifecycleMock.AgentMediaLifecycleService.isFirebaseDownloadTokenUrl
    ).mockReturnValue(false);
    updateTeamCodeMock.mockResolvedValue({
      id: 'team-1',
      organizationId: 'organization-1',
      teamCode: 'team-code',
    });

    const response = await request(buildApp(documentUpdate))
      .patch('/api/v1/teams/team-1')
      .send({ organizationLogoUrl: rawLogoPath });

    expect(response.status).toBe(200);
    expect(promoteStorageObjectToDurableDestinationMock).not.toHaveBeenCalled();
    expect(ensureFirebaseDownloadUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ storagePath: 'Teams/team-1/logo/upload.png' })
    );
    expect(documentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: firebaseLogoUrl })
    );
    expect(invalidateOrganizationCacheMock).toHaveBeenCalledWith('organization-1');
  });
});
