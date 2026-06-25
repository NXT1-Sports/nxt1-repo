import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { TeamFileFolderDoc, UniversalFileDoc } from '@nxt1/core';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AGENT_X_API_BASE_URL, AGENT_X_AUTH_TOKEN_FACTORY } from '../agent-x-job.service';
import { AgentXVideoUploadService } from '../agent-x-video-upload.service';
import { AgentXFilesService, type AgentXShareCandidate } from '../agent-x-files.service';

describe('AgentXFilesService', () => {
  let service: AgentXFilesService;

  const httpMock = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  const loggerMock = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  loggerMock.child.mockReturnValue(loggerMock);

  const breadcrumbMock = {
    trackStateChange: vi.fn(),
  };

  const toastMock = {
    success: vi.fn(),
    error: vi.fn(),
  };

  const analyticsMock = {
    trackEvent: vi.fn(),
  };

  const sharedFileDoc = {
    id: 'file-1',
    teamId: 'team-1',
    ownerUserId: 'user-1',
    title: 'Shared Report',
    normalizedTitle: 'shared report',
    type: 'file',
    payloadKind: 'native',
    payload: {
      content: {
        text: 'Shared notes',
      },
    },
    status: 'ready',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    lastSeenAt: '2026-06-24T00:00:00.000Z',
  } as unknown as UniversalFileDoc;

  const sharedFolderDoc = {
    id: 'folder-1',
    teamId: 'team-1',
    name: 'Shared Folder',
    normalizedName: 'shared folder',
    sortOrder: 0,
    createdByUserId: 'user-1',
    readAccessKeys: ['user:user-1'],
    writeAccessKeys: ['user:user-1'],
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
  } as TeamFileFolderDoc;

  beforeEach(() => {
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        AgentXFilesService,
        { provide: HttpClient, useValue: httpMock },
        { provide: AgentXVideoUploadService, useValue: { uploadVideo: vi.fn() } },
        { provide: NxtLoggingService, useValue: loggerMock },
        { provide: NxtBreadcrumbService, useValue: breadcrumbMock },
        { provide: NxtToastService, useValue: toastMock },
        { provide: ANALYTICS_ADAPTER, useValue: analyticsMock },
        { provide: AGENT_X_API_BASE_URL, useValue: 'https://api.nxt1.test' },
        { provide: AGENT_X_AUTH_TOKEN_FACTORY, useValue: vi.fn().mockResolvedValue('token') },
      ],
    });

    service = TestBed.inject(AgentXFilesService);
  });

  it('loads shared files without requiring a team query', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [sharedFileDoc],
          folders: [],
        },
      })
    );

    await service.loadFiles();

    expect(httpMock.get).toHaveBeenCalledWith('https://api.nxt1.test/agent-x/files/universal', {
      params: {},
    });
    expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith('agent-x-files:loading', {
      teamId: null,
    });
    expect(service.files()).toHaveLength(1);
    expect(service.files()[0]?.name).toBe('Shared Report');
  });

  it('preserves explicit team queries for compatibility', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [sharedFileDoc],
          folders: [],
        },
      })
    );

    await service.loadUniversalFiles(' team-9 ');

    expect(httpMock.get).toHaveBeenCalledWith('https://api.nxt1.test/agent-x/files/universal', {
      params: { teamId: 'team-9' },
    });
    expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith(
      'agent-x-universal-files:loading',
      {
        teamId: 'team-9',
      }
    );
  });

  it('updates local share access keys after sharing a file', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [sharedFileDoc],
          folders: [],
        },
      })
    );
    httpMock.post.mockReturnValue(
      of({
        success: true,
        data: {
          fileId: 'file-1',
          readAccessKeys: ['user:user-1', 'user:user-2'],
          writeAccessKeys: ['user:user-1'],
        },
      })
    );

    await service.loadFiles();
    await service.shareFile('file-1', {
      action: 'add',
      permission: 'write',
      principalType: 'user',
      principalId: 'user-2',
    });

    expect(httpMock.post).toHaveBeenCalledWith('https://api.nxt1.test/agent-x/files/file-1/share', {
      action: 'add',
      permission: 'write',
      principalType: 'user',
      principalId: 'user-2',
    });
    expect(service.files()[0]?.readAccessKeys).toEqual(['user:user-1', 'user:user-2']);
    expect(service.files()[0]?.writeAccessKeys).toEqual(['user:user-1']);
  });

  it('updates local folder access keys after sharing a folder', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [],
          folders: [sharedFolderDoc],
        },
      })
    );
    httpMock.post.mockReturnValue(
      of({
        success: true,
        data: {
          folder: {
            ...sharedFolderDoc,
            readAccessKeys: ['user:user-1', 'user:user-2'],
          },
        },
      })
    );

    await service.loadFiles('team-1');
    await service.shareFolder('folder-1', {
      action: 'add',
      permission: 'write',
      principalType: 'user',
      principalId: 'user-2',
    });

    expect(httpMock.post).toHaveBeenCalledWith(
      'https://api.nxt1.test/agent-x/files/folders/folder-1/share',
      {
        action: 'add',
        permission: 'write',
        principalType: 'user',
        principalId: 'user-2',
      }
    );
    expect(service.folders()[0]?.readAccessKeys).toEqual(['user:user-1', 'user:user-2']);
  });

  it('loads scoped share candidates for the member picker', async () => {
    const candidates = [
      {
        id: 'user-2',
        displayName: 'Jane Receiver',
        avatarUrl: null,
        email: 'jane@example.com',
        sourceScopes: ['team'],
        teamIds: ['team-1'],
        organizationIds: ['org-1'],
      },
    ] satisfies readonly AgentXShareCandidate[];

    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          candidates,
        },
      })
    );

    const result = await service.loadShareCandidates({
      teamId: 'team-1',
      organizationId: 'org-1',
    });

    expect(httpMock.get).toHaveBeenCalledWith(
      'https://api.nxt1.test/agent-x/files/universal/share-candidates',
      {
        params: {
          teamId: 'team-1',
          organizationId: 'org-1',
        },
      }
    );
    expect(result).toEqual(candidates);
  });
});
