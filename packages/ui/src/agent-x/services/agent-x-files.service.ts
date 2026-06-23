import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { TeamFileDoc, TeamFileFolderDoc } from '@nxt1/core';
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
import { AgentXVideoUploadService, type VideoUploadProgress } from './agent-x-video-upload.service';

interface TeamFilesResponse {
  readonly success: boolean;
  readonly data?: {
    readonly files: readonly TeamFileDoc[];
    readonly folders: readonly TeamFileFolderDoc[];
  };
  readonly error?: string;
}

interface TeamFileIndexResponse {
  readonly success: boolean;
  readonly data?: {
    readonly fileId: string;
  };
  readonly error?: string;
}

interface TeamFileFolderResponse {
  readonly success: boolean;
  readonly data?: {
    readonly folder: TeamFileFolderDoc;
  };
  readonly error?: string;
}

interface TeamFileMoveResponse {
  readonly success: boolean;
  readonly data?: {
    readonly fileId: string;
    readonly folderId?: string | null;
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

type TeamFileUploadAttachment = {
  readonly id: string;
  readonly url: string;
  readonly storagePath?: string;
  readonly name: string;
  readonly mimeType: string;
  readonly type: TeamFileDoc['kind'];
  readonly sizeBytes: number;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
};

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

  private readonly _files = signal<readonly TeamFileDoc[]>([]);
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
        this.http.get<TeamFilesResponse>(`${this.baseUrl}/files`, {
          params: { teamId },
        })
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load files');
      }

      this._files.set(response.data.files);
      this._folders.set(this.sortFolders(response.data.folders));
      if (!this._selectedId() && response.data.files.length > 0) {
        this._selectedId.set(response.data.files[0]?.id ?? null);
      }
      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_OPERATIONS_LOG_VIEWED, {
        source: 'files-panel',
        count: response.data.files.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load files';
      this.logger.error('Failed to load Team Files', error, { teamId });
      this._error.set(message);
    } finally {
      this._loading.set(false);
    }
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
      this.logger.error('Failed to upload Team Files', error, {
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
        this.http.post<TeamFileFolderResponse>(`${this.baseUrl}/files/folders`, {
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
      this.logger.error('Failed to create Team File folder', error, {
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
        this.http.patch<TeamFileFolderResponse>(
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
      this.logger.error('Failed to update Team File folder', error, {
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
      this.logger.error('Failed to delete Team File folder', error, { folderId, teamId });
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
        this.http.patch<TeamFileMoveResponse>(`${this.baseUrl}/files/${fileId}`, {
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
      this.logger.error('Failed to move Team File', error, { fileId, teamId, folderId });
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

  private async uploadVideoFile(file: File): Promise<TeamFileUploadAttachment> {
    const authToken = await this.resolveAuthToken();

    return await new Promise<TeamFileUploadAttachment>((resolve, reject) => {
      const subscription = this.videoUploadService.uploadVideo(file, authToken, {}).subscribe({
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
    attachment: TeamFileUploadAttachment,
    sport?: string
  ): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<TeamFileIndexResponse>(`${this.baseUrl}/files/index`, {
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
