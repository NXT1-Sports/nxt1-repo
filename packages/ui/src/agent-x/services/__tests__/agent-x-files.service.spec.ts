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

  const managedMarkdownFileDoc = {
    ...sharedFileDoc,
    id: 'file-markdown-1',
    title: 'Agent Markdown Doc',
    normalizedTitle: 'agent markdown doc',
    payload: {
      content: {
        text: '# Practice Script\n\n- Open with indy\n- Finish with team',
        format: 'markdown',
      },
    },
  } as unknown as UniversalFileDoc;

  const managedMarkdownWithSpreadsheetAssetDoc = {
    ...managedMarkdownFileDoc,
    id: 'file-spreadsheet-1',
    title: 'Practice Script Spreadsheet',
    normalizedTitle: 'practice script spreadsheet',
    payload: {
      content: {
        text: '# Practice Script\n\n- Open with indy\n- Finish with team',
        format: 'markdown',
      },
      asset: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        kind: 'doc',
        origin: 'agent_chat_output',
        sizeBytes: 8475,
        url: 'https://cdn.example.com/practice-script.xlsx',
        storagePath: 'Users/user-1/threads/thread-1/exports/practice-script.xlsx',
      },
    },
  } as unknown as UniversalFileDoc;

  const uploadedPdfWithArtifactNotesDoc = {
    id: 'file-pdf-1',
    teamId: 'team-1',
    ownerUserId: 'user-1',
    title: 'Sample.pdf',
    normalizedTitle: 'sample.pdf',
    type: 'file',
    payloadKind: 'native',
    payload: {
      asset: {
        mimeType: 'application/pdf',
        kind: 'doc',
        origin: 'files_upload',
        sizeBytes: 2048,
        url: 'https://cdn.example.com/sample.pdf',
        storagePath: 'teams/team-1/sample.pdf',
      },
    },
    artifactSummary: 'Starter summary for coaches.',
    artifactNotes: 'Key formation tendency notes and callout reminders.',
    artifactTags: ['formations', 'tendencies'],
    status: 'ready',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    lastSeenAt: '2026-06-24T00:00:00.000Z',
  } as unknown as UniversalFileDoc;

  const legacyFilmReviewVideoDoc = {
    id: 'legacy-film-review-video-1',
    teamId: '',
    ownerUserId: 'user-1',
    createdByUserId: 'user-1',
    title: 'Wide Clip 001',
    normalizedTitle: 'wide clip 001',
    type: 'film_review',
    payloadKind: 'native',
    payload: {
      mimeType: 'video/mp4',
      kind: 'video',
      origin: 'files_upload',
      sizeBytes: 4096,
      url: 'https://cdn.example.com/wide-clip-001.mp4',
      storagePath: 'users/user-1/wide-clip-001.mp4',
    },
    sourceRef: {
      legacyCollection: 'TeamFilmReviews',
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

    expect(httpMock.get).toHaveBeenCalledWith('https://api.nxt1.test/agent-x/files/universal');
    expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith('agent-x-files:loading', {
      teamId: null,
    });
    expect(service.files()).toHaveLength(1);
    expect(service.files()[0]?.name).toBe('Shared Report');
    expect(service.files()[0]?.mimeType).toBe('text/plain');
  });

  it('maps artifact note metadata into the viewer model for uploaded files', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [uploadedPdfWithArtifactNotesDoc],
          folders: [],
        },
      })
    );

    await service.loadFiles();

    expect(service.files()).toHaveLength(1);
    expect(service.files()[0]?.summary).toBe('Starter summary for coaches.');
    expect(service.files()[0]?.textContent).toBe(
      'Key formation tendency notes and callout reminders.'
    );
    expect(service.files()[0]?.tags).toEqual(['formations', 'tendencies']);
  });

  it('keeps legacy film review video uploads visible in the files library', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [legacyFilmReviewVideoDoc],
          folders: [],
        },
      })
    );

    await service.loadFiles();

    expect(service.files()).toHaveLength(1);
    expect(service.files()[0]?.id).toBe('legacy-film-review-video-1');
    expect(service.files()[0]?.name).toBe('Wide Clip 001');
    expect(service.files()[0]?.kind).toBe('video');
    expect(service.files()[0]?.mimeType).toBe('video/mp4');
    expect(service.files()[0]?.storagePath).toBe('users/user-1/wide-clip-001.mp4');
  });

  it('maps managed markdown documents to markdown mime types', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [managedMarkdownFileDoc],
          folders: [],
        },
      })
    );

    await service.loadFiles();

    expect(service.files()).toHaveLength(1);
    expect(service.files()[0]?.mimeType).toBe('text/markdown');
    expect(service.files()[0]?.textContent).toContain('# Practice Script');
  });

  it('uses a native spreadsheet asset instead of downgrading a managed document to markdown', async () => {
    httpMock.get.mockReturnValue(
      of({
        success: true,
        data: {
          files: [managedMarkdownWithSpreadsheetAssetDoc],
          folders: [],
        },
      })
    );

    await service.loadFiles();

    expect(service.files()).toHaveLength(1);
    expect(service.files()[0]).toMatchObject({
      id: 'file-spreadsheet-1',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      kind: 'doc',
      url: 'https://cdn.example.com/practice-script.xlsx',
      storagePath: 'Users/user-1/threads/thread-1/exports/practice-script.xlsx',
      textContent: '# Practice Script\n\n- Open with indy\n- Finish with team',
    });
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

    expect(httpMock.get).toHaveBeenCalledWith('https://api.nxt1.test/agent-x/files/universal');
    expect(breadcrumbMock.trackStateChange).toHaveBeenCalledWith(
      'agent-x-universal-files:loading',
      {
        teamId: null,
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
