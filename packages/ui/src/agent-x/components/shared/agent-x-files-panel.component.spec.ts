import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable, Subject, of } from 'rxjs';
import type { TeamFileFolderDoc, TeamFilmReviewDoc } from '@nxt1/core';
import type { AgentXSelectedContext } from '@nxt1/core/ai';
import { NxtMediaViewerService } from '../../../components/media-viewer';
import { NxtArchiveService } from '../../../services/archive';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXFilesPanelInnerComponent } from './agent-x-files-panel.component';
import type { AgentXLibraryFolderTreeNode } from './agent-x-library-folder-tree.component';
import type { AgentXShareMemberOption } from './agent-x-share-member-picker.component';
import { AgentXFilmReviewService } from '../../services/agent-x-film-review.service';
import {
  FILES_UPLOAD_CANCELLED_MESSAGE,
  AgentXFilesService,
  type AgentXFilesUploadProgress,
} from '../../services/agent-x-files.service';
import { AgentXJobService } from '../../services/agent-x-job.service';
import { AgentXService } from '../../services/agent-x.service';
import { AgentXVideoUploadService } from '../../services/agent-x-video-upload.service';
import type { AgentXLibraryFile } from '../../services/agent-x-files.service';

type FileShareToggleEvent = {
  candidate: AgentXShareMemberOption;
  checked: boolean;
};

type ImportedFileDescriptor = {
  file: File;
  relativePath: string | null;
};

type FilesPanelTestAccess = {
  isPreparingUpload: Signal<boolean>;
  uploadPreparationCurrentItem: Signal<number>;
  uploadPreparationTotalItems: Signal<number>;
  uploadPreparationCurrentFileName: Signal<string | null>;
  isCancellingFilesUpload: Signal<boolean>;
  queuedUploadFolderId: WritableSignal<string | null | undefined>;
  lastUsedUploadFolderId: WritableSignal<string | null>;
  uploadDestinationMenuStep: Signal<'menu' | 'destination'>;
  uploadSelectionSource: Signal<'files' | 'folder' | 'zip' | null>;
  uploadDestinationFolderId: Signal<string | null>;
  viewerMode: Signal<'library' | 'video' | 'generic'>;
  selectedFilmReviewId: Signal<string | null>;
  isOpeningFilmReview: Signal<boolean>;
  openingFilmReviewTeamId: Signal<string | null>;
  onFilesSelected: (event: Event) => Promise<void>;
  onLibraryDrop: (event: DragEvent) => Promise<void>;
  cancelActiveFilesUpload: () => void;
  openFilePicker: (event?: Event) => void;
  onUploadSourceSelect: (source: 'files' | 'folder' | 'zip', event?: Event) => void;
  onUploadDestinationSelect: (folderId: string | null, event?: Event) => void;
  onConfirmUploadDestination: (source?: 'files' | 'folder' | 'zip', event?: Event) => void;
  folderNameDraft: WritableSignal<string>;
  creatingSubfolderParentId: WritableSignal<string | null>;
  onFolderCreateConfirm: (event?: Event) => Promise<void>;
  filesUploadCanCancel: Signal<boolean>;
  onFileShareConfirm: (file: AgentXLibraryFile, event?: Event) => Promise<void>;
  onFolderShareConfirm: (folder: AgentXLibraryFolderTreeNode, event?: Event) => Promise<void>;
  onFileDeleteConfirm: (file: AgentXLibraryFile, event?: Event) => Promise<void>;
  onFileShareStart: (file: AgentXLibraryFile, event: Event) => Promise<void>;
  onFileShareCandidateToggled: (
    file: AgentXLibraryFile,
    event: FileShareToggleEvent
  ) => Promise<void>;
  onFolderShareStart: (folder: AgentXLibraryFolderTreeNode, event: Event) => Promise<void>;
  onFolderShareCandidateToggled: (
    folder: AgentXLibraryFolderTreeNode,
    event: FileShareToggleEvent
  ) => Promise<void>;
  onTopLevelDrop: (event: DragEvent) => Promise<void>;
  onFileDragStart: (
    file: AgentXLibraryFile,
    folderItems: readonly AgentXLibraryFile[],
    event: DragEvent
  ) => void;
  onFolderContextDragStart: (folder: AgentXLibraryFolderTreeNode, event: DragEvent) => void;
  onFolderDrop: (folder: AgentXLibraryFolderTreeNode, event: DragEvent) => Promise<void>;
  generateNotes: (file: AgentXLibraryFile) => Promise<void>;
  canManageFileSharing: (file: AgentXLibraryFile) => boolean;
  canManageFolderSharing: (folder: AgentXLibraryFolderTreeNode) => boolean;
  openFile: (file: AgentXLibraryFile) => Promise<void>;
  buildFileDragContext: (file: AgentXLibraryFile) => AgentXSelectedContext;
  buildFileSummaryDragContext: (file: AgentXLibraryFile) => AgentXSelectedContext | null;
  buildFileNotesDragContext: (file: AgentXLibraryFile) => AgentXSelectedContext | null;
  shouldShowFilmReviewBadge: (file: AgentXLibraryFile) => boolean;
  isTextDocument: (file: AgentXLibraryFile) => boolean;
  shouldRenderViewerStage: (file: AgentXLibraryFile) => boolean;
  shouldShowViewerUploadAction: (file: AgentXLibraryFile) => boolean;
  shouldShowViewerFileActions: (file: AgentXLibraryFile) => boolean;
  supportsTabbedTextEditor: (file: AgentXLibraryFile) => boolean;
  shouldRenderMarkdownPreview: (file: AgentXLibraryFile) => boolean;
  openActionLabelForFile: (file: Pick<AgentXLibraryFile, 'mimeType' | 'kind'>) => string;
  viewerFallbackMessage: (file: AgentXLibraryFile) => string;
  safeSelectedPdfPreviewUrl: Signal<string | null>;
  textDocumentEditorMode: (fileId: string) => 'write' | 'preview';
  setTextDocumentEditorMode: (fileId: string, mode: 'write' | 'preview') => void;
  onMarkdownMediaRequested: (event: {
    url: string;
    type: 'image' | 'video';
    poster?: string;
  }) => void;
  thumbnailUrlForListItem: (file: AgentXLibraryFile) => string | null;
  onListThumbnailError: (file: AgentXLibraryFile, thumbnailUrl: string) => void;
  setTransientListThumbnail: (fileId: string, thumbnailUrl: string | null | undefined) => void;
  importFiles: (
    descriptors: readonly ImportedFileDescriptor[],
    preferredFolderId: string | null,
    target: 'file' | 'film_review'
  ) => Promise<void>;
  importUnifiedUploadFiles: (
    descriptors: readonly ImportedFileDescriptor[],
    preferredFolderId: string | null
  ) => Promise<void>;
  uploadFilmReviewFiles: (
    files: readonly File[],
    selectionMode: 'batch' | 'full',
    options?: { readonly suppressSuccessToast?: boolean },
    preferredFolderId?: string | null
  ) => Promise<void>;
  resolveUploadGroups: (...args: unknown[]) => Promise<unknown>;
  transitionToFilmReview: (
    fileId: string,
    reviewId: string,
    teamId?: string | null
  ) => Promise<void>;
  isUploadMenuOpen: () => boolean;
  draggingFileIds: WritableSignal<ReadonlySet<string>>;
  draggingFolderId: WritableSignal<string | null>;
};

describe('AgentXFilesPanelInnerComponent', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const loadFiles = vi.fn<AgentXFilesService['loadFiles']>();
  const uploadFiles = vi.fn<AgentXFilesService['uploadFiles']>();
  const startUploadFiles = vi.fn<AgentXFilesService['startUploadFiles']>();
  const loadShareCandidates = vi.fn<AgentXFilesService['loadShareCandidates']>();
  const deleteFile = vi.fn<AgentXFilesService['deleteFile']>();
  const moveFile = vi.fn<AgentXFilesService['moveFile']>();
  const createFolder = vi.fn<AgentXFilesService['createFolder']>();
  const updateFolder = vi.fn<AgentXFilesService['updateFolder']>();
  const shareFile = vi.fn<AgentXFilesService['shareFile']>();
  const shareFolder = vi.fn<AgentXFilesService['shareFolder']>();
  const refreshFile = vi.fn<AgentXFilesService['refreshFile']>();
  const getLinkedFilmReviewId = vi.fn<AgentXFilesService['getLinkedFilmReviewId']>();
  const uploadVideo = vi.fn<AgentXVideoUploadService['uploadVideo']>();
  const enqueue = vi.fn<AgentXJobService['enqueue']>();
  const toastSuccess = vi.fn();
  const toastError = vi.fn();
  const toastInfo = vi.fn();
  const extractZipEntries = vi.fn<NxtArchiveService['extractZipEntries']>();
  const openMediaViewer = vi.fn<NxtMediaViewerService['open']>();
  const selectFile = vi.fn<AgentXFilesService['selectFile']>();
  const selectFilmReview = vi.fn<AgentXFilmReviewService['select']>();
  const loadFilmReviews = vi.fn<AgentXFilmReviewService['load']>();
  const createFilmReviewFromVideo = vi.fn<AgentXFilmReviewService['createFromVideo']>();
  const importFilmReviewBreakdown = vi.fn<AgentXFilmReviewService['importBreakdown']>();
  const ensureReviewDetails = vi.fn<AgentXFilmReviewService['ensureReviewDetails']>();
  const fetchMock = vi.fn<typeof fetch>();
  const createObjectUrlMock = vi.fn<(object: Blob | MediaSource) => string>();
  const revokeObjectUrlMock = vi.fn<(url: string) => void>();
  const filesState = signal<readonly AgentXLibraryFile[]>([]);
  const foldersState = signal<readonly TeamFileFolderDoc[]>([]);
  const reviewState = signal<readonly TeamFilmReviewDoc[]>([]);
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
  } as unknown as unknown as TeamFilmReviewDoc;

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
      fileId === videoFile.id
        ? ({ ...videoFile } as AgentXLibraryFile)
        : ({ ...file } as AgentXLibraryFile)
    );
    getLinkedFilmReviewId.mockResolvedValue(null);
    loadFilmReviews.mockResolvedValue(undefined);
    createFilmReviewFromVideo.mockResolvedValue(review);
    importFilmReviewBreakdown.mockResolvedValue({
      filmReview: review,
      playCount: 12,
      rowCount: 12,
      warnings: [],
    });
    ensureReviewDetails.mockResolvedValue();
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
    moveFile.mockResolvedValue(undefined);
    createFolder.mockResolvedValue({ ...folder, id: 'created-folder-1', name: 'Created Folder' });
    updateFolder.mockResolvedValue({ ...folder });
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
    openMediaViewer.mockResolvedValue(null);
    extractZipEntries.mockResolvedValue({
      success: true,
      entries: [
        {
          path: 'notes.txt',
          getData: () => Promise.resolve(new Blob(['notes'], { type: 'text/plain' })),
        },
      ],
    });
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })),
    } as unknown as Response);
    createObjectUrlMock.mockReturnValue('blob:pdf-preview-default');

    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectUrlMock,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectUrlMock,
      configurable: true,
      writable: true,
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
            moveFile,
            createFolder,
            updateFolder,
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
            createFromVideo: createFilmReviewFromVideo,
            importBreakdown: importFilmReviewBreakdown,
            ensureReviewDetails,
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
            success: toastSuccess,
            error: toastError,
            info: toastInfo,
          },
        },
        {
          provide: NxtArchiveService,
          useValue: {
            extractZipEntries,
          },
        },
        {
          provide: NxtMediaViewerService,
          useValue: {
            open: openMediaViewer,
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreateObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectURL,
      configurable: true,
      writable: true,
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
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';

    const importUnifiedUploadFilesSpy = vi
      .spyOn(componentAccess, 'importUnifiedUploadFiles')
      .mockResolvedValue(undefined);
    const input = {
      files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
      value: '',
    } as unknown as HTMLInputElement;

    componentAccess.queuedUploadFolderId.set('folder-1');
    await componentAccess.onFilesSelected({ target: input } as unknown as Event);

    expect(importUnifiedUploadFilesSpy).toHaveBeenCalledTimes(1);
    expect(importUnifiedUploadFilesSpy.mock.calls[0]?.[1]).toBe('folder-1');
  });

  it('allows file uploads in personal mode without a team target', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = null;

    const importUnifiedUploadFilesSpy = vi
      .spyOn(componentAccess, 'importUnifiedUploadFiles')
      .mockResolvedValue(undefined);
    const input = {
      files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })],
      value: '',
    } as unknown as HTMLInputElement;

    await componentAccess.onFilesSelected({ target: input } as unknown as Event);

    expect(importUnifiedUploadFilesSpy).toHaveBeenCalledTimes(1);
    expect(importUnifiedUploadFilesSpy.mock.calls[0]?.[1]).toBeNull();
  });

  it('routes videos selected from the single upload control into Film Review', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const uploadFilmReviewFilesSpy = vi
      .spyOn(componentAccess, 'uploadFilmReviewFiles')
      .mockResolvedValue(undefined);
    const importFilesSpy = vi.spyOn(componentAccess, 'importFiles').mockResolvedValue(undefined);
    const _files = [
      { file: new File([''], 'file1.mp4'), relativePath: 'file1.mp4' },
      { file: new File([''], 'file2.mp4'), relativePath: 'file2.mp4' },
    ];
    const input = {
      files: [new File(['video'], 'game-film.mp4', { type: 'video/mp4' })],
      value: '',
    } as unknown as HTMLInputElement;

    await componentAccess.onFilesSelected({ target: input } as unknown as Event);

    expect(uploadFilmReviewFilesSpy).toHaveBeenCalledWith(
      [input.files![0]],
      'full',
      { suppressSuccessToast: false },
      null
    );
    expect(importFilesSpy).not.toHaveBeenCalled();
  });

  it('shows a preparation state while ZIP files are being expanded before upload starts', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const importFilesSpy = vi.spyOn(componentAccess, 'importFiles').mockImplementation(async () => {
      expect(componentAccess.isPreparingUpload()).toBe(false);
    });
    let resolveZipExtraction:
      | ((value: Awaited<ReturnType<typeof extractZipEntries>>) => void)
      | null = null;
    extractZipEntries.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveZipExtraction = resolve;
        })
    );

    const input = {
      files: [new File(['zip-bytes'], 'team-assets.zip', { type: 'application/zip' })],
      value: '',
    } as unknown as HTMLInputElement;

    const pendingSelection = componentAccess.onFilesSelected({ target: input } as unknown as Event);
    await Promise.resolve();

    expect(componentAccess.isPreparingUpload()).toBe(true);
    expect(componentAccess.uploadPreparationCurrentItem()).toBe(1);
    expect(componentAccess.uploadPreparationTotalItems()).toBe(1);
    expect(componentAccess.uploadPreparationCurrentFileName()).toBe('team-assets.zip');
    expect(importFilesSpy).not.toHaveBeenCalled();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resolveZipExtraction as any)?.({
      success: true,
      entries: [{ path: 'notes.txt', blob: new Blob(['notes'], { type: 'text/plain' }) }],
    });
    await pendingSelection;

    expect(componentAccess.isPreparingUpload()).toBe(false);
    expect(importFilesSpy).toHaveBeenCalledTimes(1);
  });

  it('expands dropped ZIP files before importing them into Team Files', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const importFilesSpy = vi.spyOn(componentAccess, 'importFiles').mockResolvedValue(undefined);
    const zipFile = new File(['zip-bytes'], 'practice-pack.zip', { type: 'application/zip' });
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    await componentAccess.onLibraryDrop({
      preventDefault,
      stopPropagation,
      dataTransfer: {
        types: ['Files'],
        items: [],
        files: [zipFile],
      },
    } as unknown as DragEvent);

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(extractZipEntries).toHaveBeenCalledWith(zipFile);
    expect(importFilesSpy).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          relativePath: 'practice-pack/notes.txt',
          file: expect.objectContaining({ name: 'notes.txt', type: 'text/plain' }),
        }),
      ],
      null,
      'file'
    );
  });

  it('cancels the active Team Files upload handle and shows cancelling feedback', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const progress = new Subject<AgentXFilesUploadProgress>();
    let rejectUpload: ((error: Error) => void) | null = null;
    const cancel = vi.fn(() => {
      progress.next({
        phase: 'cancelled',
        currentFile: 1,
        totalFiles: 1,
        currentFileName: 'notes.txt',
        percent: 0,
        canCancel: false,
      });
      rejectUpload?.(new Error(FILES_UPLOAD_CANCELLED_MESSAGE));
      progress.complete();
    });
    startUploadFiles.mockReturnValueOnce({
      progress$: progress.asObservable(),
      result: new Promise((_, reject) => {
        rejectUpload = reject;
      }),
      cancel,
    });

    const pendingUpload = componentAccess.importFiles(
      [{ file: new File(['notes'], 'notes.txt', { type: 'text/plain' }), relativePath: null }],
      null,
      'file'
    );
    await Promise.resolve();
    await Promise.resolve();
    progress.next({
      phase: 'uploading',
      currentFile: 1,
      totalFiles: 1,
      currentFileName: 'notes.txt',
      percent: 25,
      canCancel: true,
    });

    componentAccess.cancelActiveFilesUpload();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(componentAccess.isCancellingFilesUpload()).toBe(true);
    expect(componentAccess.filesUploadCanCancel()).toBe(false);

    await pendingUpload;

    expect(toastInfo).toHaveBeenCalledWith('Upload cancelled.');
    expect(componentAccess.isCancellingFilesUpload()).toBe(false);
  });

  it('cancels the active Film Review video upload handle from the shared cancel button', async () => {
    const auth = TestBed.inject(Auth);
    Object.assign(auth, {
      currentUser: {
        uid: 'user-1',
        getIdToken: vi.fn().mockResolvedValue('token-1'),
      },
    });
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const progress = new Subject<{ phase: 'uploading' | 'cancelled'; percent: number }>();
    const cancel = vi.fn(() => {
      progress.next({ phase: 'cancelled', percent: 0 });
      progress.complete();
    });
    uploadVideo.mockReturnValueOnce({
      progress$: progress.asObservable(),
      cancel,
    });

    const pendingUpload = componentAccess.uploadFilmReviewFiles(
      [new File(['video'], 'clip.mp4', { type: 'video/mp4' })],
      'full'
    );
    await Promise.resolve();
    await Promise.resolve();
    progress.next({ phase: 'uploading', percent: 10 });

    componentAccess.cancelActiveFilesUpload();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(componentAccess.isCancellingFilesUpload()).toBe(true);
    expect(componentAccess.filesUploadCanCancel()).toBe(false);

    await pendingUpload;

    expect(toastInfo).toHaveBeenCalledWith('Upload cancelled.');
    expect(componentAccess.isCancellingFilesUpload()).toBe(false);
  });

  it('falls back from broken saved thumbnails to Cloudflare thumbnail candidates', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    expect(componentAccess.thumbnailUrlForListItem(videoFile)).toBe(videoFile.thumbnailUrl);

    componentAccess.onListThumbnailError(videoFile, videoFile.thumbnailUrl);

    expect(componentAccess.thumbnailUrlForListItem(videoFile)).toBe(
      'https://videodelivery.net/cf-video-1/thumbnails/thumbnail.jpg'
    );
  });

  it('renders no thumbnail URL after all list thumbnail candidates fail', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const cloudflareThumbnailUrl = 'https://videodelivery.net/cf-video-1/thumbnails/thumbnail.jpg';

    componentAccess.onListThumbnailError(videoFile, videoFile.thumbnailUrl);
    componentAccess.onListThumbnailError(videoFile, cloudflareThumbnailUrl);

    expect(componentAccess.thumbnailUrlForListItem(videoFile)).toBeNull();
  });

  it('uses a transient list thumbnail for videos without a persisted poster', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const fileWithoutThumbnail = {
      ...videoFile,
      thumbnailUrl: undefined,
      cloudflareVideoId: undefined,
    } as AgentXLibraryFile;

    componentAccess.setTransientListThumbnail(
      fileWithoutThumbnail.id,
      'blob:https://app.nxt1.test/transient-thumb'
    );

    expect(componentAccess.thumbnailUrlForListItem(fileWithoutThumbnail)).toBe(
      'blob:https://app.nxt1.test/transient-thumb'
    );
  });

  it('generates a stable list thumbnail for pdf files', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const pdfFile = {
      ...file,
      id: 'pdf-1',
      name: 'Weekly Playbook.pdf',
      normalizedName: 'weekly playbook.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
      url: 'https://cdn.example.com/weekly-playbook.pdf',
    } as AgentXLibraryFile;

    const thumbnailUrl = componentAccess.thumbnailUrlForListItem(pdfFile);

    expect(thumbnailUrl).toContain('data:image/svg+xml');
    expect(componentAccess.thumbnailUrlForListItem(pdfFile)).toBe(thumbnailUrl);
  });

  it('opens the file picker after confirming the chosen upload destination', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const clickSpy = vi.fn();

    Object.defineProperty(component as object, 'fileUploadInput', {
      value: () => ({ nativeElement: { click: clickSpy } }),
    });

    componentAccess.openFilePicker(new Event('click'));
    componentAccess.onUploadSourceSelect('files');
    componentAccess.onUploadDestinationSelect('folder-1');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(componentAccess.lastUsedUploadFolderId()).toBe('folder-1');
    expect(componentAccess.isUploadMenuOpen()).toBe(false);
  });

  it('opens the folder picker immediately after choosing a folder upload destination', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const fileClickSpy = vi.fn();
    const folderClickSpy = vi.fn();

    Object.defineProperty(component as object, 'fileUploadInput', {
      value: () => ({ nativeElement: { click: fileClickSpy } }),
    });
    Object.defineProperty(component as object, 'folderUploadInput', {
      value: () => ({ nativeElement: { click: folderClickSpy } }),
    });

    componentAccess.openFilePicker(new Event('click'));
    componentAccess.onUploadSourceSelect('folder');
    componentAccess.onUploadDestinationSelect('folder-1');

    expect(folderClickSpy).toHaveBeenCalledTimes(1);
    expect(fileClickSpy).not.toHaveBeenCalled();
    expect(componentAccess.lastUsedUploadFolderId()).toBe('folder-1');
    expect(componentAccess.isUploadMenuOpen()).toBe(false);
  });

  it('opens the zip picker immediately after choosing a zip upload destination', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const fileClickSpy = vi.fn();
    const folderClickSpy = vi.fn();
    const zipClickSpy = vi.fn();

    Object.defineProperty(component as object, 'fileUploadInput', {
      value: () => ({ nativeElement: { click: fileClickSpy } }),
    });
    Object.defineProperty(component as object, 'folderUploadInput', {
      value: () => ({ nativeElement: { click: folderClickSpy } }),
    });
    Object.defineProperty(component as object, 'zipUploadInput', {
      value: () => ({ nativeElement: { click: zipClickSpy } }),
    });

    componentAccess.openFilePicker(new Event('click'));
    componentAccess.onUploadSourceSelect('zip');
    componentAccess.onUploadDestinationSelect('folder-1');

    expect(zipClickSpy).toHaveBeenCalledTimes(1);
    expect(fileClickSpy).not.toHaveBeenCalled();
    expect(folderClickSpy).not.toHaveBeenCalled();
    expect(componentAccess.lastUsedUploadFolderId()).toBe('folder-1');
    expect(componentAccess.isUploadMenuOpen()).toBe(false);
  });

  it('starts on upload type selection and seeds destination after picking the source', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    componentAccess.lastUsedUploadFolderId.set('folder-1');
    componentAccess.openFilePicker(new Event('click'));

    expect(componentAccess.uploadDestinationMenuStep()).toBe('menu');
    expect(componentAccess.uploadSelectionSource()).toBeNull();
    expect(componentAccess.uploadDestinationFolderId()).toBeNull();

    componentAccess.onUploadSourceSelect('files');

    expect(componentAccess.uploadDestinationMenuStep()).toBe('destination');
    expect(componentAccess.uploadSelectionSource()).toBe('files');
    expect(componentAccess.uploadDestinationFolderId()).toBe('folder-1');
  });

  it('uses personal scope for delete when a file has no explicit team share', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = null;

    await componentAccess.onFileDeleteConfirm(file, new Event('click'));

    expect(deleteFile).toHaveBeenCalledWith('file-1', null);
  });

  it('creates top-level folders in personal scope even when an active team is present', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';

    componentAccess.folderNameDraft.set('Practice Plans');

    await componentAccess.onFolderCreateConfirm(new Event('submit'));

    expect(createFolder).toHaveBeenCalledWith({
      teamId: null,
      name: 'Practice Plans',
      parentId: null,
    });
  });

  it('allows dragging read-only files before drop validation', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const readOnlyFile = {
      ...file,
      id: 'file-read-only',
      ownerUserId: 'user-2',
      readAccessKeys: ['user:user-1', 'user:user-2'],
      writeAccessKeys: ['user:user-2'],
    } as AgentXLibraryFile;

    filesState.set([readOnlyFile]);

    const preventDefault = vi.fn();
    componentAccess.onFileDragStart(readOnlyFile, [], {
      preventDefault,
      dataTransfer: null,
    } as unknown as DragEvent);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(componentAccess.draggingFileIds().has(readOnlyFile.id)).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('blocks folder-drop move calls for read-only files before service mutation', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const readOnlyFile = {
      ...file,
      id: 'file-read-only-drop',
      ownerUserId: 'user-2',
      folderId: null,
      readAccessKeys: ['user:user-1', 'user:user-2'],
      writeAccessKeys: ['user:user-2'],
    } as AgentXLibraryFile;

    filesState.set([readOnlyFile]);
    componentAccess.draggingFileIds.set(new Set([readOnlyFile.id]));

    await componentAccess.onFolderDrop(folderNode, {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: null,
    } as unknown as DragEvent);

    expect(moveFile).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(
      'This item is shared as read-only. You can view it, but you cannot move or edit it.'
    );
  });

  it('moves personal files into legacy user-only folders even when they still have teamId metadata', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const personalFile = {
      ...file,
      id: 'file-personal',
      teamId: undefined,
      folderId: null,
    } as AgentXLibraryFile;

    filesState.set([personalFile]);
    componentAccess.draggingFileIds.set(new Set([personalFile.id]));

    await componentAccess.onFolderDrop(folderNode, {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: null,
    } as unknown as DragEvent);

    expect(moveFile).toHaveBeenCalledWith('file-personal', null, 'folder-1');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('blocks folder-drop move calls when a personal file is dropped into an explicitly team-shared folder', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const teamSharedFolder = {
      ...folder,
      readAccessKeys: ['user:user-1', 'team:team-77'],
      writeAccessKeys: ['user:user-1'],
    } as TeamFileFolderDoc;
    const teamSharedFolderNode = {
      ...folderNode,
      source: teamSharedFolder,
    } as AgentXLibraryFolderTreeNode;
    const personalFile = {
      ...file,
      id: 'file-personal',
      teamId: undefined,
      folderId: null,
    } as AgentXLibraryFile;

    filesState.set([personalFile]);
    componentAccess.draggingFileIds.set(new Set([personalFile.id]));

    await componentAccess.onFolderDrop(teamSharedFolderNode, {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: null,
    } as unknown as DragEvent);

    expect(moveFile).toHaveBeenCalledWith('file-personal', 'team-77', 'folder-1');
    expect(toastError).not.toHaveBeenCalled();
  });

  it('moves a dragged folder back to top level when dropped on library surface', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const nestedFolder = {
      ...folder,
      id: 'folder-nested',
      parentId: 'folder-parent',
    } as TeamFileFolderDoc;

    foldersState.set([nestedFolder]);
    componentAccess.draggingFolderId.set('folder-nested');

    await componentAccess.onTopLevelDrop({
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: null,
    } as unknown as DragEvent);

    expect(updateFolder).toHaveBeenCalledWith('folder-nested', {
      teamId: null,
      parentId: null,
    });
  });

  it('stages file share candidate toggles until submit', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    await componentAccess.onFileShareStart(file, new Event('click'));
    await componentAccess.onFileShareCandidateToggled(file, {
      candidate: {
        id: 'user-2',
        displayName: 'User Two',
        avatarUrl: null,
        email: 'user2@example.com',
      },
      checked: true,
    });

    expect(shareFile).not.toHaveBeenCalled();

    await componentAccess.onFileShareConfirm(file, new Event('click'));

    expect(shareFile).toHaveBeenCalledWith('file-1', {
      action: 'add',
      permission: 'read',
      principalType: 'user',
      principalId: 'user-2',
    });
  });

  it('stages folder share candidate toggles until submit', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    await componentAccess.onFolderShareStart(folderNode, new Event('click'));
    await componentAccess.onFolderShareCandidateToggled(folderNode, {
      candidate: {
        id: 'user-2',
        displayName: 'User Two',
        avatarUrl: null,
        email: 'user2@example.com',
      },
      checked: true,
    });

    expect(shareFolder).not.toHaveBeenCalled();

    await componentAccess.onFolderShareConfirm(folderNode, new Event('click'));

    expect(shareFolder).toHaveBeenCalledWith('folder-1', {
      action: 'add',
      permission: 'read',
      principalType: 'user',
      principalId: 'user-2',
    });
  });

  it('routes Learn this file as a same-record Team Files action without coordinator pinning', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';

    await componentAccess.generateNotes(file);

    expect(enqueue).toHaveBeenCalledWith(
      expect.stringContaining('Review the selected Team Files item titled "Shared Report"'),
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
    const componentAccess = component as unknown as FilesPanelTestAccess;

    expect(componentAccess.canManageFileSharing(file)).toBe(true);
    expect(componentAccess.canManageFolderSharing(folderNode)).toBe(true);
  });

  it('keeps plain videos in the generic viewer until film review is started', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';
    component.sport = 'basketball';

    await componentAccess.openFile(videoFile);

    expect(refreshFile).toHaveBeenCalledWith('video-1', 'team-77', {});
    expect(getLinkedFilmReviewId).toHaveBeenCalledWith('video-1', 'team-77');
    expect(componentAccess.viewerMode()).toBe('generic');
    expect(componentAccess.selectedFilmReviewId()).toBeNull();
  });

  it('refreshes personal pdf files with inline disposition before opening them', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = null;

    const personalPdfFile = {
      ...file,
      id: 'pdf-1',
      teamId: undefined,
      name: 'Quick Test PDF.pdf',
      normalizedName: 'quick test pdf.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
      url: 'https://cdn.example.com/quick-test.pdf',
      storagePath: 'Users/user-1/threads/thread-1/exports/quick-test.pdf',
    } as AgentXLibraryFile;
    const refreshedPdfFile = {
      ...personalPdfFile,
      url: 'https://api.nxt1.test/api/v1/agent-x/media-proxy/export/Quick%20Test%20PDF.pdf?path=Users%2Fuser-1%2Fthreads%2Fthread-1%2Fexports%2Fquick-test.pdf&mime=application%2Fpdf&exp=1750000000&sig=abc123&disposition=inline',
    } as AgentXLibraryFile;

    refreshFile.mockResolvedValueOnce(refreshedPdfFile);

    await componentAccess.openFile(personalPdfFile);

    expect(refreshFile).toHaveBeenCalledWith('pdf-1', null, { disposition: 'inline' });
    expect(selectFile).toHaveBeenLastCalledWith('pdf-1');
    expect(componentAccess.viewerMode()).toBe('generic');
  });

  it('loads selected pdf previews into a blob URL for inline rendering', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = null;

    const personalPdfFile = {
      ...file,
      id: 'pdf-blob-1',
      teamId: undefined,
      name: 'Inline Preview.pdf',
      normalizedName: 'inline preview.pdf',
      mimeType: 'application/pdf',
      kind: 'pdf',
      url: 'https://cdn.example.com/inline-preview.pdf',
      storagePath: 'Users/user-1/threads/thread-1/exports/inline-preview.pdf',
    } as AgentXLibraryFile;
    const refreshedPdfFile = {
      ...personalPdfFile,
      url: 'https://api.nxt1.test/api/v1/agent-x/media-proxy/export/Inline%20Preview.pdf?path=Users%2Fuser-1%2Fthreads%2Fthread-1%2Fexports%2Finline-preview.pdf&mime=application%2Fpdf&exp=1750000000&sig=blob123&disposition=inline',
    } as AgentXLibraryFile;

    refreshFile.mockImplementationOnce(async () => {
      filesState.update((current) => [...current, refreshedPdfFile]);
      return refreshedPdfFile;
    });
    createObjectUrlMock.mockReturnValueOnce('blob:pdf-preview-1');

    await componentAccess.openFile(personalPdfFile);
    TestBed.flushEffects();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0] ?? '')).toContain('disposition=inline');
    expect(componentAccess.safeSelectedPdfPreviewUrl()).toBe('blob:pdf-preview-1');

    component.ngOnDestroy();

    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:pdf-preview-1');
  });

  it('preserves existing generic file tabs when returning to the library to add another file', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';
    component.sport = 'basketball';

    await componentAccess.openFile(file);
    component.openVideoFromLibrary();
    await componentAccess.openFile(videoFile);

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

  it('opens markdown-requested media in the shared overlay viewer', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';

    await componentAccess.openFile(file);
    componentAccess.onMarkdownMediaRequested({
      url: 'https://cdn.example.com/embedded-clip.mp4',
      type: 'video',
      poster: 'https://cdn.example.com/embedded-clip.jpg',
    });

    expect(openMediaViewer).toHaveBeenCalledWith({
      items: [
        {
          url: 'https://cdn.example.com/embedded-clip.mp4',
          type: 'video',
          poster: 'https://cdn.example.com/embedded-clip.jpg',
        },
      ],
      initialIndex: 0,
      source: 'agent-x-chat',
      presentation: 'overlay',
    });
    expect(componentAccess.viewerMode()).toBe('generic');
    expect(component.selectedId()).toBe('file-1');
    expect(component.selectedTabId()).toBe('file:file-1');
  });

  it('keeps film review pills visible after opening another file from the library', async () => {
    getLinkedFilmReviewId.mockResolvedValue('review-1');
    reviewState.set([review]);

    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
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

    await componentAccess.openFile(videoFile);

    expect(component.visibleOpenTabs().map((tab) => tab.id)).toEqual(['review:review-1']);
    expect(component.selectedTabId()).toBe('review:review-1');

    component.openVideoFromLibrary();
    await componentAccess.openFile(file);

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
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const context = componentAccess.buildFileDragContext(nativeReviewVideoFile);

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
    expect(context.media).toBeUndefined();
    expect(context.summary).toContain('Explosive plays came from condensed formations.');
    expect(context.summary).toContain('Hudl breakdown');
  });

  it('marks native and linked review videos with a Film Review badge', () => {
    reviewState.set([review]);

    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    expect(componentAccess.shouldShowFilmReviewBadge(nativeReviewVideoFile)).toBe(true);
    expect(componentAccess.shouldShowFilmReviewBadge(videoFile)).toBe(true);
    expect(componentAccess.shouldShowFilmReviewBadge(file)).toBe(false);
  });

  it('upgrades linked review source videos into pointer-only film review drag contexts', () => {
    reviewState.set([
      {
        ...review,
        title: 'Week 4 Cutup',
        opponentName: 'Central High',
        aiSummary: 'Explosive plays came from condensed formations.',
        breakdownSource: {
          provider: 'hudl',
          fileName: 'week-4.csv',
          mimeType: 'text/csv',
          rowCount: 12,
          playCount: 12,
          importedBy: 'user-1',
          importedAt: '2026-06-24T00:00:00.000Z',
        },
        sources: [
          {
            id: 'source-1',
            order: 0,
            fileId: 'video-1',
            videoUrl: 'https://cdn.example.com/game-tape.mp4',
            title: 'End Zone',
          },
          {
            id: 'source-2',
            order: 1,
            videoUrl: 'https://cdn.example.com/game-tape-alt.mp4',
            title: 'Sideline',
          },
        ],
        timeline: [
          {
            id: 'play-1',
            number: 1,
            label: 'Inside zone left',
            startSec: 12,
            endSec: 18,
            sourceId: 'source-1',
          },
          {
            id: 'play-2',
            number: 2,
            label: 'Play action cross',
            startSec: 19,
            endSec: 26,
            sourceId: 'source-2',
          },
        ],
      },
    ]);

    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const context = componentAccess.buildFileDragContext(videoFile);

    expect(context).toMatchObject({
      id: 'film-review:review-1',
      kind: 'film_play',
      title: 'Week 4 Cutup',
      source: {
        type: 'film_review',
        id: 'review-1',
        label: 'Week 4 Cutup',
      },
      metadata: {
        itemType: 'film_review',
        reviewId: 'review-1',
        opponentName: 'Central High',
        playCount: 2,
        sourceCount: 2,
      },
    });
    expect(context.entityRefs).toEqual([
      { type: 'film_review', id: 'review-1', label: 'Week 4 Cutup' },
      { type: 'team_file', id: 'video-1', label: 'Game Tape.mp4' },
    ]);
    expect(context.media).toBeUndefined();
    expect(JSON.stringify(context)).not.toContain('https://cdn.example.com/game-tape.mp4');
    expect(JSON.stringify(context)).not.toContain('https://cdn.example.com/game-tape-alt.mp4');
    expect(context.summary).toContain('Explosive plays came from condensed formations.');
    expect(context.summary).toContain('Hudl breakdown');
  });

  it('builds viewer summary and notes drag contexts from current drafts', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    const fileWithText = {
      ...file,
      summary: 'Initial summary',
      textContent: 'Initial notes',
    } as AgentXLibraryFile;

    const summaryContext = componentAccess.buildFileSummaryDragContext(fileWithText);
    const notesContext = componentAccess.buildFileNotesDragContext(fileWithText);

    expect(summaryContext).not.toBeNull();
    expect(notesContext).not.toBeNull();

    expect(summaryContext).toMatchObject({
      id: 'team-file:file-1:summary',
      title: 'Summary: Shared Report',
      summary: 'Initial summary',
      metadata: {
        itemType: 'team_file',
        viewerField: 'summary',
        viewerFieldLength: 15,
      },
    });

    expect(notesContext).toMatchObject({
      id: 'team-file:file-1:notes',
      title: 'Notes: Shared Report',
      summary: 'Initial notes',
      metadata: {
        itemType: 'team_file',
        viewerField: 'notes',
        viewerFieldLength: 13,
      },
    });
  });

  it('routes all text documents to the context editor instead of the preview stage', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';

    expect(componentAccess.isTextDocument(uploadedTextFile)).toBe(true);
    expect(componentAccess.isTextDocument(generatedTextFile)).toBe(true);
    expect(componentAccess.supportsTabbedTextEditor(uploadedTextFile)).toBe(true);
    expect(componentAccess.shouldRenderMarkdownPreview(uploadedTextFile)).toBe(true);
    expect(componentAccess.shouldRenderMarkdownPreview(generatedTextFile)).toBe(true);
    expect(componentAccess.shouldRenderViewerStage(uploadedTextFile)).toBe(false);
    expect(componentAccess.shouldRenderViewerStage(generatedTextFile)).toBe(false);
    expect(componentAccess.shouldShowViewerUploadAction(uploadedTextFile)).toBe(true);
    expect(componentAccess.shouldShowViewerUploadAction(generatedTextFile)).toBe(true);
    expect(componentAccess.shouldShowViewerFileActions(uploadedTextFile)).toBe(false);
    expect(componentAccess.shouldShowViewerFileActions(generatedTextFile)).toBe(false);

    component.teamId = null;
    expect(componentAccess.shouldShowViewerUploadAction(generatedTextFile)).toBe(false);
  });

  it('renders the file viewer stage for a spreadsheet asset that also has markdown notes', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const spreadsheetWithNotes = {
      ...generatedTextFile,
      id: 'practice-script-spreadsheet-1',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      url: 'https://cdn.example.com/practice-script.xlsx',
      storagePath: 'Users/user-1/threads/thread-1/exports/practice-script.xlsx',
    } as AgentXLibraryFile;

    expect(componentAccess.isTextDocument(spreadsheetWithNotes)).toBe(false);
    expect(componentAccess.supportsTabbedTextEditor(spreadsheetWithNotes)).toBe(true);
    expect(componentAccess.shouldRenderMarkdownPreview(spreadsheetWithNotes)).toBe(true);
    expect(componentAccess.shouldRenderViewerStage(spreadsheetWithNotes)).toBe(true);
    expect(componentAccess.shouldShowViewerFileActions(spreadsheetWithNotes)).toBe(true);
  });

  it('uses presentation-specific external-open guidance for pptx assets', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const presentationDeck = {
      ...generatedTextFile,
      id: 'playbook-presentation-1',
      kind: 'pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      url: 'https://cdn.example.com/playbook-2.pptx',
      storagePath: 'Users/user-1/threads/thread-1/exports/playbook-2.pptx',
    } as AgentXLibraryFile;

    expect(componentAccess.openActionLabelForFile(presentationDeck)).toBe('Open Presentation');
    expect(componentAccess.viewerFallbackMessage(presentationDeck)).toBe(
      'Inline preview is not available for presentation decks right now. Download it or open it in Microsoft PowerPoint or Google Slides to review.'
    );
  });

  it('defaults text document editor tabs to preview mode and allows write switching', () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

    expect(componentAccess.textDocumentEditorMode(uploadedTextFile.id)).toBe('preview');

    componentAccess.setTextDocumentEditorMode(uploadedTextFile.id, 'write');

    expect(componentAccess.textDocumentEditorMode(uploadedTextFile.id)).toBe('write');
  });

  it('transitions the uploaded film review directly into the review panel', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';
    component.sport = 'basketball';

    const uploadedVideo = { ...videoFile, id: 'uploaded-video-1' } as AgentXLibraryFile;
    refreshFile.mockResolvedValue(uploadedVideo);
    const transitionToFilmReviewSpy = vi
      .spyOn(componentAccess, 'transitionToFilmReview')
      .mockResolvedValue(undefined);
    const resolveUploadGroupsSpy = vi
      .spyOn(componentAccess, 'resolveUploadGroups')
      .mockResolvedValue([
        { files: [new File(['video'], 'upload.mp4', { type: 'video/mp4' })], folderId: null },
      ]);

    await componentAccess.importFiles(
      [
        {
          file: new File(['video'], 'upload.mp4', { type: 'video/mp4' }),
          relativePath: 'upload.mp4',
        },
      ],
      null,
      'film_review'
    );

    expect(resolveUploadGroupsSpy).toHaveBeenCalled();
    expect(startUploadFiles).toHaveBeenCalled();
    expect(loadFiles).toHaveBeenCalledWith('team-77');
    expect(refreshFile).toHaveBeenCalledWith('uploaded-video-1', 'team-77');
    expect(transitionToFilmReviewSpy).toHaveBeenCalledWith(
      'uploaded-video-1',
      'uploaded-video-1',
      'team-77'
    );
  });

  it('auto-routes clip folders with one breakdown sheet into a sorted batch Film Review upload', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    const uploadFilmReviewFilesSpy = vi
      .spyOn(componentAccess, 'uploadFilmReviewFiles')
      .mockResolvedValue(undefined);
    const importFilesSpy = vi.spyOn(componentAccess, 'importFiles').mockResolvedValue(undefined);
    const clip10 = new File(['video'], 'clip-10.mp4', { type: 'video/mp4' });
    const clip2 = new File(['video'], 'clip-2.mp4', { type: 'video/mp4' });
    const breakdown = new File(['breakdown'], 'breakdown.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const dsStore = new File(['metadata'], '.DS_Store', { type: '' });

    await componentAccess.importUnifiedUploadFiles(
      [
        { file: breakdown, relativePath: 'travis/breakdown.xlsx' },
        { file: clip10, relativePath: 'travis/clips/clip-10.mp4' },
        { file: clip2, relativePath: 'travis/clips/clip-2.mp4' },
        { file: dsStore, relativePath: 'travis/.DS_Store' },
      ],
      'folder-1'
    );

    expect(uploadFilmReviewFilesSpy).toHaveBeenCalledWith(
      [clip2, clip10, breakdown],
      'batch',
      { suppressSuccessToast: false },
      'folder-1'
    );
    expect(importFilesSpy).not.toHaveBeenCalled();
  });

  it('keeps opening film review state until the panel finishes selecting the review', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;

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

    const transitionPromise = componentAccess.transitionToFilmReview('video-1', 'review-1');

    await Promise.resolve();

    expect(componentAccess.isOpeningFilmReview()).toBe(true);
    expect(componentAccess.viewerMode()).toBe('video');
    expect(selectFilmReview).toHaveBeenCalledWith(null);
    expect(selectedReviewIdState()).toBeNull();
    expect(onSelectReview).not.toHaveBeenCalled();
    expect(ensureReviewDetails).toHaveBeenCalledWith('review-1', undefined, true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resolveRefresh as any)?.();
    await transitionPromise;

    expect(refreshData).toHaveBeenCalled();
    expect(onSelectReview).toHaveBeenCalledWith('review-1');
    expect(selectedReviewIdState()).toBe('review-1');
    expect(componentAccess.isOpeningFilmReview()).toBe(false);
  });

  it('opens the created film review even when the files index row is not ready yet', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';
    component.sport = 'basketball';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(component as any, 'readVideoDurationSec').mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('Thumbnail capture disabled in test');
    });

    const auth = TestBed.inject(Auth);
    Object.assign(auth, {
      currentUser: {
        uid: 'user-1',
        getIdToken: vi.fn().mockResolvedValue('token-1'),
      },
    });

    uploadVideo.mockReturnValue({
      progress$: new Observable((subscriber) => {
        Promise.resolve().then(() => {
          subscriber.next({
            phase: 'complete',
            percent: 100,
            streamUrl: 'https://stream.example.com/video-1.m3u8',
            downloadUrl: 'https://cdn.example.com/video-1.mp4',
            storagePath: 'teams/team-77/video-1.mp4',
            cloudflareVideoId: 'cf-uploaded-1',
            readyToStream: true,
          });
        });
      }),
      cancel: vi.fn(),
    });
    createFilmReviewFromVideo.mockResolvedValue({
      ...review,
      id: 'uploaded-video-1',
      fileId: 'uploaded-video-1',
      videoUrl: 'https://stream.example.com/video-1.m3u8',
      storagePath: 'teams/team-77/video-1.mp4',
      cloudflareVideoId: 'cf-uploaded-1',
    });
    refreshFile.mockRejectedValue(new Error('File not indexed yet'));

    const refreshData = vi.fn(async () => undefined);
    const onSelectReview = vi.fn(async (reviewId: string) => {
      selectFilmReview(reviewId);
    });

    Object.defineProperty(component as object, 'filmReviewPanel', {
      value: () => ({
        refreshData,
        onSelectReview,
      }),
    });

    await componentAccess.uploadFilmReviewFiles(
      [new File(['video'], 'upload.mp4', { type: 'video/mp4' })],
      'full'
    );

    expect(createFilmReviewFromVideo).toHaveBeenCalled();
    expect(refreshFile).toHaveBeenCalledWith('uploaded-video-1', 'team-77');
    expect(componentAccess.viewerMode()).toBe('video');
    expect(componentAccess.selectedFilmReviewId()).toBe('uploaded-video-1');
    expect(onSelectReview).toHaveBeenCalledWith('uploaded-video-1');
  });

  it('switches into the film review opening state before the files library refresh completes', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';
    component.sport = 'basketball';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(component as any, 'readVideoDurationSec').mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('Thumbnail capture disabled in test');
    });

    const auth = TestBed.inject(Auth);
    Object.assign(auth, {
      currentUser: {
        uid: 'user-1',
        getIdToken: vi.fn().mockResolvedValue('token-1'),
      },
    });

    uploadVideo.mockReturnValue({
      progress$: new Observable((subscriber) => {
        Promise.resolve().then(() => {
          subscriber.next({
            phase: 'complete',
            percent: 100,
            streamUrl: 'https://stream.example.com/video-1.m3u8',
            downloadUrl: 'https://cdn.example.com/video-1.mp4',
            storagePath: 'teams/team-77/video-1.mp4',
            cloudflareVideoId: 'cf-uploaded-1',
            readyToStream: true,
          });
        });
      }),
      cancel: vi.fn(),
    });
    createFilmReviewFromVideo.mockResolvedValue({
      ...review,
      id: 'uploaded-video-1',
      fileId: 'uploaded-video-1',
      videoUrl: 'https://stream.example.com/video-1.m3u8',
      storagePath: 'teams/team-77/video-1.mp4',
      cloudflareVideoId: 'cf-uploaded-1',
    });

    let resolveLoadFiles: (() => void) | null = null;
    loadFiles.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveLoadFiles = resolve;
        })
    );

    const uploadPromise = componentAccess.uploadFilmReviewFiles(
      [new File(['video'], 'upload.mp4', { type: 'video/mp4' })],
      'full'
    );

    await vi.waitFor(() => {
      expect(loadFiles).toHaveBeenCalledWith('team-77');
      expect(componentAccess.viewerMode()).toBe('video');
      expect(componentAccess.selectedFilmReviewId()).toBe('uploaded-video-1');
      expect(componentAccess.isOpeningFilmReview()).toBe(true);
      expect(componentAccess.openingFilmReviewTeamId()).toBe('team-77');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resolveLoadFiles as any)?.();
    await uploadPromise;
  });

  it('ignores macOS metadata files during film review uploads', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';
    component.sport = 'football';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(component as any, 'readVideoDurationSec').mockResolvedValue(undefined);
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      throw new Error('Thumbnail capture disabled in test');
    });

    const auth = TestBed.inject(Auth);
    Object.assign(auth, {
      currentUser: {
        uid: 'user-1',
        getIdToken: vi.fn().mockResolvedValue('token-1'),
      },
    });

    uploadVideo.mockReturnValue({
      progress$: new Observable((subscriber) => {
        Promise.resolve().then(() => {
          subscriber.next({
            phase: 'complete',
            percent: 100,
            streamUrl: 'https://stream.example.com/video-1.m3u8',
            storagePath: 'teams/team-77/video-1.mp4',
            readyToStream: true,
          });
        });
      }),
      cancel: vi.fn(),
    });
    createFilmReviewFromVideo.mockResolvedValue({
      ...review,
      id: 'uploaded-video-1',
      fileId: 'uploaded-video-1',
      videoUrl: 'https://stream.example.com/video-1.m3u8',
      storagePath: 'teams/team-77/video-1.mp4',
    });

    const video = new File(['video'], 'upload.mp4', { type: 'video/mp4' });
    const dsStore = new File(['metadata'], '.DS_Store', { type: '' });

    await componentAccess.uploadFilmReviewFiles([video, dsStore], 'full');

    expect(uploadVideo).toHaveBeenCalledTimes(1);
    expect(uploadVideo).toHaveBeenCalledWith(video, 'token-1');
    expect(createFilmReviewFromVideo).toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalledWith('Unsupported file type: .DS_Store');
  });

  it('opens native film-review videos without switching through the generic viewer first', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';

    filesState.set([nativeReviewVideoFile]);

    let resolveRefresh: (() => void) | null = null;
    refreshFile.mockImplementation(
      () =>
        new Promise<AgentXLibraryFile>((resolve) => {
          resolveRefresh = () => resolve(nativeReviewVideoFile as AgentXLibraryFile);
        })
    );

    const refreshData = vi.fn(async () => undefined);
    const onSelectReview = vi.fn(async (reviewId: string) => {
      selectFilmReview(reviewId);
    });

    Object.defineProperty(component as object, 'filmReviewPanel', {
      value: () => ({
        refreshData,
        onSelectReview,
      }),
    });

    const openPromise = componentAccess.openFile(nativeReviewVideoFile as AgentXLibraryFile);

    expect(componentAccess.viewerMode()).not.toBe('generic');
    expect(getLinkedFilmReviewId).not.toHaveBeenCalled();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resolveRefresh as any)?.();
    await openPromise;

    expect(componentAccess.viewerMode()).toBe('video');
    expect(refreshData).toHaveBeenCalled();
    expect(onSelectReview).toHaveBeenCalledWith('review-file-1');
    expect(selectedReviewIdState()).toBe('review-file-1');
    expect(loadFilmReviews).not.toHaveBeenCalled();
  });

  it('keeps the first-open film review tab visible after the review finishes loading', async () => {
    const component = TestBed.runInInjectionContext(() => new AgentXFilesPanelInnerComponent());
    const componentAccess = component as unknown as FilesPanelTestAccess;
    component.teamId = 'team-77';

    filesState.set([nativeReviewVideoFile]);

    const nativeReview = {
      ...review,
      id: 'review-file-1',
      fileId: 'review-file-1',
      videoUrl: nativeReviewVideoFile.url,
      storagePath: nativeReviewVideoFile.storagePath,
      cloudflareVideoId: nativeReviewVideoFile.cloudflareVideoId,
      thumbnailUrl: nativeReviewVideoFile.thumbnailUrl,
    } as unknown as TeamFilmReviewDoc;

    let resolveRefresh: (() => void) | null = null;
    refreshFile.mockImplementation(
      () =>
        new Promise<AgentXLibraryFile>((resolve) => {
          resolveRefresh = () => resolve(nativeReviewVideoFile as AgentXLibraryFile);
        })
    );

    const refreshData = vi.fn(async () => undefined);
    const onSelectReview = vi.fn(async (reviewId: string) => {
      reviewState.set([nativeReview]);
      selectFilmReview(reviewId);
    });

    Object.defineProperty(component as object, 'filmReviewPanel', {
      value: () => ({
        refreshData,
        onSelectReview,
      }),
    });

    const openPromise = componentAccess.openFile(nativeReviewVideoFile as AgentXLibraryFile);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (resolveRefresh as any)?.();
    await openPromise;

    expect(component.visibleOpenTabs()).toHaveLength(1);
    expect(component.visibleOpenTabs()[0]?.id).toBe('review:review-file-1');
    expect(component.selectedTabId()).toBe('review:review-file-1');
  });
});
