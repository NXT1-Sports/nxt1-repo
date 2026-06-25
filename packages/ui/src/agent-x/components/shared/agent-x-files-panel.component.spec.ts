import { computed } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { NxtArchiveService } from '../../../services/archive';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXFilesPanelInnerComponent } from './agent-x-files-panel.component';
import { AgentXFilmReviewService } from '../../services/agent-x-film-review.service';
import { AgentXFilesService } from '../../services/agent-x-files.service';
import { AgentXJobService } from '../../services/agent-x-job.service';
import { AgentXService } from '../../services/agent-x.service';
import { AgentXVideoUploadService } from '../../services/agent-x-video-upload.service';

describe('AgentXFilesPanelInnerComponent', () => {
  const loadFiles = vi.fn<AgentXFilesService['loadFiles']>();
  const uploadFiles = vi.fn<AgentXFilesService['uploadFiles']>();
  const startUploadFiles = vi.fn<AgentXFilesService['startUploadFiles']>();
  const loadShareCandidates = vi.fn<AgentXFilesService['loadShareCandidates']>();
  const deleteFile = vi.fn<AgentXFilesService['deleteFile']>();
  const shareFile = vi.fn<AgentXFilesService['shareFile']>();
  const shareFolder = vi.fn<AgentXFilesService['shareFolder']>();
  const refreshFile = vi.fn<AgentXFilesService['refreshFile']>();
  const getLinkedFilmReviewId = vi.fn<AgentXFilesService['getLinkedFilmReviewId']>();
  const uploadVideo = vi.fn<AgentXVideoUploadService['uploadVideo']>();
  const selectFile = vi.fn<AgentXFilesService['selectFile']>();
  const selectFilmReview = vi.fn<AgentXFilmReviewService['select']>();
  const loadFilmReviews = vi.fn<AgentXFilmReviewService['load']>();
  const folder = {
    id: 'folder-1',
    teamId: 'team-77',
    name: 'Shared Folder',
    normalizedName: 'shared folder',
    sortOrder: 0,
    createdByUserId: 'user-1',
    readAccessKeys: ['user:user-1'],
    writeAccessKeys: ['user:user-1'],
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
  } as const;
  const folderNode = {
    id: 'folder-1',
    name: 'Shared Folder',
    items: [],
    children: [],
    source: folder,
  } as const;
  const file = {
    id: 'file-1',
    teamId: 'team-77',
    ownerUserId: 'user-1',
    name: 'Shared Report',
    normalizedName: 'shared report',
    mimeType: 'text/markdown',
    kind: 'doc',
    status: 'ready',
    origin: 'files_upload',
    sizeBytes: 12,
    url: 'data:text/plain,hello',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
    lastSeenAt: '2026-06-24T00:00:00.000Z',
    readAccessKeys: ['user:user-1'],
    writeAccessKeys: ['user:user-1'],
  } as const;
  const videoFile = {
    ...file,
    id: 'video-1',
    name: 'Game Tape.mp4',
    normalizedName: 'game tape.mp4',
    mimeType: 'video/mp4',
    kind: 'video',
    url: 'https://cdn.example.com/game-tape.mp4',
    storagePath: 'teams/team-77/game-tape.mp4',
    cloudflareVideoId: 'cf-video-1',
    thumbnailUrl: 'https://cdn.example.com/game-tape.jpg',
    sport: 'basketball',
  } as const;
  const nativeReviewVideoFile = {
    ...videoFile,
    id: 'review-file-1',
    name: 'Week 4 Cutup.mp4',
    rawPayload: {
      filmReview: {
        title: 'Week 4 Cutup',
        opponentName: 'Central High',
        aiSummary: 'Explosive plays came from condensed formations.',
        breakdownSource: {
          provider: 'hudl',
          playCount: 12,
        },
      },
    },
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    loadFiles.mockResolvedValue(undefined);
    uploadFiles.mockResolvedValue(['uploaded-video-1']);
    startUploadFiles.mockImplementation((files) => ({
      progress$: of({
        phase: 'complete',
        currentFile: files.length > 0 ? 1 : 0,
        totalFiles: files.length,
        currentFileName: files[0]?.name ?? null,
        percent: 100,
        canCancel: false,
      }),
      result: Promise.resolve(['uploaded-video-1']),
      cancel: vi.fn(),
    }));
    refreshFile.mockImplementation(async (fileId: string) =>
      fileId === videoFile.id ? ({ ...videoFile } as any) : ({ ...file } as any)
    );
    getLinkedFilmReviewId.mockResolvedValue(null);
    loadFilmReviews.mockResolvedValue(undefined);
    loadShareCandidates.mockResolvedValue([
      {
        id: 'user-2',
        displayName: 'User Two',
        avatarUrl: null,
        email: 'user2@example.com',
        sourceScopes: ['team'],
        teamIds: ['team-77'],
        organizationIds: [],
      },
    ]);
    deleteFile.mockResolvedValue(undefined);
    shareFile.mockResolvedValue({
      readAccessKeys: ['user:user-1', 'user:user-2'],
      writeAccessKeys: ['user:user-1'],
    });
    shareFolder.mockResolvedValue({
      ...folder,
      readAccessKeys: ['user:user-1', 'user:user-2'],
      writeAccessKeys: ['user:user-1'],
    });
    uploadVideo.mockReturnValue({
      progress$: of({ phase: 'uploading', percent: 0 }),
      cancel: vi.fn(),
    });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AgentXFilesService,
          useValue: {
            loadFiles,
            uploadFiles,
            startUploadFiles,
            loadShareCandidates,
            deleteFile,
            shareFile,
            shareFolder,
            refreshFile,
            getLinkedFilmReviewId,
            selectFile,
            files: computed(() => [file, videoFile]),
            folders: computed(() => [folder]),
            loading: computed(() => false),
            saving: computed(() => false),
            error: computed(() => null),
            selectedId: computed(() => null),
            selectedFile: computed(() => file),
          },
        },
        {
          provide: AgentXFilmReviewService,
          useValue: {
            load: loadFilmReviews,
            select: selectFilmReview,
            reviews: computed(() => []),
          },
        },
        {
          provide: AgentXService,
          useValue: {
            hasRole: vi.fn().mockReturnValue(false),
            queueSelectedContext: vi.fn(),
            queueSelectedContexts: vi.fn(),
            userContext: computed(() => null),
          },
        },
        {
          provide: AgentXJobService,
          useValue: {
            enqueue: vi.fn(),
          },
        },
        {
          provide: AgentXVideoUploadService,
          useValue: {
            uploadVideo,
          },
        },
        {
          provide: Auth,
          useValue: {
            currentUser: { uid: 'user-1' },
          },
        },
        {
          provide: DomSanitizer,
          useValue: {
            bypassSecurityTrustResourceUrl: vi.fn((value: string) => value),
          },
        },
        {
          provide: NxtToastService,
          useValue: {
            success: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
          },
        },
        {
          provide: NxtArchiveService,
          useValue: {},
        },
      ],
    });
  });

  it('refreshes shared files even when no team target is selected', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = null;

    await component.refreshData();

    expect(loadFiles).toHaveBeenCalledWith(null);
  });

  it('uses the file team id for delete when no team target is selected', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = null;

    await (component as any).onFileDeleteConfirm(file, new Event('click'));

    expect(deleteFile).toHaveBeenCalledWith('file-1', 'team-77');
  });

  it('submits share updates from the file menu', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());

    await (component as any).onFileShareStart(file, new Event('click'));
    await (component as any).onFileShareCandidateToggled(file, {
      candidate: {
        id: 'user-2',
        displayName: 'User Two',
        avatarUrl: null,
        email: 'user2@example.com',
        sourceScopes: ['team'],
        teamIds: ['team-77'],
        organizationIds: [],
      },
      checked: true,
    });

    expect(shareFile).toHaveBeenCalledWith('file-1', {
      action: 'add',
      permission: 'read',
      principalType: 'user',
      principalId: 'user-2',
    });
  });

  it('submits share updates from the folder menu', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());

    await (component as any).onFolderShareStart(folderNode, new Event('click'));
    await (component as any).onFolderShareCandidateToggled(folderNode, {
      candidate: {
        id: 'user-2',
        displayName: 'User Two',
        avatarUrl: null,
        email: 'user2@example.com',
        sourceScopes: ['team'],
        teamIds: ['team-77'],
        organizationIds: [],
      },
      checked: true,
    });

    expect(shareFolder).toHaveBeenCalledWith('folder-1', {
      action: 'add',
      permission: 'read',
      principalType: 'user',
      principalId: 'user-2',
    });
  });

  it('keeps share management available from the auth uid when agent context is empty', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());

    expect((component as any).canManageFileSharing(file)).toBe(true);
    expect((component as any).canManageFolderSharing(folderNode)).toBe(true);
  });

  it('keeps plain videos in the generic viewer until film review is started', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = 'team-77';
    component.sport = 'basketball';

    await (component as any).openFile(videoFile);

    expect(refreshFile).toHaveBeenCalledWith('video-1', 'team-77', {});
    expect(getLinkedFilmReviewId).toHaveBeenCalledWith('video-1', 'team-77');
    expect((component as any).viewerMode()).toBe('generic');
    expect((component as any).selectedFilmReviewId()).toBeNull();
  });

  it('upgrades native film review files into film review drag contexts', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());

    const context = (component as any).buildFileDragContext(nativeReviewVideoFile);

    expect(context).toMatchObject({
      id: 'film-review:review-file-1',
      kind: 'film_play',
      title: 'Week 4 Cutup',
      source: {
        type: 'film_review',
        id: 'review-file-1',
        label: 'Week 4 Cutup',
      },
      metadata: {
        itemType: 'film_review',
        reviewId: 'review-file-1',
        opponentName: 'Central High',
        playCount: 12,
      },
    });
    expect(context.entityRefs).toEqual([
      { type: 'film_review', id: 'review-file-1', label: 'Week 4 Cutup' },
      { type: 'team_file', id: 'review-file-1', label: 'Week 4 Cutup.mp4' },
    ]);
    expect(context.summary).toContain('Explosive plays came from condensed formations.');
    expect(context.summary).toContain('Hudl breakdown');
  });

  it('refreshes the uploaded film review file directly before opening it', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = 'team-77';
    component.sport = 'basketball';

    const uploadedVideo = { ...videoFile, id: 'uploaded-video-1' } as any;
    refreshFile.mockResolvedValue(uploadedVideo);
    const openFileSpy = vi.spyOn(component as any, 'openFile').mockResolvedValue(undefined);
    const resolveUploadGroupsSpy = vi
      .spyOn(component as any, 'resolveUploadGroups')
      .mockResolvedValue([
        { files: [new File(['video'], 'upload.mp4', { type: 'video/mp4' })], folderId: null },
      ]);

    await (component as any).importFiles(
      [{ file: new File(['video'], 'upload.mp4', { type: 'video/mp4' }) }],
      null,
      'film_review'
    );

    expect(resolveUploadGroupsSpy).toHaveBeenCalled();
    expect(startUploadFiles).toHaveBeenCalled();
    expect(loadFiles).toHaveBeenCalledWith('team-77');
    expect(refreshFile).toHaveBeenCalledWith('uploaded-video-1', 'team-77');
    expect(openFileSpy).toHaveBeenCalledWith(uploadedVideo);
  });

  it('keeps opening film review state until the panel finishes selecting the review', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());

    let resolveRefresh: (() => void) | null = null;
    const refreshData = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        })
    );
    const onSelectReview = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(component as object, 'filmReviewPanel', {
      value: () => ({
        refreshData,
        onSelectReview,
      }),
    });

    const transitionPromise = (component as any).transitionToFilmReview('video-1', 'review-1');

    expect((component as any).isOpeningFilmReview()).toBe(true);
    expect((component as any).viewerMode()).toBe('video');

    resolveRefresh?.();
    await transitionPromise;

    expect(refreshData).toHaveBeenCalled();
    expect(onSelectReview).toHaveBeenCalledWith('review-1');
    expect((component as any).isOpeningFilmReview()).toBe(false);
  });
});
