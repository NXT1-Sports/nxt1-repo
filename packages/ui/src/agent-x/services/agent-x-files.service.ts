import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import type {
  RequestFilmReviewDownloadExportResponse,
  TeamFileFolderDoc,
  TeamFileKind,
  TeamFileOrigin,
  TeamFileStatus,
  UniversalFileClassification,
  UniversalFileDoc,
  UniversalNativeFilePayload,
} from '@nxt1/core';
import { getUniversalBinaryFilePayload, getUniversalStructuredDocumentPayload } from '@nxt1/core';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_NON_VIDEO_FILE_SIZE,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
} from '@nxt1/core/ai';
import { APP_EVENTS } from '@nxt1/core/analytics';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtBreadcrumbService } from '../../services/breadcrumb/breadcrumb.service';
import { NxtToastService } from '../../services/toast/toast.service';
import { ANALYTICS_ADAPTER } from '../../services/analytics/analytics-adapter.token';
import { AGENT_X_API_BASE_URL, AGENT_X_AUTH_TOKEN_FACTORY } from './agent-x-job.service';
import {
  AgentXVideoUploadService,
  VIDEO_UPLOAD_CANCELLED_MESSAGE,
  type VideoUploadProgress,
} from './agent-x-video-upload.service';

export interface AgentXLibraryFile {
  readonly id: string;
  readonly teamId?: string;
  readonly ownerUserId: string;
  readonly organizationId?: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly mimeType: string;
  readonly kind: TeamFileKind;
  readonly status: TeamFileStatus;
  readonly origin: TeamFileOrigin;
  readonly sizeBytes: number;
  readonly url: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly classification?: UniversalFileClassification;
  readonly folderId?: string | null;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
  readonly platform?: string;
  readonly profileUrl?: string;
  readonly faviconUrl?: string;
  readonly sport?: string;
  readonly sourceThreadId?: string;
  readonly sourceMessageId?: string;
  readonly sourceOperationId?: string;
  readonly readAccessKeys?: readonly string[];
  readonly writeAccessKeys?: readonly string[];
  readonly textContent?: string;
  readonly rawData?: Readonly<Record<string, unknown>>;
  readonly rawPayload?: unknown;
  readonly createdAt: UniversalFileDoc['createdAt'];
  readonly updatedAt: UniversalFileDoc['updatedAt'];
  readonly lastSeenAt: NonNullable<UniversalFileDoc['lastSeenAt']>;
}

export type FileSharePrincipalType = 'user' | 'team' | 'organization';
export type FileSharePermission = 'read' | 'write';

export interface AgentXShareCandidate {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly email: string | null;
  readonly sourceScopes: readonly ('team' | 'organization')[];
  readonly teamIds: readonly string[];
  readonly organizationIds: readonly string[];
}

interface UniversalFileLibraryResponse {
  readonly success: boolean;
  readonly data?: {
    readonly files: readonly UniversalFileDoc[];
    readonly folders: readonly TeamFileFolderDoc[];
  };
  readonly error?: string;
}

interface UniversalFileListFilters {
  readonly classification?: string;
  readonly route?: string;
  readonly label?: string;
}

interface UniversalFileResponse {
  readonly success: boolean;
  readonly data?: {
    readonly file: UniversalFileDoc;
  };
  readonly error?: string;
}

interface RefreshFileOptions {
  readonly disposition?: 'attachment' | 'inline';
}

interface UniversalFileIndexResponse {
  readonly success: boolean;
  readonly data?: {
    readonly fileId: string;
  };
  readonly error?: string;
}

interface UniversalFilePromoteAttachmentResponse {
  readonly success: boolean;
  readonly data?: {
    readonly fileId: string;
  };
  readonly error?: string;
}

interface UniversalFolderMutationResponse {
  readonly success: boolean;
  readonly data?: {
    readonly folder: TeamFileFolderDoc;
  };
  readonly error?: string;
}

interface UniversalFileMutationResponse {
  readonly success: boolean;
  readonly data?: {
    readonly fileId: string;
    readonly folderId?: string | null;
  };
  readonly error?: string;
}

interface UniversalFileDeleteResponse {
  readonly success: boolean;
  readonly data?: {
    readonly fileId: string;
  };
  readonly error?: string;
}

interface UniversalFileShareMutationResponse {
  readonly success: boolean;
  readonly data?: {
    readonly fileId: string;
    readonly readAccessKeys: readonly string[];
    readonly writeAccessKeys: readonly string[];
  };
  readonly error?: string;
}

interface UniversalShareCandidatesResponse {
  readonly success: boolean;
  readonly data?: {
    readonly candidates: readonly AgentXShareCandidate[];
  };
  readonly error?: string;
}

interface UniversalFileFilmReviewDownloadExportResponse {
  readonly success: boolean;
  readonly data?: RequestFilmReviewDownloadExportResponse;
  readonly error?: string;
}

interface NonVideoUploadResponse {
  readonly success: boolean;
  readonly data?: {
    readonly url: string;
    readonly storagePath?: string;
    readonly name: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
  };
  readonly error?: string;
}

type UploadFilesOptions = {
  readonly sport?: string | null;
  readonly folderId?: string | null;
  readonly reloadAfterUpload?: boolean;
  readonly suppressSuccessToast?: boolean;
  readonly uploadTarget?: 'file' | 'film_review';
};

type LoadFilesOptions = {
  readonly background?: boolean;
  readonly force?: boolean;
  readonly cacheMaxAgeMs?: number;
};

export const FILES_UPLOAD_CANCELLED_MESSAGE = 'File upload cancelled';

export type AgentXFilesUploadPhase =
  | 'preparing'
  | 'uploading'
  | 'indexing'
  | 'reloading'
  | 'complete'
  | 'cancelled'
  | 'error';

export type AgentXFilesUploadProgress = {
  readonly phase: AgentXFilesUploadPhase;
  readonly currentFile: number;
  readonly totalFiles: number;
  readonly currentFileName: string | null;
  readonly percent: number;
  readonly canCancel: boolean;
  readonly errorMessage?: string;
};

export type AgentXFilesUploadHandle = {
  readonly progress$: Observable<AgentXFilesUploadProgress>;
  readonly result: Promise<readonly string[]>;
  cancel(): void;
};

type NativeFileUploadAttachment = {
  readonly id: string;
  readonly url: string;
  readonly storagePath?: string;
  readonly name: string;
  readonly mimeType: string;
  readonly type: AgentXLibraryFile['kind'];
  readonly sizeBytes: number;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
};

class FilesUploadCancellationController {
  private activeCancel: (() => void) | null = null;
  private cancelled = false;

  bind(cancel: () => void): void {
    if (this.cancelled) {
      cancel();
      return;
    }

    this.activeCancel = cancel;
  }

  clear(cancel?: () => void): void {
    if (!cancel || this.activeCancel === cancel) {
      this.activeCancel = null;
    }
  }

  cancel(): void {
    if (this.cancelled) {
      return;
    }

    this.cancelled = true;
    this.activeCancel?.();
  }

  throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error(FILES_UPLOAD_CANCELLED_MESSAGE);
    }
  }
}

function buildInlineTextDocumentUrl(content: string, mimeType: string): string {
  return `data:${mimeType};charset=utf-8,${encodeURIComponent(content)}`;
}

function inferTextDocumentOrigin(file: UniversalFileDoc): TeamFileOrigin {
  if (
    file.sourceRef?.sourceThreadId ||
    file.sourceRef?.sourceMessageId ||
    file.sourceRef?.sourceOperationId
  ) {
    return 'agent_chat_output';
  }

  return 'files_upload';
}

function inferTextDocumentMimeType(file: UniversalFileDoc): string {
  const structuredPayload = getUniversalStructuredDocumentPayload(file.payload);
  return structuredPayload?.textFormat === 'markdown' ? 'text/markdown' : 'text/plain';
}

function resolveUniversalRawData(
  payload: UniversalNativeFilePayload<string, object>
): Readonly<Record<string, unknown>> | undefined {
  const structuredPayload = getUniversalStructuredDocumentPayload(payload);
  const rawData = structuredPayload?.structuredData ?? payload.content?.data;
  return rawData as Readonly<Record<string, unknown>> | undefined;
}

function buildJsonDocumentUrl(data: Readonly<Record<string, unknown>>): string {
  return `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
}

function readUniversalFileAccessKeys(file: UniversalFileDoc): readonly string[] | undefined {
  const accessKeys = (file as { readonly readAccessKeys?: readonly unknown[] }).readAccessKeys;
  if (!Array.isArray(accessKeys) || accessKeys.length === 0) {
    return undefined;
  }

  const normalizedAccessKeys = accessKeys
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0);

  return normalizedAccessKeys.length > 0 ? normalizedAccessKeys : undefined;
}

function readUniversalFileWriteAccessKeys(file: UniversalFileDoc): readonly string[] | undefined {
  const accessKeys = (file as { readonly writeAccessKeys?: readonly unknown[] }).writeAccessKeys;
  if (!Array.isArray(accessKeys) || accessKeys.length === 0) {
    return undefined;
  }

  const normalizedAccessKeys = accessKeys
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value): value is string => value.length > 0);

  return normalizedAccessKeys.length > 0 ? normalizedAccessKeys : undefined;
}

function normalizeOptionalArtifactString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalArtifactStringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is string => entry.length > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function readUniversalArtifactRecord(file: UniversalFileDoc): Readonly<Record<string, unknown>> {
  return file as unknown as Readonly<Record<string, unknown>>;
}

function readUniversalArtifactSummary(file: UniversalFileDoc): string | undefined {
  return normalizeOptionalArtifactString(readUniversalArtifactRecord(file)['artifactSummary']);
}

function readUniversalArtifactNotes(file: UniversalFileDoc): string | undefined {
  return normalizeOptionalArtifactString(readUniversalArtifactRecord(file)['artifactNotes']);
}

function readUniversalArtifactTags(file: UniversalFileDoc): readonly string[] | undefined {
  return normalizeOptionalArtifactStringArray(readUniversalArtifactRecord(file)['artifactTags']);
}

function buildBaseLibraryFields(file: UniversalFileDoc) {
  const readAccessKeys = readUniversalFileAccessKeys(file);
  const writeAccessKeys = readUniversalFileWriteAccessKeys(file);
  const artifactSummary = readUniversalArtifactSummary(file);
  const artifactTags = readUniversalArtifactTags(file);

  return {
    id: file.id,
    teamId: file.teamId,
    ownerUserId: file.ownerUserId ?? file.createdByUserId ?? '',
    ...(file.organizationId ? { organizationId: file.organizationId } : {}),
    name: file.title,
    normalizedName: file.normalizedTitle,
    ...(file.summary
      ? { summary: file.summary }
      : artifactSummary
        ? { summary: artifactSummary }
        : {}),
    ...(file.tags?.length ? { tags: file.tags } : artifactTags ? { tags: artifactTags } : {}),
    ...(file.classification ? { classification: file.classification } : {}),
    ...(file.folderId !== undefined ? { folderId: file.folderId } : {}),
    ...(readAccessKeys ? { readAccessKeys } : {}),
    ...(writeAccessKeys ? { writeAccessKeys } : {}),
    ...(file.sport ? { sport: file.sport } : {}),
    ...(file.sourceRef?.sourceThreadId ? { sourceThreadId: file.sourceRef.sourceThreadId } : {}),
    ...(file.sourceRef?.sourceMessageId ? { sourceMessageId: file.sourceRef.sourceMessageId } : {}),
    ...(file.sourceRef?.sourceOperationId
      ? { sourceOperationId: file.sourceRef.sourceOperationId }
      : {}),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    lastSeenAt: file.lastSeenAt ?? file.updatedAt,
  } as const;
}

function hasNativeFilmReviewPayload(file: UniversalFileDoc): boolean {
  if (file.type !== 'file' || file.payloadKind === 'pointer') {
    return false;
  }

  const payload = file.payload as { filmReview?: unknown };
  return (
    !!payload.filmReview &&
    typeof payload.filmReview === 'object' &&
    !Array.isArray(payload.filmReview)
  );
}

function isLibraryVisibleUniversalFile(file: UniversalFileDoc): boolean {
  if (file.payloadKind === 'pointer') {
    return false;
  }

  if (file.type === 'file') {
    return true;
  }

  if (file.type !== 'film_review') {
    return false;
  }

  const binaryPayload = getUniversalBinaryFilePayload(file.payload);
  return binaryPayload?.kind === 'video';
}

function toAgentXLibraryFile(file: UniversalFileDoc): AgentXLibraryFile | null {
  if (!isLibraryVisibleUniversalFile(file)) {
    return null;
  }

  const nativePayload = file.payload as UniversalNativeFilePayload<string, object>;
  const rawTextContent =
    nativePayload.content?.text ?? getUniversalStructuredDocumentPayload(file.payload)?.textContent;
  const resolvedTextContent =
    (typeof rawTextContent === 'string' && rawTextContent.trim().length > 0
      ? rawTextContent
      : readUniversalArtifactNotes(file)) ?? undefined;
  const rawData = resolveUniversalRawData(nativePayload);
  const baseFields = buildBaseLibraryFields(file);

  const binaryPayload = getUniversalBinaryFilePayload(file.payload);
  if (binaryPayload) {
    return {
      ...baseFields,
      mimeType: binaryPayload.mimeType,
      kind: binaryPayload.kind,
      status: file.status as TeamFileStatus,
      origin: binaryPayload.origin,
      sizeBytes: binaryPayload.sizeBytes,
      url: binaryPayload.url,
      ...(binaryPayload.storagePath ? { storagePath: binaryPayload.storagePath } : {}),
      ...(binaryPayload.cloudflareVideoId
        ? { cloudflareVideoId: binaryPayload.cloudflareVideoId }
        : {}),
      ...(binaryPayload.cloudflareStatus
        ? { cloudflareStatus: binaryPayload.cloudflareStatus }
        : {}),
      ...(typeof binaryPayload.readyToStream === 'boolean'
        ? { readyToStream: binaryPayload.readyToStream }
        : {}),
      ...(binaryPayload.thumbnailUrl ? { thumbnailUrl: binaryPayload.thumbnailUrl } : {}),
      ...(binaryPayload.platform ? { platform: binaryPayload.platform } : {}),
      ...(binaryPayload.profileUrl ? { profileUrl: binaryPayload.profileUrl } : {}),
      ...(binaryPayload.faviconUrl ? { faviconUrl: binaryPayload.faviconUrl } : {}),
      ...(resolvedTextContent ? { textContent: resolvedTextContent } : {}),
      ...(rawData ? { rawData } : {}),
      rawPayload: file.payload,
    };
  }

  if (resolvedTextContent) {
    const mimeType = inferTextDocumentMimeType(file);

    return {
      ...baseFields,
      mimeType,
      kind: 'doc',
      status: file.status as TeamFileStatus,
      origin: inferTextDocumentOrigin(file),
      sizeBytes: resolvedTextContent.length,
      url: buildInlineTextDocumentUrl(resolvedTextContent, mimeType),
      textContent: resolvedTextContent,
      ...(rawData ? { rawData } : {}),
      rawPayload: file.payload,
    };
  }

  if (rawData) {
    return {
      ...baseFields,
      mimeType: 'application/json',
      kind: 'doc',
      status: file.status as TeamFileStatus,
      origin: inferTextDocumentOrigin(file),
      sizeBytes: JSON.stringify(rawData).length,
      url: buildJsonDocumentUrl(rawData),
      ...(resolvedTextContent ? { textContent: resolvedTextContent } : {}),
      rawData,
      rawPayload: file.payload,
    };
  }

  return null;
}

@Injectable({ providedIn: 'root' })
export class AgentXFilesService {
  private static readonly FILES_CACHE_TTL_MS = 60_000;

  private readonly http = inject(HttpClient);
  private readonly videoUploadService = inject(AgentXVideoUploadService);
  private readonly logger = inject(NxtLoggingService).child('AgentXFilesService');
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly toast = inject(NxtToastService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly authTokenFactory = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly baseUrl = `${inject(AGENT_X_API_BASE_URL)}/agent-x`;

  private readonly _files = signal<readonly AgentXLibraryFile[]>([]);
  private readonly _folders = signal<readonly TeamFileFolderDoc[]>([]);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _selectedId = signal<string | null>(null);
  private filesLoadedAtMs = 0;
  private activeLoadPromise: Promise<void> | null = null;

  readonly files = computed(() => this._files());
  readonly folders = computed(() => this._folders());
  readonly loading = computed(() => this._loading());
  readonly saving = computed(() => this._saving());
  readonly error = computed(() => this._error());
  readonly selectedId = computed(() => this._selectedId());
  readonly selectedFile = computed(() => {
    const selectedId = this._selectedId();
    if (!selectedId) return null;
    return this._files().find((file) => file.id === selectedId) ?? null;
  });

  async loadFiles(_teamId?: string | null, options?: LoadFilesOptions): Promise<void> {
    const explicitBackground = options?.background ?? false;
    const hasLoadedSnapshot = this.filesLoadedAtMs > 0;
    const cacheMaxAgeMs = options?.cacheMaxAgeMs ?? AgentXFilesService.FILES_CACHE_TTL_MS;
    const cacheAgeMs = hasLoadedSnapshot
      ? Date.now() - this.filesLoadedAtMs
      : Number.POSITIVE_INFINITY;
    const cacheFresh = hasLoadedSnapshot && cacheAgeMs >= 0 && cacheAgeMs <= cacheMaxAgeMs;

    if (!options?.force && !explicitBackground && cacheFresh) {
      this._error.set(null);
      this.breadcrumb.trackStateChange('agent-x-files:cache-hit', {
        ageMs: cacheAgeMs,
        teamId: null,
      });
      return;
    }

    if (this.activeLoadPromise) {
      return this.activeLoadPromise;
    }

    const showBlockingLoader = !explicitBackground && !hasLoadedSnapshot;
    if (showBlockingLoader) {
      this._loading.set(true);
    }
    this._error.set(null);
    this.breadcrumb.trackStateChange('agent-x-files:loading', { teamId: null });

    const loadPromise = this.fetchFilesSnapshot()
      .then(({ files, folders }) => {
        this._files.set(files);
        this._folders.set(folders);
        const selectedId = this._selectedId();
        this._selectedId.set(
          selectedId && files.some((file) => file.id === selectedId)
            ? selectedId
            : (files[0]?.id ?? null)
        );
        this.filesLoadedAtMs = Date.now();
        this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATIONS_LOG_VIEWED, {
          source: 'files-panel',
          count: files.length,
        });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Failed to load files';
        if (hasLoadedSnapshot || explicitBackground) {
          this.logger.warn('Keeping cached files after background refresh failed', {
            error: message,
            teamId: null,
          });
        } else {
          this.logger.error('Failed to load files', error, { teamId: null });
          this._error.set(message);
        }
      })
      .finally(() => {
        if (this.activeLoadPromise === loadPromise) {
          this.activeLoadPromise = null;
        }
        if (showBlockingLoader) {
          this._loading.set(false);
        }
      });

    this.activeLoadPromise = loadPromise;
    await loadPromise;
  }

  private async fetchFilesSnapshot(): Promise<{
    readonly files: readonly AgentXLibraryFile[];
    readonly folders: readonly TeamFileFolderDoc[];
  }> {
    const response = await firstValueFrom(
      this.http.get<UniversalFileLibraryResponse>(`${this.baseUrl}/files/universal`)
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to load files');
    }

    return {
      files: response.data.files
        .map((file) => toAgentXLibraryFile(file))
        .filter((file): file is AgentXLibraryFile => file !== null),
      folders: this.sortFolders(response.data.folders),
    };
  }

  async loadUniversalFiles(_teamId?: string | null): Promise<{
    readonly files: readonly UniversalFileDoc[];
    readonly folders: readonly TeamFileFolderDoc[];
  }> {
    this.breadcrumb.trackStateChange('agent-x-universal-files:loading', {
      teamId: null,
    });

    const response = await firstValueFrom(
      this.http.get<UniversalFileLibraryResponse>(`${this.baseUrl}/files/universal`)
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to load universal files');
    }

    return {
      files: response.data.files,
      folders: this.sortFolders(response.data.folders),
    };
  }

  async refreshFile(
    fileId: string,
    _teamId?: string | null,
    options?: RefreshFileOptions
  ): Promise<AgentXLibraryFile> {
    const response = await firstValueFrom(
      this.http.get<UniversalFileResponse>(`${this.baseUrl}/files/${fileId}`, {
        params: {
          ...(options?.disposition ? { disposition: options.disposition } : {}),
        },
      })
    );

    if (!response.success || !response.data?.file) {
      throw new Error(response.error ?? 'Failed to refresh file');
    }

    const refreshed = toAgentXLibraryFile(response.data.file);
    if (!refreshed) {
      throw new Error('File preview is unavailable');
    }

    this._files.update((files) => {
      const next = files.map((file) => (file.id === refreshed.id ? refreshed : file));
      return next.some((file) => file.id === refreshed.id) ? next : [refreshed, ...next];
    });
    if (this._selectedId() === refreshed.id) {
      this._selectedId.set(refreshed.id);
    }

    return refreshed;
  }

  async getUniversalFileDocument(
    fileId: string,
    _teamId?: string | null
  ): Promise<UniversalFileDoc> {
    const response = await firstValueFrom(
      this.http.get<UniversalFileResponse>(`${this.baseUrl}/files/${fileId}`)
    );

    if (!response.success || !response.data?.file) {
      throw new Error(response.error ?? 'Failed to fetch universal file');
    }

    return response.data.file;
  }

  async listUniversalFileDocuments(
    _teamId?: string | null,
    filters?: UniversalFileListFilters
  ): Promise<readonly UniversalFileDoc[]> {
    const response = await firstValueFrom(
      this.http.get<UniversalFileLibraryResponse>(`${this.baseUrl}/files/universal`, {
        params: {
          ...(filters?.classification ? { classification: filters.classification } : {}),
          ...(filters?.route ? { route: filters.route } : {}),
          ...(filters?.label ? { label: filters.label } : {}),
        },
      })
    );

    if (!response.success || !response.data?.files) {
      throw new Error(response.error ?? 'Failed to fetch universal files');
    }

    return response.data.files;
  }

  async getLinkedFilmReviewId(fileId: string, teamId?: string | null): Promise<string | null> {
    const file = await this.getUniversalFileDocument(fileId, teamId);
    if (!hasNativeFilmReviewPayload(file)) {
      return null;
    }

    return file.id;
  }

  async requestFilmReviewDownloadExport(
    fileId: string,
    teamId: string
  ): Promise<RequestFilmReviewDownloadExportResponse> {
    const response = await firstValueFrom(
      this.http.post<UniversalFileFilmReviewDownloadExportResponse>(
        `${this.baseUrl}/files/${fileId}/film-review/download-export`,
        { teamId }
      )
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to prepare film review download export');
    }

    return response.data;
  }

  selectFile(fileId: string | null): void {
    this._selectedId.set(fileId);
  }

  async uploadFiles(
    files: readonly File[],
    teamId?: string | null,
    optionsOrSport?: string | null | UploadFilesOptions
  ): Promise<readonly string[]> {
    if (files.length === 0) return [];

    return this.startUploadFiles(files, teamId, optionsOrSport).result;
  }

  startUploadFiles(
    files: readonly File[],
    _teamId?: string | null,
    optionsOrSport?: string | null | UploadFilesOptions
  ): AgentXFilesUploadHandle {
    if (files.length === 0) {
      const progressSubject = new Subject<AgentXFilesUploadProgress>();
      progressSubject.next({
        phase: 'complete',
        currentFile: 0,
        totalFiles: 0,
        currentFileName: null,
        percent: 100,
        canCancel: false,
      });
      progressSubject.complete();

      return {
        progress$: progressSubject.asObservable(),
        result: Promise.resolve([]),
        cancel: () => undefined,
      };
    }

    const options: UploadFilesOptions =
      typeof optionsOrSport === 'string' || typeof optionsOrSport === 'undefined'
        ? { sport: optionsOrSport ?? null }
        : (optionsOrSport ?? {});
    const normalizedSport =
      typeof options.sport === 'string' && options.sport.trim().length > 0
        ? options.sport.trim()
        : undefined;
    const normalizedFolderId =
      typeof options.folderId === 'string' && options.folderId.trim().length > 0
        ? options.folderId.trim()
        : null;
    const uploadTarget = options.uploadTarget === 'film_review' ? 'film_review' : 'file';
    const reloadAfterUpload = options.reloadAfterUpload !== false;
    const suppressSuccessToast = options.suppressSuccessToast === true;
    const uploadedFileIds: string[] = [];
    const progressSubject = new Subject<AgentXFilesUploadProgress>();
    const cancellation = new FilesUploadCancellationController();
    this._saving.set(true);
    this._error.set(null);
    this.breadcrumb.trackStateChange('agent-x-files:uploading', {
      teamId: null,
      count: files.length,
      folderId: normalizedFolderId,
    });

    this.emitUploadProgress(progressSubject, {
      phase: 'preparing',
      currentFile: 1,
      totalFiles: files.length,
      currentFileName: files[0]?.name ?? null,
      percent: 0,
      canCancel: false,
    });

    const result = (async () => {
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index] as File;
          cancellation.throwIfCancelled();
          this.validateFile(file);

          this.emitUploadProgress(progressSubject, {
            phase: 'uploading',
            currentFile: index + 1,
            totalFiles: files.length,
            currentFileName: file.name,
            percent: Math.round((index / files.length) * 100),
            canCancel: true,
          });

          const attachment = file.type.startsWith('video/')
            ? await this.uploadVideoFile(
                file,
                (filePercent) => {
                  const overallPercent = ((index + filePercent / 100) / files.length) * 100;
                  this.emitUploadProgress(progressSubject, {
                    phase: 'uploading',
                    currentFile: index + 1,
                    totalFiles: files.length,
                    currentFileName: file.name,
                    percent: Math.round(overallPercent),
                    canCancel: true,
                  });
                },
                cancellation
              )
            : await this.uploadNonVideoFile(
                file,
                (filePercent) => {
                  const overallPercent = ((index + filePercent / 100) / files.length) * 100;
                  this.emitUploadProgress(progressSubject, {
                    phase: 'uploading',
                    currentFile: index + 1,
                    totalFiles: files.length,
                    currentFileName: file.name,
                    percent: Math.round(overallPercent),
                    canCancel: true,
                  });
                },
                cancellation
              );

          cancellation.throwIfCancelled();

          this.emitUploadProgress(progressSubject, {
            phase: 'indexing',
            currentFile: index + 1,
            totalFiles: files.length,
            currentFileName: file.name,
            percent: Math.round(((index + 0.98) / files.length) * 100),
            canCancel: false,
          });

          uploadedFileIds.push(
            await this.indexUploadedAttachment(
              attachment,
              normalizedSport,
              normalizedFolderId,
              uploadTarget
            )
          );
        }

        if (reloadAfterUpload) {
          this.emitUploadProgress(progressSubject, {
            phase: 'reloading',
            currentFile: files.length,
            totalFiles: files.length,
            currentFileName: files[files.length - 1]?.name ?? null,
            percent: 100,
            canCancel: false,
          });
          await this.loadFiles();
        }

        if (!suppressSuccessToast) {
          this.toast.success(files.length === 1 ? 'File uploaded' : 'Files uploaded');
        }

        this.emitUploadProgress(progressSubject, {
          phase: 'complete',
          currentFile: files.length,
          totalFiles: files.length,
          currentFileName: files[files.length - 1]?.name ?? null,
          percent: 100,
          canCancel: false,
        });

        return uploadedFileIds;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to upload files';
        if (
          message === FILES_UPLOAD_CANCELLED_MESSAGE ||
          message === VIDEO_UPLOAD_CANCELLED_MESSAGE
        ) {
          this.emitUploadProgress(progressSubject, {
            phase: 'cancelled',
            currentFile: Math.min(files.length, uploadedFileIds.length + 1),
            totalFiles: files.length,
            currentFileName: files[uploadedFileIds.length]?.name ?? null,
            percent: 0,
            canCancel: false,
          });
          throw new Error(FILES_UPLOAD_CANCELLED_MESSAGE, {
            cause: error,
          });
        }

        this.logger.error('Failed to upload files', error, {
          teamId: null,
          fileCount: files.length,
          folderId: normalizedFolderId,
        });
        this._error.set(message);
        this.toast.error(message);
        this.emitUploadProgress(progressSubject, {
          phase: 'error',
          currentFile: Math.min(files.length, uploadedFileIds.length + 1),
          totalFiles: files.length,
          currentFileName: files[uploadedFileIds.length]?.name ?? null,
          percent: 0,
          canCancel: false,
          errorMessage: message,
        });
        throw error;
      } finally {
        this._saving.set(false);
        progressSubject.complete();
      }
    })();

    return {
      progress$: progressSubject.asObservable(),
      result,
      cancel: () => cancellation.cancel(),
    };
  }

  async promoteChatAttachment(request: {
    readonly teamId?: string | null;
    readonly messageId: string;
    readonly attachmentId: string;
    readonly sport?: string | null;
  }): Promise<string> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<UniversalFilePromoteAttachmentResponse>(
          `${this.baseUrl}/files/promote-chat-attachment`,
          {
            messageId: request.messageId,
            attachmentId: request.attachmentId,
            ...(request.sport?.trim() ? { sport: request.sport.trim() } : {}),
          }
        )
      );

      if (!response.success || !response.data?.fileId) {
        throw new Error(response.error ?? 'Failed to add attachment to files');
      }

      try {
        await this.refreshFile(response.data.fileId, request.teamId);
      } catch (refreshError) {
        this.logger.error('Added file but failed to refresh files state', refreshError, {
          teamId: null,
          fileId: response.data.fileId,
          messageId: request.messageId,
          attachmentId: request.attachmentId,
        });
      }

      this.toast.success('Added to files');
      return response.data.fileId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add attachment to files';
      this._error.set(message);
      this.logger.error('Failed to promote chat attachment into files', error, {
        teamId: null,
        messageId: request.messageId,
        attachmentId: request.attachmentId,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async createFolder(request: {
    readonly teamId?: string | null;
    readonly name: string;
    readonly parentId?: string | null;
    readonly id?: string;
  }): Promise<TeamFileFolderDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<UniversalFolderMutationResponse>(`${this.baseUrl}/files/folders`, {
          ...(typeof request.teamId === 'string' && request.teamId.trim().length > 0
            ? { teamId: request.teamId }
            : {}),
          name: request.name,
          ...(typeof request.parentId !== 'undefined' ? { parentId: request.parentId } : {}),
          ...(request.id ? { id: request.id } : {}),
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to create folder');
      }

      this.upsertFolder(response.data.folder);
      return response.data.folder;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create folder';
      this._error.set(message);
      this.logger.error('Failed to create file folder', error, {
        teamId: request.teamId ?? null,
        parentId: request.parentId ?? null,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async updateFolder(
    folderId: string,
    request: {
      readonly teamId?: string | null;
      readonly name?: string;
      readonly parentId?: string | null;
      readonly sortOrder?: number;
    }
  ): Promise<TeamFileFolderDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<UniversalFolderMutationResponse>(
          `${this.baseUrl}/files/folders/${folderId}`,
          {
            ...(typeof request.teamId !== 'undefined' ? { teamId: request.teamId } : {}),
            ...(typeof request.name === 'string' ? { name: request.name } : {}),
            ...(typeof request.parentId !== 'undefined' ? { parentId: request.parentId } : {}),
            ...(typeof request.sortOrder === 'number' ? { sortOrder: request.sortOrder } : {}),
          }
        )
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update folder');
      }

      this.upsertFolder(response.data.folder);
      return response.data.folder;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update folder';
      this._error.set(message);
      this.logger.error('Failed to update file folder', error, {
        folderId,
        teamId: request.teamId ?? null,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async deleteFolder(folderId: string, _teamId?: string | null): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.delete<{ readonly success: boolean; readonly error?: string }>(
          `${this.baseUrl}/files/folders/${folderId}`
        )
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete folder');
      }

      this._folders.update((folders) =>
        this.sortFolders(
          folders
            .filter((folder) => folder.id !== folderId)
            .map((folder) =>
              folder.parentId === folderId ? { ...folder, parentId: null } : folder
            )
        )
      );
      this._files.update((files) =>
        files.map((file) => (file.folderId === folderId ? { ...file, folderId: null } : file))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete folder';
      this._error.set(message);
      this.logger.error('Failed to delete file folder', error, {
        folderId,
        teamId: null,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async shareFolder(
    folderId: string,
    request: {
      readonly action: 'add' | 'remove';
      readonly permission?: FileSharePermission;
      readonly principalType: FileSharePrincipalType;
      readonly principalId: string;
    }
  ): Promise<TeamFileFolderDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<UniversalFolderMutationResponse>(
          `${this.baseUrl}/files/folders/${folderId}/share`,
          {
            action: request.action,
            permission: request.permission,
            principalType: request.principalType,
            principalId: request.principalId,
          }
        )
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update folder sharing');
      }

      this.upsertFolder(response.data.folder);
      return response.data.folder;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update folder sharing';
      this._error.set(message);
      this.logger.error('Failed to update folder sharing', error, {
        folderId,
        action: request.action,
        principalType: request.principalType,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async loadShareCandidates(request: {
    readonly teamId?: string | null;
    readonly organizationId?: string | null;
  }): Promise<readonly AgentXShareCandidate[]> {
    const teamId = request.teamId?.trim() || '';
    const organizationId = request.organizationId?.trim() || '';
    if (!teamId && !organizationId) {
      return [];
    }

    const response = await firstValueFrom(
      this.http.get<UniversalShareCandidatesResponse>(
        `${this.baseUrl}/files/universal/share-candidates`,
        {
          params: {
            ...(teamId ? { teamId } : {}),
            ...(organizationId ? { organizationId } : {}),
          },
        }
      )
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to load share candidates');
    }

    return response.data.candidates;
  }

  async moveFile(fileId: string, teamId: string | null, folderId: string | null): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<UniversalFileMutationResponse>(`${this.baseUrl}/files/${fileId}`, {
          teamId,
          folderId,
        })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to move file');
      }

      this._files.update((files) =>
        files.map((file) =>
          file.id === fileId ? { ...file, folderId, teamId: teamId ?? undefined } : file
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move file';
      this._error.set(message);
      this.logger.error('Failed to move file', error, {
        fileId,
        teamId,
        folderId,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async renameFile(fileId: string, _teamId: string | null, name: string): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<UniversalFileMutationResponse>(`${this.baseUrl}/files/${fileId}`, {
          name,
        })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to rename file');
      }

      const normalizedName = name.trim().toLowerCase();
      this._files.update((files) =>
        files.map((file) =>
          file.id === fileId
            ? {
                ...file,
                name: name.trim(),
                normalizedName,
              }
            : file
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rename file';
      this._error.set(message);
      this.logger.error('Failed to rename file', error, { fileId, teamId: null, name });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async updateFilePayload(
    fileId: string,
    _teamId: string | null,
    rawData: Record<string, unknown>
  ): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<UniversalFileMutationResponse>(`${this.baseUrl}/files/${fileId}`, {
          rawData,
        })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update file payload');
      }

      this._files.update((files) =>
        files.map((file) =>
          file.id === fileId
            ? {
                ...file,
                rawData,
              }
            : file
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update file payload';
      this._error.set(message);
      this.logger.error('Failed to update file payload', error, {
        fileId,
        teamId: null,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async updateFileTextContent(
    fileId: string,
    _teamId: string | null,
    textContent: string
  ): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<UniversalFileMutationResponse>(`${this.baseUrl}/files/${fileId}`, {
          textContent,
        })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update file content');
      }

      this._files.update((files) =>
        files.map((file) =>
          file.id === fileId
            ? {
                ...file,
                textContent,
              }
            : file
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update file content';
      this._error.set(message);
      this.logger.error('Failed to update file content', error, {
        fileId,
        teamId: null,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async updateFileMetadata(
    fileId: string,
    _teamId: string | null,
    metadata: {
      readonly summary: string;
      readonly classificationPrimary: string;
    }
  ): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<UniversalFileMutationResponse>(`${this.baseUrl}/files/${fileId}`, {
          summary: metadata.summary,
          classificationPrimary: metadata.classificationPrimary,
        })
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to update file details');
      }

      this._files.update((files) =>
        files.map((file) =>
          file.id === fileId
            ? {
                ...file,
                summary: metadata.summary,
                classification: {
                  ...(file.classification ?? {}),
                  primary: metadata.classificationPrimary,
                },
              }
            : file
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update file details';
      this._error.set(message);
      this.logger.error('Failed to update file details', error, {
        fileId,
        teamId: null,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async deleteFile(fileId: string, _teamId: string | null): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.delete<UniversalFileDeleteResponse>(`${this.baseUrl}/files/${fileId}`)
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Failed to delete file');
      }

      this._files.update((files) => files.filter((file) => file.id !== fileId));

      if (this._selectedId() === fileId) {
        const nextSelectedFile = this._files()[0] ?? null;
        this._selectedId.set(nextSelectedFile?.id ?? null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete file';
      this._error.set(message);
      this.logger.error('Failed to delete file', error, { fileId, teamId: null });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async shareFile(
    fileId: string,
    request: {
      readonly action: 'add' | 'remove';
      readonly permission?: FileSharePermission;
      readonly principalType: FileSharePrincipalType;
      readonly principalId: string;
    }
  ): Promise<{
    readonly readAccessKeys: readonly string[];
    readonly writeAccessKeys: readonly string[];
  }> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<UniversalFileShareMutationResponse>(
          `${this.baseUrl}/files/${fileId}/share`,
          {
            action: request.action,
            permission: request.permission,
            principalType: request.principalType,
            principalId: request.principalId,
          }
        )
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to update file sharing');
      }

      const readAccessKeys = [...response.data.readAccessKeys];
      const writeAccessKeys = [...response.data.writeAccessKeys];
      this._files.update((files) =>
        files.map((file) =>
          file.id === fileId
            ? {
                ...file,
                readAccessKeys,
                writeAccessKeys,
              }
            : file
        )
      );

      return {
        readAccessKeys,
        writeAccessKeys,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update file sharing';
      this._error.set(message);
      this.logger.error('Failed to update file sharing', error, {
        fileId,
        action: request.action,
        principalType: request.principalType,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  private validateFile(file: File): void {
    if (!AGENT_X_ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.name}`);
    }

    if (!file.type.startsWith('video/') && file.size > AGENT_X_MAX_NON_VIDEO_FILE_SIZE) {
      const maxSizeMb = Math.round(AGENT_X_MAX_NON_VIDEO_FILE_SIZE / (1024 * 1024));
      throw new Error(`File exceeds maximum size limit (${maxSizeMb} MB): ${file.name}`);
    }

    if (file.type.startsWith('video/') && file.size > AGENT_X_MAX_VIDEO_FILE_SIZE) {
      throw new Error(`File exceeds size limit: ${file.name}`);
    }
  }

  private async uploadNonVideoFile(
    file: File,
    onProgress?: (percent: number) => void,
    cancellation?: FilesUploadCancellationController
  ): Promise<NativeFileUploadAttachment> {
    const authToken = await this.resolveAuthToken();
    const formData = new FormData();
    formData.append('file', file);

    return await new Promise<NativeFileUploadAttachment>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const cancelUpload = () => {
        xhr.abort();
      };
      const clearCancellation = () => cancellation?.clear(cancelUpload);

      cancellation?.bind(cancelUpload);
      xhr.open('POST', `${this.baseUrl}/upload`);
      xhr.responseType = 'text';
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const percent = Math.max(0, Math.min(100, (event.loaded / event.total) * 100));
        onProgress?.(percent);
      });

      xhr.addEventListener('load', () => {
        clearCancellation();

        const rawResponse = typeof xhr.response === 'string' ? xhr.response : xhr.responseText;
        let response: NonVideoUploadResponse | null;
        try {
          response = rawResponse ? (JSON.parse(rawResponse) as NonVideoUploadResponse) : null;
        } catch {
          reject(new Error(`Failed to upload ${file.name}`));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300 || !response?.success || !response.data) {
          const errorMessage =
            typeof response?.error === 'string'
              ? response.error
              : response?.error && typeof response.error === 'object'
                ? JSON.stringify(response.error)
                : `Failed to upload ${file.name}`;
          reject(new Error(errorMessage));
          return;
        }

        onProgress?.(100);
        resolve({
          id: globalThis.crypto.randomUUID(),
          url: response.data.url,
          ...(response.data.storagePath ? { storagePath: response.data.storagePath } : {}),
          name: response.data.name,
          mimeType: response.data.mimeType,
          type: this.resolveAttachmentKindFromMimeType(response.data.mimeType),
          sizeBytes: response.data.sizeBytes,
        });
      });

      xhr.addEventListener('error', () => {
        clearCancellation();
        reject(new Error(`Failed to upload ${file.name}`));
      });

      xhr.addEventListener('abort', () => {
        clearCancellation();
        reject(new Error(FILES_UPLOAD_CANCELLED_MESSAGE));
      });

      xhr.send(formData);
    });
  }

  private async uploadVideoFile(
    file: File,
    onProgress?: (percent: number) => void,
    cancellation?: FilesUploadCancellationController
  ): Promise<NativeFileUploadAttachment> {
    const authToken = await this.resolveAuthToken();

    return await new Promise<NativeFileUploadAttachment>((resolve, reject) => {
      const uploadHandle = this.videoUploadService.uploadVideo(file, authToken, {});
      const cancelUpload = () => uploadHandle.cancel();
      cancellation?.bind(cancelUpload);
      const subscription = uploadHandle.progress$.subscribe({
        next: (progress: VideoUploadProgress) => {
          if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
            onProgress?.(Math.max(0, Math.min(100, progress.percent)));
            return;
          }

          if (progress.phase === 'complete' && progress.streamUrl) {
            const streamUrl = progress.streamUrl;
            onProgress?.(100);

            void (async () => {
              const fallbackThumbnailUrl =
                progress.thumbnailUrl ??
                this.buildCloudflareThumbnailUrl(progress.cloudflareVideoId);

              cancellation?.clear(cancelUpload);
              resolve({
                id: globalThis.crypto.randomUUID(),
                url: streamUrl,
                ...(progress.storagePath ? { storagePath: progress.storagePath } : {}),
                name: file.name,
                mimeType: file.type,
                type: 'video',
                sizeBytes: file.size,
                ...(progress.cloudflareVideoId
                  ? { cloudflareVideoId: progress.cloudflareVideoId }
                  : {}),
                ...(progress.cloudflareStatus
                  ? { cloudflareStatus: progress.cloudflareStatus }
                  : {}),
                ...(typeof progress.readyToStream === 'boolean'
                  ? { readyToStream: progress.readyToStream }
                  : {}),
                ...(fallbackThumbnailUrl ? { thumbnailUrl: fallbackThumbnailUrl } : {}),
              });
              subscription.unsubscribe();
            })().catch((error: unknown) => {
              cancellation?.clear(cancelUpload);
              reject(error);
              subscription.unsubscribe();
            });
          } else if (progress.phase === 'cancelled') {
            cancellation?.clear(cancelUpload);
            reject(new Error(VIDEO_UPLOAD_CANCELLED_MESSAGE));
            subscription.unsubscribe();
          } else if (progress.phase === 'error') {
            cancellation?.clear(cancelUpload);
            reject(new Error(progress.errorMessage ?? `Failed to upload ${file.name}`));
            subscription.unsubscribe();
          }
        },
        error: (error) => {
          cancellation?.clear(cancelUpload);
          reject(error);
          subscription.unsubscribe();
        },
      });
    });
  }

  private async indexUploadedAttachment(
    attachment: NativeFileUploadAttachment,
    sport?: string,
    folderId?: string | null,
    uploadTarget: 'file' | 'film_review' = 'file'
  ): Promise<string> {
    const response = await firstValueFrom(
      this.http.post<UniversalFileIndexResponse>(`${this.baseUrl}/files/index`, {
        ...(sport ? { sport } : {}),
        ...(typeof folderId !== 'undefined' ? { folderId } : {}),
        uploadTarget,
        attachment,
      })
    );

    if (!response.success || !response.data?.fileId) {
      throw new Error(response.error ?? 'Failed to index uploaded file');
    }

    return response.data.fileId;
  }

  private async resolveAuthToken(): Promise<string> {
    const tokenFactory = this.authTokenFactory ?? null;
    if (!tokenFactory) {
      throw new Error('Agent X auth token factory is unavailable');
    }

    const token = await tokenFactory();
    if (!token) {
      throw new Error('User is not authenticated');
    }

    return token;
  }

  private emitUploadProgress(
    progressSubject: Subject<AgentXFilesUploadProgress>,
    progress: AgentXFilesUploadProgress
  ): void {
    progressSubject.next({
      ...progress,
      percent: Math.max(0, Math.min(100, progress.percent)),
    });
  }

  private buildCloudflareThumbnailUrl(cloudflareVideoId?: string): string | null {
    const normalizedCloudflareVideoId = cloudflareVideoId?.trim();
    if (!normalizedCloudflareVideoId) {
      return null;
    }

    return `https://videodelivery.net/${normalizedCloudflareVideoId}/thumbnails/thumbnail.jpg`;
  }

  private resolveAttachmentKindFromMimeType(mimeType: string): AgentXLibraryFile['kind'] {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }

    if (mimeType.startsWith('video/')) {
      return 'video';
    }

    if (mimeType === 'application/pdf') {
      return 'pdf';
    }

    if (mimeType === 'text/csv' || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return 'csv';
    }

    return 'doc';
  }

  private upsertFolder(folder: TeamFileFolderDoc): void {
    this._folders.update((folders) => {
      const next = folders.filter((entry) => entry.id !== folder.id);
      next.push(folder);
      return this.sortFolders(next);
    });
  }

  private sortFolders(folders: readonly TeamFileFolderDoc[]): readonly TeamFileFolderDoc[] {
    return [...folders].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)
    );
  }
}
