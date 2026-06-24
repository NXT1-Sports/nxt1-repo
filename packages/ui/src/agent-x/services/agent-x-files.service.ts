import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  TeamFileFolderDoc,
  TeamFileKind,
  TeamFileOrigin,
  TeamFileStatus,
  UniversalFileDoc,
} from '@nxt1/core';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_MAX_FILE_SIZE,
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
  readonly teamId: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly mimeType: string;
  readonly kind: TeamFileKind;
  readonly status: TeamFileStatus;
  readonly origin: TeamFileOrigin;
  readonly sizeBytes: number;
  readonly url: string;
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
  readonly createdAt: UniversalFileDoc['createdAt'];
  readonly updatedAt: UniversalFileDoc['updatedAt'];
  readonly lastSeenAt: NonNullable<UniversalFileDoc['lastSeenAt']>;
}

interface UniversalFileLibraryResponse {
  readonly success: boolean;
  readonly data?: {
    readonly files: readonly UniversalFileDoc[];
    readonly folders: readonly TeamFileFolderDoc[];
  };
  readonly error?: string;
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

function toAgentXLibraryFile(file: UniversalFileDoc): AgentXLibraryFile | null {
  if (file.type !== 'file' || file.payloadKind !== 'native') {
    return null;
  }

  return {
    id: file.id,
    teamId: file.teamId,
    ownerUserId: file.ownerUserId ?? file.createdByUserId ?? '',
    name: file.title,
    normalizedName: file.normalizedTitle,
    mimeType: file.payload.mimeType,
    kind: file.payload.kind,
    status: file.status as TeamFileStatus,
    origin: file.payload.origin,
    sizeBytes: file.payload.sizeBytes,
    url: file.payload.url,
    ...(file.folderId !== undefined ? { folderId: file.folderId } : {}),
    ...(file.payload.storagePath ? { storagePath: file.payload.storagePath } : {}),
    ...(file.payload.cloudflareVideoId
      ? { cloudflareVideoId: file.payload.cloudflareVideoId }
      : {}),
    ...(file.payload.cloudflareStatus ? { cloudflareStatus: file.payload.cloudflareStatus } : {}),
    ...(typeof file.payload.readyToStream === 'boolean'
      ? { readyToStream: file.payload.readyToStream }
      : {}),
    ...(file.payload.thumbnailUrl ? { thumbnailUrl: file.payload.thumbnailUrl } : {}),
    ...(file.payload.platform ? { platform: file.payload.platform } : {}),
    ...(file.payload.profileUrl ? { profileUrl: file.payload.profileUrl } : {}),
    ...(file.payload.faviconUrl ? { faviconUrl: file.payload.faviconUrl } : {}),
    ...(file.sport ? { sport: file.sport } : {}),
    ...(file.sourceRef?.sourceThreadId ? { sourceThreadId: file.sourceRef.sourceThreadId } : {}),
    ...(file.sourceRef?.sourceMessageId ? { sourceMessageId: file.sourceRef.sourceMessageId } : {}),
    ...(file.sourceRef?.sourceOperationId
      ? { sourceOperationId: file.sourceRef.sourceOperationId }
      : {}),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    lastSeenAt: file.lastSeenAt ?? file.updatedAt,
  };
}

@Injectable({ providedIn: 'root' })
export class AgentXFilesService {
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

  async loadFiles(teamId: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    this.breadcrumb.trackStateChange('agent-x-files:loading', { teamId });

    try {
      const response = await firstValueFrom(
        this.http.get<UniversalFileLibraryResponse>(`${this.baseUrl}/files/universal`, {
          params: { teamId },
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load files');
      }

      const files = response.data.files
        .map((file) => toAgentXLibraryFile(file))
        .filter((file): file is AgentXLibraryFile => file !== null);

      this._files.set(files);
      this._folders.set(this.sortFolders(response.data.folders));
      if (!this._selectedId() && files.length > 0) {
        this._selectedId.set(files[0]?.id ?? null);
      }
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATIONS_LOG_VIEWED, {
        source: 'files-panel',
        count: files.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load files';
      this.logger.error('Failed to load files', error, { teamId });
      this._error.set(message);
    } finally {
      this._loading.set(false);
    }
  }

  async loadUniversalFiles(teamId: string): Promise<{
    readonly files: readonly UniversalFileDoc[];
    readonly folders: readonly TeamFileFolderDoc[];
  }> {
    this.breadcrumb.trackStateChange('agent-x-universal-files:loading', { teamId });

    const response = await firstValueFrom(
      this.http.get<UniversalFileLibraryResponse>(`${this.baseUrl}/files/universal`, {
        params: { teamId },
      })
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Failed to load universal files');
    }

    return {
      files: response.data.files,
      folders: this.sortFolders(response.data.folders),
    };
  }

  selectFile(fileId: string | null): void {
    this._selectedId.set(fileId);
  }

  async uploadFiles(files: readonly File[], teamId: string, sport?: string | null): Promise<void> {
    if (files.length === 0) return;

    const normalizedSport =
      typeof sport === 'string' && sport.trim().length > 0 ? sport.trim() : undefined;
    this._saving.set(true);
    this._error.set(null);
    this.breadcrumb.trackStateChange('agent-x-files:uploading', {
      teamId,
      count: files.length,
    });

    try {
      for (const file of files) {
        this.validateFile(file);

        if (file.type.startsWith('video/')) {
          const videoAttachment = await this.uploadVideoFile(file);
          await this.indexUploadedAttachment(teamId, videoAttachment, normalizedSport);
        } else {
          await this.uploadNonVideoFile(file, teamId, normalizedSport);
        }
      }

      this.toast.success(files.length === 1 ? 'File uploaded' : 'Files uploaded');
      await this.loadFiles(teamId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload files';
      this.logger.error('Failed to upload files', error, {
        teamId,
        fileCount: files.length,
      });
      this._error.set(message);
      this.toast.error(message);
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async promoteChatAttachment(request: {
    readonly teamId: string;
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
            teamId: request.teamId,
            messageId: request.messageId,
            attachmentId: request.attachmentId,
            ...(request.sport?.trim() ? { sport: request.sport.trim() } : {}),
          }
        )
      );

      if (!response.success || !response.data?.fileId) {
        throw new Error(response.error ?? 'Failed to add attachment to files');
      }

      this.toast.success('Added to files');
      return response.data.fileId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add attachment to files';
      this._error.set(message);
      this.logger.error('Failed to promote chat attachment into files', error, {
        teamId: request.teamId,
        messageId: request.messageId,
        attachmentId: request.attachmentId,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async createFolder(request: {
    readonly teamId: string;
    readonly name: string;
    readonly parentId?: string | null;
    readonly id?: string;
  }): Promise<TeamFileFolderDoc> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.post<UniversalFolderMutationResponse>(`${this.baseUrl}/files/folders`, {
          teamId: request.teamId,
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
        teamId: request.teamId,
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
      readonly teamId: string;
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
          request
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
        teamId: request.teamId,
      });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async deleteFolder(folderId: string, teamId: string): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.delete<{ readonly success: boolean; readonly error?: string }>(
          `${this.baseUrl}/files/folders/${folderId}`,
          { params: { teamId } }
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
      this.logger.error('Failed to delete file folder', error, { folderId, teamId });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async moveFile(fileId: string, teamId: string, folderId: string | null): Promise<void> {
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
        files.map((file) => (file.id === fileId ? { ...file, folderId } : file))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to move file';
      this._error.set(message);
      this.logger.error('Failed to move file', error, { fileId, teamId, folderId });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async renameFile(fileId: string, teamId: string, name: string): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.patch<UniversalFileMutationResponse>(`${this.baseUrl}/files/${fileId}`, {
          teamId,
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
      this.logger.error('Failed to rename file', error, { fileId, teamId, name });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  async deleteFile(fileId: string, teamId: string): Promise<void> {
    this._saving.set(true);
    this._error.set(null);

    try {
      const response = await firstValueFrom(
        this.http.delete<UniversalFileDeleteResponse>(`${this.baseUrl}/files/${fileId}`, {
          params: { teamId },
        })
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
      this.logger.error('Failed to delete file', error, { fileId, teamId });
      throw error;
    } finally {
      this._saving.set(false);
    }
  }

  private validateFile(file: File): void {
    if (!AGENT_X_ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.name}`);
    }

    const maxSize = file.type.startsWith('video/')
      ? AGENT_X_MAX_VIDEO_FILE_SIZE
      : AGENT_X_MAX_FILE_SIZE;
    if (file.size > maxSize) {
      throw new Error(`File exceeds size limit: ${file.name}`);
    }
  }

  private async uploadNonVideoFile(file: File, teamId: string, sport?: string): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('teamId', teamId);
    if (sport) {
      formData.append('sport', sport);
    }

    const response = await firstValueFrom(
      this.http.post<NonVideoUploadResponse>(`${this.baseUrl}/upload`, formData)
    );

    if (!response.success || !response.data) {
      throw new Error(response.error ?? `Failed to upload ${file.name}`);
    }
  }

  private async uploadVideoFile(file: File): Promise<NativeFileUploadAttachment> {
    const authToken = await this.resolveAuthToken();

    return await new Promise<NativeFileUploadAttachment>((resolve, reject) => {
      const uploadHandle = this.videoUploadService.uploadVideo(file, authToken, {});
      const subscription = uploadHandle.progress$.subscribe({
        next: (progress: VideoUploadProgress) => {
          if (progress.phase === 'complete' && progress.streamUrl) {
            resolve({
              id: globalThis.crypto.randomUUID(),
              url: progress.streamUrl,
              ...(progress.storagePath ? { storagePath: progress.storagePath } : {}),
              name: file.name,
              mimeType: file.type,
              type: 'video',
              sizeBytes: file.size,
              ...(progress.cloudflareVideoId
                ? { cloudflareVideoId: progress.cloudflareVideoId }
                : {}),
              ...(progress.cloudflareStatus ? { cloudflareStatus: progress.cloudflareStatus } : {}),
              ...(typeof progress.readyToStream === 'boolean'
                ? { readyToStream: progress.readyToStream }
                : {}),
              ...(progress.thumbnailUrl ? { thumbnailUrl: progress.thumbnailUrl } : {}),
            });
            subscription.unsubscribe();
          } else if (progress.phase === 'cancelled') {
            reject(new Error(VIDEO_UPLOAD_CANCELLED_MESSAGE));
            subscription.unsubscribe();
          } else if (progress.phase === 'error') {
            reject(new Error(progress.errorMessage ?? `Failed to upload ${file.name}`));
            subscription.unsubscribe();
          }
        },
        error: (error) => {
          reject(error);
          subscription.unsubscribe();
        },
      });
    });
  }

  private async indexUploadedAttachment(
    teamId: string,
    attachment: NativeFileUploadAttachment,
    sport?: string
  ): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<UniversalFileIndexResponse>(`${this.baseUrl}/files/index`, {
        teamId,
        ...(sport ? { sport } : {}),
        attachment,
      })
    );

    if (!response.success) {
      throw new Error(response.error ?? 'Failed to index uploaded file');
    }
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
