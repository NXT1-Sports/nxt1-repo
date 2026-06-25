import { computed, signal } from '@angular/core';
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
  const enqueue = vi.fn<AgentXJobService['enqueue']>();
  const selectFile = vi.fn<AgentXFilesService['selectFile']>();
  const selectFilmReview = vi.fn<AgentXFilmReviewService['select']>();
  const loadFilmReviews = vi.fn<AgentXFilmReviewService['load']>();
  const filesState = signal<readonly any[]>([]);
  const foldersState = signal<readonly any[]>([]);
  const reviewState = signal<readonly any[]>([]);
  const selectedFileIdState = signal<string | null>(null);
  const selectedReviewIdState = signal<string | null>(null);
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
  const generatedTextFile = {
    ...file,
    id: 'generated-file-1',
    name: 'Agent Notes',
    normalizedName: 'agent notes',
    origin: 'agent_chat_output',
    textContent: '# Report\n\nGenerated notes go here.',
  } as const;
  const uploadedTextFile = {
    ...file,
    id: 'uploaded-text-file-1',
    name: 'Uploaded Notes',
    normalizedName: 'uploaded notes',
    textContent: '# Practice Plan\n\nUploaded notes stay in the preview stage.',
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
  const review = {
    id: 'review-1',
    teamId: 'team-77',
    title: 'Game Tape Review',
    videoUrl: videoFile.url,
    fileId: videoFile.id,
    storagePath: videoFile.storagePath,
    cloudflareVideoId: videoFile.cloudflareVideoId,
    cloudflareStatus: 'ready',
    readyToStream: true,
    thumbnailUrl: videoFile.thumbnailUrl,
    sport: 'basketball',
    createdBy: 'user-1',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
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
    filesState.set([file, videoFile]);
    foldersState.set([folder]);
    reviewState.set([]);
    selectedFileIdState.set(null);
    selectedReviewIdState.set(null);
    selectFile.mockImplementation((fileId) => {
      selectedFileIdState.set(fileId ?? null);
    });
    selectFilmReview.mockImplementation((reviewId) => {
      selectedReviewIdState.set(reviewId ?? null);
    });
    uploadVideo.mockReturnValue({
      progress$: of({ phase: 'uploading', percent: 0 }),
      cancel: vi.fn(),
    });
    enqueue.mockResolvedValue({
      jobId: 'job-1',
      operationId: 'op-1',
      threadId: 'thread-1',
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
            files: computed(() => filesState()),
            folders: computed(() => foldersState()),
            loading: computed(() => false),
            saving: computed(() => false),
            error: computed(() => null),
            selectedId: computed(() => selectedFileIdState()),
            selectedFile: computed(
              () => filesState().find((entry) => entry.id === selectedFileIdState()) ?? null
            ),
          },
        },
        {
          provide: AgentXFilmReviewService,
          useValue: {
            load: loadFilmReviews,
            select: selectFilmReview,
            reviews: computed(() => reviewState()),
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
            enqueue,
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

  it('routes file uploads to the explicitly chosen destination folder', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = 'team-77';

    const importFilesSpy = vi.spyOn(component as any, 'importFiles').mockResolvedValue(undefined);
    const input = {
      files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
      value: '',
    } as HTMLInputElement;

    (component as any).queuedUploadFolderId.set('folder-1');
    await (component as any).onFilesSelected({ target: input } as Event);

    expect(importFilesSpy).toHaveBeenCalledTimes(1);
    expect(importFilesSpy.mock.calls[0]?.[1]).toBe('folder-1');
    expect(importFilesSpy.mock.calls[0]?.[2]).toBe('file');
  });

  it('opens the file picker after confirming the chosen upload destination', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const clickSpy = vi.fn();

    Object.defineProperty(component as object, 'fileUploadInput', {
      value: () => ({ nativeElement: { click: clickSpy } }),
    });

    (component as any).openFilePicker(new Event('click'));
    (component as any).onUploadDestinationSelect('folder-1');
    (component as any).onConfirmUploadDestination(new Event('click'));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect((component as any).lastUsedUploadFolderId()).toBe('folder-1');
    expect((component as any).isUploadMenuOpen()).toBe(false);
  });

  it('seeds the destination picker with the last used folder when nothing is selected', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());

    (component as any).lastUsedUploadFolderId.set('folder-1');
    (component as any).openFilePicker(new Event('click'));

    expect((component as any).uploadDestinationMenuStep()).toBe('destination');
    expect((component as any).uploadDestinationFolderId()).toBe('folder-1');
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

  it('routes Generate Notes as a same-record Team Files action without coordinator pinning', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = 'team-77';

    await (component as any).generateNotes(file);

    expect(enqueue).toHaveBeenCalledWith(
      expect.stringContaining('same-record Team Files note-enrichment workflow'),
      expect.objectContaining({
        source: 'team_files',
        trigger: 'generate_artifact',
        fileId: 'file-1',
        teamIdOverride: 'team-77',
      }),
      expect.objectContaining({
        selectedContexts: [
          expect.objectContaining({
            id: 'team-file:file-1',
          }),
        ],
      })
    );
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

  it('preserves existing generic file tabs when returning to the library to add another file', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = 'team-77';
    component.sport = 'basketball';

    await component['openFile'](file as any);
    component.openVideoFromLibrary();
    await component['openFile'](videoFile as any);

    expect(component.visibleOpenTabs().map((tab) => tab.id)).toEqual([
      'file:file-1',
      'file:video-1',
    ]);
    expect(component.selectedId()).toBe('video-1');
    expect(component.selectedTabId()).toBe('file:video-1');

    component.reorderVideoTabsByIndex(1, 0);
    expect(component.visibleOpenTabs().map((tab) => tab.id)).toEqual([
      'file:video-1',
      'file:file-1',
    ]);

    component.closeVideoTab('file:video-1');
    expect(component.visibleOpenTabs().map((tab) => tab.id)).toEqual(['file:file-1']);
    expect(component.selectedId()).toBe('file-1');
    expect(component.selectedTabId()).toBe('file:file-1');
  });

  it('keeps film review pills visible after opening another file from the library', async () => {
    getLinkedFilmReviewId.mockResolvedValue('review-1');
    reviewState.set([review]);

    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = 'team-77';
    component.sport = 'basketball';

    const refreshData = vi.fn().mockResolvedValue(undefined);
    const onSelectReview = vi.fn().mockImplementation(async (reviewId: string) => {
      selectedReviewIdState.set(reviewId);
    });

    Object.defineProperty(component as object, 'filmReviewPanel', {
      value: () => ({
        refreshData,
        onSelectReview,
        selectedId: () => selectedReviewIdState(),
      }),
    });

    await component['openFile'](videoFile as any);

    expect(component.visibleOpenTabs().map((tab) => tab.id)).toEqual(['review:review-1']);
    expect(component.selectedTabId()).toBe('review:review-1');

    component.openVideoFromLibrary();
    await component['openFile'](file as any);

    expect(component.visibleOpenTabs().map((tab) => tab.id)).toEqual([
      'review:review-1',
      'file:file-1',
    ]);
    expect(component.selectedTabId()).toBe('file:file-1');

    await component.onSelectReview('review:review-1');

    expect(component.selectedTabId()).toBe('review:review-1');
    expect(onSelectReview).toHaveBeenCalledWith('review-1');
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

  it('does not render generated agent text files in the inline preview stage', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    component.teamId = 'team-77';

    expect((component as any).isTextDocument(uploadedTextFile)).toBe(true);
    expect((component as any).isTextDocument(generatedTextFile)).toBe(false);
    expect((component as any).shouldRenderViewerStage(uploadedTextFile)).toBe(true);
    expect((component as any).shouldRenderViewerStage(generatedTextFile)).toBe(false);
    expect((component as any).shouldShowViewerUploadAction(generatedTextFile)).toBe(true);

    component.teamId = null;
    expect((component as any).shouldShowViewerUploadAction(generatedTextFile)).toBe(false);
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
    const onSelectReview = vi.fn(async (reviewId: string) => {
      selectFilmReview(reviewId);
    });

    Object.defineProperty(component as object, 'filmReviewPanel', {
      value: () => ({
        refreshData,
        onSelectReview,
      }),
    });

    const transitionPromise = (component as any).transitionToFilmReview('video-1', 'review-1');

    expect((component as any).isOpeningFilmReview()).toBe(true);
    expect((component as any).viewerMode()).toBe('video');
    expect(selectFilmReview).toHaveBeenCalledWith(null);
    expect(selectedReviewIdState()).toBeNull();
    expect(onSelectReview).not.toHaveBeenCalled();

    resolveRefresh?.();
    await transitionPromise;

    expect(refreshData).toHaveBeenCalled();
    expect(onSelectReview).toHaveBeenCalledWith('review-1');
    expect(selectedReviewIdState()).toBe('review-1');
    expect((component as any).isOpeningFilmReview()).toBe(false);
  });
});
