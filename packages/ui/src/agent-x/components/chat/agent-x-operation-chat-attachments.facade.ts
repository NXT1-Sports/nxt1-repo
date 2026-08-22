import {
  EnvironmentInjector,
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  runInInjectionContext,
  signal,
  type WritableSignal,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { isPlatformBrowser } from '@angular/common';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_ENDPOINTS,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  AGENT_X_RUNTIME_CONFIG,
  resolveAttachmentType,
  type AgentXAttachment,
  type AgentXAttachmentStub,
  type AgentXSelectedContext,
} from '@nxt1/core/ai';
import { buildLinkSourcesFormData, type OnboardingUserType } from '@nxt1/core';
import { APP_EVENTS } from '@nxt1/core/analytics';
import type { LinkSourcesFormData } from '@nxt1/core/api';
import { ModalController } from '@ionic/angular/standalone';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { NxtBreadcrumbService } from '../../../services/breadcrumb/breadcrumb.service';
import { ANALYTICS_ADAPTER } from '../../../services/analytics/analytics-adapter.token';
import { NxtMediaViewerService } from '../../../components/media-viewer/media-viewer.service';
import type { MediaViewerItem } from '../../../components/media-viewer/media-viewer.types';
import {
  AgentXVideoUploadService,
  VIDEO_UPLOAD_CANCELLED_MESSAGE,
} from '../../services/agent-x-video-upload.service';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from '../../services/agent-x-job.service';
import { AgentXService } from '../../services/agent-x.service';
import { AgentXFilesService } from '../../services/agent-x-files.service';
import {
  AgentXAttachmentsSheetComponent,
  type AttachmentSelectedFile,
  type ConnectedAppSource,
  type NativeAttachmentFile,
} from '../modals/agent-x-attachments-sheet.component';
import { buildPendingAttachmentViewer } from '../../utils/pending-attachments-viewer.util';
import type {
  AgentXConnectedAccountsSaveRequest,
  AgentXUser,
} from '../shell/agent-x-shell.component';
import type { MessageAttachment, PendingFile } from './agent-x-operation-chat.models';

export interface AgentXOperationChatAttachmentsFacadeHost {
  readonly contextId: () => string;
  readonly contextType: () => 'operation' | 'command';
  readonly embedded: () => boolean;
  readonly resolvedThreadId: WritableSignal<string | null>;
  readonly videoUploadPercent: WritableSignal<number | null>;
  readonly videoUploadBatch: WritableSignal<VideoUploadBatchProgressState | null>;
  readonly user: () => AgentXUser | null;
  resolveActiveThreadId(): string | null;
  clickDesktopAttachmentInput(): void;
  openFilmReviewLibrary(): void;
  emitConnectedAccountsSave(request: AgentXConnectedAccountsSaveRequest): void;
  uid(): string;
}

interface ChatViewerItem extends MediaViewerItem {
  readonly attachmentId?: string;
}

function resolveViewerTeamId(user: AgentXUser | null): string {
  if (!user) return '';

  const activeTeamId = user.activeTeamId?.trim();
  if (activeTeamId) {
    return activeTeamId;
  }

  const scopedTeamSource = user.connectedSources?.find(
    (source) => source.scopeType === 'team' && typeof source.scopeId === 'string'
  );
  return scopedTeamSource?.scopeId?.trim() ?? '';
}

function resolveViewerSport(user: AgentXUser | null): string | null {
  if (!user) return null;

  const activeSport = user.activeSport?.trim();
  if (activeSport) {
    return activeSport;
  }

  const scopedSportSource = user.connectedSources?.find(
    (source) => source.scopeType === 'sport' && typeof source.scopeId === 'string'
  );
  const scopedSport = scopedSportSource?.scopeId?.trim();
  if (scopedSport) {
    return scopedSport;
  }

  const profileSport = user.selectedSports?.find(
    (sport) => typeof sport === 'string' && sport.trim().length > 0
  );
  return profileSport?.trim() ?? null;
}

type BackgroundUploadStatus = 'queued' | 'uploading' | 'complete' | 'failed';

interface VideoUploadBatchEntry {
  readonly pendingId: string;
  readonly fileName: string;
  readonly status: BackgroundUploadStatus;
  readonly percent: number;
}

interface UploadedVideoResult {
  readonly url: string;
  readonly storagePath?: string;
  readonly cloudflareVideoId?: string;
  readonly cloudflareStatus?: string;
  readonly readyToStream?: boolean;
  readonly thumbnailUrl?: string;
}

export interface VideoUploadBatchProgressState {
  readonly totalFiles: number;
  readonly completedFiles: number;
  readonly failedFiles: number;
  readonly activeFiles: number;
  readonly currentFileName: string | null;
  readonly overallPercent: number;
}

export function buildVideoUploadBatchProgressState(
  entries: readonly Pick<VideoUploadBatchEntry, 'fileName' | 'status' | 'percent'>[]
): VideoUploadBatchProgressState | null {
  if (entries.length === 0) {
    return null;
  }

  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    percent: Math.max(0, Math.min(100, Math.round(entry.percent))),
  }));

  const completedFiles = normalizedEntries.filter((entry) => entry.status === 'complete').length;
  const failedFiles = normalizedEntries.filter((entry) => entry.status === 'failed').length;
  const activeEntries = normalizedEntries.filter((entry) => entry.status === 'uploading');
  const queuedEntries = normalizedEntries.filter((entry) => entry.status === 'queued');
  const currentEntry =
    activeEntries[0] ?? queuedEntries[0] ?? normalizedEntries[normalizedEntries.length - 1] ?? null;

  const overallPercent = Math.round(
    normalizedEntries.reduce((sum, entry) => {
      if (entry.status === 'complete' || entry.status === 'failed') {
        return sum + 100;
      }
      if (entry.status === 'queued') {
        return sum;
      }
      return sum + entry.percent;
    }, 0) / normalizedEntries.length
  );

  return {
    totalFiles: normalizedEntries.length,
    completedFiles,
    failedFiles,
    activeFiles: activeEntries.length,
    currentFileName: currentEntry?.fileName ?? null,
    overallPercent,
  };
}

export function buildVideoUploadProgressDetail(
  uploadBatch: VideoUploadBatchProgressState | null
): string | null {
  if (!uploadBatch) {
    return null;
  }

  if (uploadBatch.totalFiles <= 1) {
    if (uploadBatch.failedFiles > 0) {
      return 'Upload needs attention';
    }
    if (uploadBatch.completedFiles > 0 || uploadBatch.overallPercent >= 100) {
      return 'Video uploaded successfully';
    }
    if (uploadBatch.overallPercent === 0) {
      return null;
    }
    return 'Your video is uploading securely';
  }

  const completionText = `${uploadBatch.completedFiles} of ${uploadBatch.totalFiles} videos uploaded`;
  if (uploadBatch.failedFiles > 0) {
    return `${completionText} • ${uploadBatch.failedFiles} need attention`;
  }
  if (uploadBatch.activeFiles > 1) {
    return `${completionText} • ${uploadBatch.activeFiles} still uploading`;
  }
  return completionText;
}

interface BackgroundUploadRecord {
  readonly pendingId: string;
  readonly resultPromise: Promise<AgentXAttachment | null>;
  readonly resolveResult: (attachment: AgentXAttachment | null) => void;
  started: boolean;
  status: BackgroundUploadStatus;
  attachment: AgentXAttachment | null;
  removed: boolean;
}

const BACKGROUND_UPLOAD_CONCURRENCY = 4;
const NATIVE_VIDEO_UPLOAD_MAX_ATTEMPTS = 3;
const NATIVE_VIDEO_UPLOAD_RETRY_DELAY_MS = 1_200;
const MESSAGE_ATTACHMENT_SYNC_RETRY_MS =
  AGENT_X_RUNTIME_CONFIG.attachmentTransport.messageSyncRetryMs;
const VIDEO_UPLOAD_PROGRESS_SETTLE_MS = 420;
const VIDEO_ATTACHMENT_THUMBNAIL_MAX_EDGE_PX = 320;
const TEAM_FILM_REVIEW_MANAGER_ROLES = new Set([
  'coach',
  'director',
  'admin',
  'administrative',
  'owner',
  'head-coach',
  'assistant-coach',
  'staff',
  'program-director',
]);

export function canAutoCreateTeamFilmReview(role: string | null | undefined): boolean {
  if (!role) return false;

  const normalizedRole = role
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return TEAM_FILM_REVIEW_MANAGER_ROLES.has(normalizedRole);
}

function resolveThumbnailDimensions(
  sourceWidth: number,
  sourceHeight: number
): {
  readonly width: number;
  readonly height: number;
} {
  const safeWidth = Math.max(1, Math.round(sourceWidth) || 320);
  const safeHeight = Math.max(1, Math.round(sourceHeight) || 180);
  const maxEdge = Math.max(safeWidth, safeHeight);

  if (maxEdge <= VIDEO_ATTACHMENT_THUMBNAIL_MAX_EDGE_PX) {
    return {
      width: safeWidth,
      height: safeHeight,
    };
  }

  const scale = VIDEO_ATTACHMENT_THUMBNAIL_MAX_EDGE_PX / maxEdge;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function resolvePersistedVideoThumbnailUrl(
  uploadedThumbnailUrl?: string | null,
  pendingPreviewUrl?: string | null
): string | undefined {
  const normalizedUploadedThumbnailUrl = uploadedThumbnailUrl?.trim();
  if (normalizedUploadedThumbnailUrl && /^https:\/\//i.test(normalizedUploadedThumbnailUrl)) {
    return normalizedUploadedThumbnailUrl;
  }

  void pendingPreviewUrl;

  return undefined;
}

@Injectable()
export class AgentXOperationChatAttachmentsFacade {
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
  private readonly getAuthToken = inject(AGENT_X_AUTH_TOKEN_FACTORY, { optional: true });
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(EnvironmentInjector);
  private readonly modalCtrl = inject(ModalController);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('AgentXOperationChatAttachments');
  private readonly toast = inject(NxtToastService);
  private readonly breadcrumb = inject(NxtBreadcrumbService);
  private readonly analytics = inject(ANALYTICS_ADAPTER, { optional: true });
  private readonly mediaViewer = inject(NxtMediaViewerService);
  private readonly videoUploadService = inject(AgentXVideoUploadService);
  private readonly agentXService = inject(AgentXService);
  private readonly filesService = inject(AgentXFilesService);

  readonly pendingFiles = signal<PendingFile[]>([]);
  readonly pendingConnectedSources = signal<ConnectedAppSource[]>([]);
  readonly pendingSelectedContexts = this.agentXService.pendingSelectedContexts;
  readonly isDragActive = signal(false);
  readonly showDesktopAttachmentMenu = signal(false);
  readonly desktopAttachmentSources = computed(() =>
    this.agentXService.attachmentConnectedSources()
  );

  private host: AgentXOperationChatAttachmentsFacadeHost | null = null;
  private readonly backgroundUploads = new Map<string, BackgroundUploadRecord>();
  private readonly videoUploadBatchEntries = new Map<string, VideoUploadBatchEntry>();
  private readonly backgroundUploadQueue: Array<() => Promise<void>> = [];
  private activeBackgroundUploads = 0;
  private videoUploadBatchClearTimer: ReturnType<typeof setTimeout> | null = null;

  configure(host: AgentXOperationChatAttachmentsFacadeHost): void {
    this.host = host;
  }

  private setVideoUploadBatchEntry(
    pendingId: string,
    fileName: string,
    status: BackgroundUploadStatus,
    percent: number
  ): void {
    this.cancelVideoUploadBatchClear();
    this.videoUploadBatchEntries.set(pendingId, {
      pendingId,
      fileName,
      status,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
    });
    this.publishVideoUploadBatchState();
  }

  private removeVideoUploadBatchEntry(pendingId: string): void {
    if (!this.videoUploadBatchEntries.delete(pendingId)) {
      return;
    }
    this.publishVideoUploadBatchState();
  }

  private publishVideoUploadBatchState(): void {
    const host = this.host;
    if (!host) {
      return;
    }

    const state = buildVideoUploadBatchProgressState([...this.videoUploadBatchEntries.values()]);
    if (!state) {
      host.videoUploadBatch.set(null);
      host.videoUploadPercent.set(null);
      return;
    }

    host.videoUploadBatch.set(state);
    host.videoUploadPercent.set(state.overallPercent);

    const hasInFlightUploads = state.completedFiles + state.failedFiles < state.totalFiles;
    if (!hasInFlightUploads) {
      this.scheduleVideoUploadBatchClear();
    }
  }

  private scheduleVideoUploadBatchClear(): void {
    if (this.videoUploadBatchClearTimer !== null) {
      return;
    }

    this.videoUploadBatchClearTimer = setTimeout(() => {
      this.videoUploadBatchClearTimer = null;
      this.videoUploadBatchEntries.clear();
      this.publishVideoUploadBatchState();
    }, VIDEO_UPLOAD_PROGRESS_SETTLE_MS);
  }

  private cancelVideoUploadBatchClear(): void {
    if (this.videoUploadBatchClearTimer === null) {
      return;
    }

    clearTimeout(this.videoUploadBatchClearTimer);
    this.videoUploadBatchClearTimer = null;
  }

  clearVideoUploadProgress(): void {
    this.cancelVideoUploadBatchClear();
    this.videoUploadBatchEntries.clear();
    this.publishVideoUploadBatchState();
  }

  removePendingFile(index: number): void {
    this.pendingFiles.update((previous) => {
      const removed = previous[index];
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      if (removed) {
        this.discardPendingUpload(removed.id);
      }
      return previous.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  removePendingConnectedSource(index: number): void {
    this.pendingConnectedSources.update((sources) =>
      sources.filter((_, sourceIndex) => sourceIndex !== index)
    );
  }

  removePendingSelectedContext(index: number): void {
    this.agentXService.removePendingSelectedContext(index);
  }

  clearPendingSelectedContexts(): void {
    this.agentXService.clearPendingSelectedContexts();
  }

  addPendingSelectedContext(context: AgentXSelectedContext): void {
    this.agentXService.queueSelectedContext(context);
  }

  addPendingSelectedContexts(contexts: readonly AgentXSelectedContext[]): void {
    this.agentXService.queueSelectedContexts(contexts);
  }

  async onUploadClick(): Promise<void> {
    if (this.isDesktopAttachmentMenuMode()) {
      this.showDesktopAttachmentMenu.update((open) => !open);
      return;
    }

    const modal = await this.modalCtrl.create({
      component: AgentXAttachmentsSheetComponent,
      componentProps: {
        connectedSources: this.agentXService.attachmentConnectedSources(),
      },
      breakpoints: [0, 0.5, 0.72],
      initialBreakpoint: 0.5,
      expandToScroll: false,
      handle: true,
      handleBehavior: 'cycle',
      showBackdrop: true,
      backdropBreakpoint: 0.5,
      backdropDismiss: true,
      canDismiss: true,
      cssClass: ['nxt-bottom-sheet', 'nxt-bottom-sheet-content'],
    });

    await modal.present();
    const result = await modal.onWillDismiss<AttachmentSelectedFile[] | ConnectedAppSource>();

    if (result.data && result.role === 'files-selected') {
      this.stageFiles(result.data as AttachmentSelectedFile[]);
      return;
    }

    if (result.data && result.role === 'source-selected') {
      this.addPendingConnectedSource(result.data as ConnectedAppSource);
      return;
    }

    if (result.role === 'manage-connected-apps') {
      await this.openConnectedAccountsModal();
    }
  }

  closeDesktopAttachmentMenu(): void {
    this.showDesktopAttachmentMenu.set(false);
  }

  onShellClick(event: MouseEvent): void {
    if (!this.showDesktopAttachmentMenu()) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    if (target.closest('.desktop-attach-menu') || target.closest('.input-btn--attach')) {
      return;
    }

    this.closeDesktopAttachmentMenu();
  }

  onDesktopAttachmentUploadClick(): void {
    const host = this.requireHost();
    this.showDesktopAttachmentMenu.set(false);
    host.clickDesktopAttachmentInput();
  }

  async onDesktopAttachmentFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    input.value = '';

    if (!files.length) {
      return;
    }

    const addedCount = this.stageFiles(files);
    if (addedCount > 0) {
      await this.haptics.impact('light');
    }
  }

  async onFilesPasted(files: readonly File[]): Promise<void> {
    const host = this.requireHost();
    const addedCount = this.stageFiles(files);
    if (addedCount === 0) {
      return;
    }

    await this.haptics.impact('light');
    this.logger.info('Files pasted into operation chat', {
      contextId: host.contextId(),
      count: addedCount,
    });
    this.breadcrumb.trackUserAction('agent-x-files-pasted', {
      contextId: host.contextId(),
      count: addedCount,
    });
  }

  onDesktopAttachmentSourceSelected(source: ConnectedAppSource): void {
    this.addPendingConnectedSource(source);
    this.showDesktopAttachmentMenu.set(false);
  }

  async onDesktopManageConnectedApps(): Promise<void> {
    this.showDesktopAttachmentMenu.set(false);
    await this.openConnectedAccountsModal();
  }

  onDragStateChange(active: boolean): void {
    this.isDragActive.set(active);
  }

  async onFilesDropped(files: File[]): Promise<void> {
    const host = this.requireHost();
    const addedCount = this.stageFiles(files);
    this.isDragActive.set(false);

    if (addedCount === 0) {
      return;
    }

    await this.haptics.impact('light');
    this.logger.info('Files dropped into operation chat', {
      contextId: host.contextId(),
      count: addedCount,
    });
    this.breadcrumb.trackUserAction('agent-x-files-dropped', {
      contextId: host.contextId(),
      count: addedCount,
    });
    this.analytics?.trackEvent(APP_EVENTS.AGENT_X_FILES_DROPPED, {
      contextId: host.contextId(),
      contextType: host.contextType(),
      count: addedCount,
    });
  }

  async uploadFiles(files: readonly PendingFile[], authToken: string): Promise<AgentXAttachment[]> {
    const host = this.requireHost();
    const uploadTimeoutMs = AGENT_X_RUNTIME_CONFIG.attachmentTransport.uploadTimeoutMs;
    const maxUploadAttempts = AGENT_X_RUNTIME_CONFIG.attachmentTransport.uploadMaxAttempts;

    const uploaded: AgentXAttachment[] = [];
    const failed: string[] = [];

    const videoFiles = files.filter((file) => file.isVideo);
    const nonVideoFiles = files.filter((file) => !file.isVideo);

    for (const pending of nonVideoFiles) {
      const formData = new FormData();
      formData.append('file', pending.file);
      const threadId = host.resolveActiveThreadId();
      if (threadId) formData.append('threadId', threadId);

      let uploadedThisFile = false;

      for (let attempt = 1; attempt <= maxUploadAttempts; attempt += 1) {
        try {
          const abortController = new AbortController();
          const timeoutId = setTimeout(() => abortController.abort(), uploadTimeoutMs);

          const response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.UPLOAD}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${authToken}` },
            body: formData,
            signal: abortController.signal,
          }).finally(() => clearTimeout(timeoutId));

          if (!response.ok) {
            const errorText = await response.text().catch(() => 'Upload failed');
            throw new Error(`HTTP ${response.status}: ${errorText || 'Unknown error'}`);
          }

          const result = (await response.json()) as {
            success: boolean;
            data?: {
              url: string;
              storagePath?: string;
              name: string;
              mimeType: string;
              sizeBytes: number;
            };
            error?: string;
          };

          if (!result.success || !result.data) {
            throw new Error(result.error || 'Unknown backend error');
          }

          uploaded.push({
            id: pending.id,
            url: result.data.url,
            ...(result.data.storagePath ? { storagePath: result.data.storagePath } : {}),
            name: result.data.name,
            mimeType: result.data.mimeType,
            type: resolveAttachmentType(result.data.mimeType),
            sizeBytes: result.data.sizeBytes,
          });

          this.logger.info('File uploaded successfully', {
            contextId: host.contextId(),
            fileName: pending.file.name,
            fileSize: pending.file.size,
            mimeType: result.data.mimeType,
            hasThreadId: !!threadId,
            attempt,
          });

          uploadedThisFile = true;
          break;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);

          if (attempt < maxUploadAttempts) {
            this.logger.warn('File upload attempt failed; retrying once', {
              contextId: host.contextId(),
              fileName: pending.file.name,
              attempt,
              maxAttempts: maxUploadAttempts,
              errorMessage,
            });
            continue;
          }

          this.logger.error('File upload failed after retries', error, {
            contextId: host.contextId(),
            fileName: pending.file.name,
            fileSize: pending.file.size,
            fileMimeType: pending.file.type,
            hasThreadId: !!threadId,
            maxAttempts: maxUploadAttempts,
            errorMessage,
          });
          this.breadcrumb.trackUserAction('agent-x-upload-network-error', {
            contextId: host.contextId(),
            fileName: pending.file.name,
          });
        }
      }

      if (!uploadedThisFile) {
        failed.push(pending.file.name);
      }
    }

    if (nonVideoFiles.length > 0) {
      this.logger.info('Non-video attachment upload batch complete', {
        contextId: host.contextId(),
        attempted: nonVideoFiles.length,
        succeeded: uploaded.length,
        failed: failed.length,
        failedNames: failed,
      });

      this.analytics?.trackEvent(APP_EVENTS.AGENT_X_ATTACHMENTS_UPLOADED, {
        contextId: host.contextId(),
        contextType: host.contextType(),
        totalAttempted: nonVideoFiles.length,
        successCount: uploaded.length,
        failureCount: failed.length,
        failureReasons: 'see breadcrumbs',
      });

      if (failed.length > 0 && failed.length === nonVideoFiles.length) {
        this.toast.error(
          `All ${failed.length} file(s) failed to upload. Check your connection and try again.`
        );
      } else if (failed.length > 0) {
        this.toast.warning(
          `${failed.length} of ${nonVideoFiles.length} file(s) failed to upload: ${failed.join(', ')}. Other files sent.`
        );
      }
    }

    for (const pending of videoFiles) {
      this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'queued', 0);
    }

    const MAX_CONCURRENT_VIDEO_UPLOADS = 3;
    const uploadedArray: (AgentXAttachment | null)[] = new Array(videoFiles.length).fill(null);
    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < videoFiles.length) {
        const index = currentIndex++;
        const pending = videoFiles[index];
        try {
          this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'uploading', 0);
          const videoResult = await this.uploadPendingVideoWithRetry(pending, authToken);

          const persistedThumbnailUrl = resolvePersistedVideoThumbnailUrl(
            videoResult.thumbnailUrl,
            pending.previewUrl
          );

          uploadedArray[index] = {
            id: pending.id,
            url: videoResult.url,
            ...(videoResult.storagePath ? { storagePath: videoResult.storagePath } : {}),
            ...(videoResult.cloudflareVideoId
              ? { cloudflareVideoId: videoResult.cloudflareVideoId }
              : {}),
            ...(videoResult.cloudflareStatus
              ? { cloudflareStatus: videoResult.cloudflareStatus }
              : {}),
            ...(videoResult.readyToStream !== undefined
              ? { readyToStream: videoResult.readyToStream }
              : {}),
            ...(persistedThumbnailUrl ? { thumbnailUrl: persistedThumbnailUrl } : {}),
            name: pending.file.name,
            mimeType: pending.file.type,
            type: 'video',
            sizeBytes: pending.sizeBytes ?? pending.file.size,
          };
        } catch (error) {
          this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'failed', 100);
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error('Video upload failed', error, {
            contextId: host.contextId(),
            fileName: pending.file.name,
            fileSize: pending.sizeBytes ?? pending.file.size,
            errorMessage,
          });
          this.breadcrumb.trackUserAction('agent-x-video-upload-error', {
            contextId: host.contextId(),
            fileName: pending.file.name,
            errorType: error instanceof Error ? 'network' : 'unknown',
          });
          this.analytics?.trackEvent(APP_EVENTS.AGENT_X_VIDEO_UPLOAD_FAILED, {
            contextId: host.contextId(),
            contextType: host.contextType(),
            fileName: pending.file.name,
            errorMessage,
          });
          failed.push(pending.file.name);
        }
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT_VIDEO_UPLOADS, videoFiles.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    for (const attachment of uploadedArray) {
      if (attachment) {
        uploaded.push(attachment);
      }
    }

    if (videoFiles.length > 0) {
      const videoFailureCount = failed.filter((fileName) =>
        videoFiles.some((video) => video.file.name === fileName)
      ).length;
      this.logger.info('Video attachment upload batch complete', {
        contextId: host.contextId(),
        attempted: videoFiles.length,
        succeeded: videoFiles.length - videoFailureCount,
        failed: videoFailureCount,
      });
    }

    this.logger.info('All file uploads complete for operation chat', {
      contextId: host.contextId(),
      totalAttempted: files.length,
      totalSucceeded: uploaded.length,
      totalFailed: failed.length,
      videos: videoFiles.length,
      nonVideos: nonVideoFiles.length,
    });

    return uploaded;
  }

  async prepareAttachmentsForSend(
    files: readonly PendingFile[],
    authToken: string
  ): Promise<AgentXAttachment[]> {
    const records = files.map((pending) => this.ensureBackgroundUpload(pending, authToken));

    await Promise.all(records.map((record) => record.resultPromise));

    let readyAttachments = files
      .map((pending) => this.backgroundUploads.get(pending.id)?.attachment ?? null)
      .filter((attachment): attachment is AgentXAttachment => attachment !== null);

    if (readyAttachments.length !== files.length) {
      const retryFiles = files.filter(
        (pending) => !this.backgroundUploads.get(pending.id)?.attachment
      );
      if (retryFiles.length > 0) {
        this.logger.warn('Retrying incomplete attachment uploads before blocking send', {
          contextId: this.requireHost().contextId(),
          retryCount: retryFiles.length,
          retryNames: retryFiles.map((pending) => pending.file.name),
        });
        for (const pending of retryFiles) {
          this.backgroundUploads.delete(pending.id);
          if (pending.isVideo) {
            this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'queued', 0);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, NATIVE_VIDEO_UPLOAD_RETRY_DELAY_MS));

        const retryRecords = retryFiles.map((pending) =>
          this.ensureBackgroundUpload(pending, authToken)
        );
        await Promise.all(retryRecords.map((record) => record.resultPromise));

        readyAttachments = files
          .map((pending) => this.backgroundUploads.get(pending.id)?.attachment ?? null)
          .filter((attachment): attachment is AgentXAttachment => attachment !== null);
      }
    }

    if (readyAttachments.length === files.length) {
      this.clearVideoUploadProgress();
    }

    return readyAttachments;
  }

  private async waitForBackgroundUpload(
    record: BackgroundUploadRecord,
    timeoutMs: number
  ): Promise<AgentXAttachment | null> {
    const timeoutPromise = new Promise<null>((resolve) => {
      const timeoutId = setTimeout(() => {
        clearTimeout(timeoutId);
        resolve(null);
      }, timeoutMs);
    });

    try {
      return await Promise.race([record.resultPromise, timeoutPromise]);
    } catch {
      return null;
    }
  }

  syncPendingAttachmentsAfterSend(
    files: readonly PendingFile[],
    idempotencyKey: string,
    authToken: string,
    sentAttachmentIds: ReadonlySet<string>
  ): void {
    for (const pending of files) {
      const record = this.ensureBackgroundUpload(pending, authToken);
      if (record.attachment && sentAttachmentIds.has(record.attachment.id)) {
        this.backgroundUploads.delete(pending.id);
        continue;
      }

      void record.resultPromise
        .then(async (attachment) => {
          if (!attachment || sentAttachmentIds.has(attachment.id) || record.removed) {
            return;
          }
          await this.syncAttachmentToPersistedMessage(idempotencyKey, attachment, authToken);
        })
        .catch((error) => {
          this.logger.warn('Silent background attachment sync skipped after upload failure', {
            fileName: pending.file.name,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          // Guard: only delete the record once the attachment has been accounted for
          // in sentAttachmentIds (set by onWaitingForAttachments after awaitPendingUploads
          // resolves). Deleting prematurely causes awaitPendingUploads to find no record
          // and trigger a redundant second upload for the same file.
          const rec = this.backgroundUploads.get(pending.id);
          if (!rec || rec.removed || (rec.attachment && sentAttachmentIds.has(rec.attachment.id))) {
            this.backgroundUploads.delete(pending.id);
          }
          // Otherwise leave the record in place — awaitPendingUploads will collect
          // and clean it up when the stubs path resolves.
        });
    }
  }

  openPendingFileViewer(index: number): void {
    const viewer = buildPendingAttachmentViewer(this.pendingFiles(), index, {
      createObjectURL: (file) => URL.createObjectURL(file),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });

    if (!viewer.items.length) return;

    this.mediaViewer
      .open({
        items: viewer.items,
        initialIndex: viewer.initialIndex,
        showShare: false,
        source: 'agent-x-pending',
        presentation: this.resolveMediaViewerPresentation(),
      })
      .finally(() => viewer.cleanup());
  }

  openAttachmentViewer(
    attachments: readonly MessageAttachment[],
    index: number,
    options?: { readonly messageId?: string }
  ): void {
    const mediaItems: ChatViewerItem[] = attachments.map((attachment) => {
      if (attachment.type === 'image' || attachment.type === 'video') {
        return {
          url: attachment.url,
          ...(attachment.id ? { attachmentId: attachment.id } : {}),
          ...(attachment.storagePath ? { storagePath: attachment.storagePath } : {}),
          type: attachment.type,
          alt: attachment.name,
          ...(attachment.thumbnailUrl ? { poster: attachment.thumbnailUrl } : {}),
        };
      }
      return {
        url: attachment.url,
        ...(attachment.id ? { attachmentId: attachment.id } : {}),
        type: 'doc',
        name: attachment.name,
      };
    });

    if (!mediaItems.length) return;

    const host = this.host;
    const viewerUser = host?.user() ?? null;
    const activeTeamId = resolveViewerTeamId(viewerUser);
    const activeSport = resolveViewerSport(viewerUser);
    const messageId = options?.messageId?.trim() ?? '';
    const canPromoteAttachments = messageId.length > 0;

    this.mediaViewer.open({
      items: mediaItems,
      initialIndex: Math.max(0, Math.min(index, mediaItems.length - 1)),
      source: 'agent-x-chat',
      ...(canPromoteAttachments
        ? {
            primaryActionLabel: 'Add to Files',
            primaryActionBusyLabel: 'Adding...',
            primaryActionAriaLabel: 'Add this attachment to files',
            primaryAction: async (item: MediaViewerItem) => {
              const viewerItem = item as ChatViewerItem;
              const attachmentId = viewerItem.attachmentId?.trim() ?? '';
              if (!attachmentId) {
                throw new Error('This attachment cannot be added to files');
              }

              await this.filesService.promoteChatAttachment({
                teamId: activeTeamId,
                messageId,
                attachmentId,
                sport: activeSport,
              });
            },
          }
        : {}),
      // Preserve the previous mobile chat-strip behavior so Agent X stays open
      // beneath the viewer instead of dismissing into a native sheet.
      presentation: 'overlay',
    });
  }

  private resolveMediaViewerPresentation(): 'overlay' | 'bottom-sheet' {
    // Native iOS video playback is more reliable through the Ionic bottom-sheet
    // presentation than the web overlay path.
    return Capacitor.isNativePlatform() ? 'bottom-sheet' : 'overlay';
  }

  isCloudflareWatchUrl(url: string | null | undefined): boolean {
    // Legacy helper for previously persisted Cloudflare attachments.
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === 'watch.cloudflarestream.com' ||
        parsed.hostname === 'iframe.videodelivery.net' ||
        parsed.hostname.endsWith('.videodelivery.net')
      );
    } catch {
      return false;
    }
  }

  toCloudflareEmbedUrl(url: string | null | undefined): string | null {
    // Legacy helper for converting historic Cloudflare watch links to iframe links.
    if (!url) return null;
    try {
      const parsed = new URL(url);
      if (
        parsed.hostname !== 'watch.cloudflarestream.com' &&
        parsed.hostname !== 'iframe.videodelivery.net' &&
        !parsed.hostname.endsWith('.videodelivery.net')
      ) {
        return null;
      }
      const videoId = parsed.pathname.split('/').filter(Boolean)[0];
      if (!videoId) return null;
      return `https://iframe.videodelivery.net/${videoId}`;
    } catch {
      return null;
    }
  }

  /**
   * Kick off background uploads for files that were loaded directly into
   * `pendingFiles` (e.g. initialFiles passed into a new session) without going
   * through `stageFiles()`. On a cold-start session the auth token may not be
   * available immediately, but `primePendingUploads` already guards against that
   * and is a no-op when the token is absent — the upload will start on send.
   * Calling this eagerly maximises the chance that uploads are ready before the
   * user hits send.
   */
  primeInitialFiles(files: readonly PendingFile[]): void {
    if (files.length === 0) return;
    void this.primePendingUploads(files);
  }

  hasActivePendingUploads(): boolean {
    if (this.activeBackgroundUploads > 0 || this.backgroundUploadQueue.length > 0) {
      return true;
    }

    for (const record of this.backgroundUploads.values()) {
      if (!record.removed && (record.status === 'queued' || record.status === 'uploading')) {
        return true;
      }
    }

    return false;
  }

  clearPendingFiles(): void {
    for (const pending of this.pendingFiles()) {
      if (pending.previewUrl) {
        URL.revokeObjectURL(pending.previewUrl);
      }
      this.discardPendingUpload(pending.id);
    }
    this.pendingFiles.set([]);
  }

  waitForVideoThumbnails(
    files: readonly PendingFile[],
    timeoutMs = 1_200
  ): Promise<readonly PendingFile[]> {
    const pendingThumbnailIds = new Set(
      files.filter((file) => file.isVideo && !file.previewUrl).map((file) => file.id)
    );

    if (pendingThumbnailIds.size === 0) {
      return Promise.resolve(files);
    }

    const startedAt = Date.now();
    const resolveCurrentFiles = (): readonly PendingFile[] => {
      const currentById = new Map(this.pendingFiles().map((file) => [file.id, file]));
      return files.map((file) => currentById.get(file.id) ?? file);
    };

    return new Promise((resolve) => {
      const check = (): void => {
        const current = resolveCurrentFiles();
        const settled = current.every(
          (file) => !pendingThumbnailIds.has(file.id) || !!file.previewUrl
        );
        if (settled || Date.now() - startedAt >= timeoutMs) {
          resolve(current);
          return;
        }
        setTimeout(check, 80);
      };

      check();
    });
  }

  private fileSignature(file: File): string {
    return `${file.name}|${resolveAttachmentFileSize(file)}|${file.lastModified}|${file.type}`;
  }

  stageFiles(files: readonly AttachmentSelectedFile[]): number {
    const host = this.requireHost();
    if (files.length === 0) return 0;

    const currentPending = this.pendingFiles();
    const knownFileSignatures = new Set(
      currentPending.map((pending) => this.fileSignature(pending.file))
    );
    const nextPending: PendingFile[] = [];

    for (const selectedFile of files) {
      const nativeMetadata = getNativeAttachmentMetadata(selectedFile);
      const file = normalizeAttachmentFile(unwrapSelectedFile(selectedFile), nativeMetadata);
      const sizeBytes = resolveAttachmentFileSize(file);
      const signature = this.fileSignature(file);
      if (knownFileSignatures.has(signature)) {
        this.logger.info('Skipped duplicate operation chat file', {
          contextId: host.contextId(),
          fileName: file.name,
          fileSize: sizeBytes,
          mimeType: file.type,
        });
        continue;
      }

      if (!AGENT_X_ALLOWED_MIME_TYPES.includes(file.type)) {
        this.toast.error(`Unsupported file type: ${file.name}`);
        this.logger.warn('Rejected unsupported operation chat file type', {
          contextId: host.contextId(),
          fileName: file.name,
          mimeType: file.type,
        });
        continue;
      }

      if (file.type.startsWith('video/') && sizeBytes > AGENT_X_MAX_VIDEO_FILE_SIZE) {
        const maxMb = Math.round(AGENT_X_MAX_VIDEO_FILE_SIZE / (1024 * 1024));
        this.toast.error(`${file.name} exceeds the ${maxMb}MB limit`);
        this.logger.warn('Rejected oversized operation chat file', {
          contextId: host.contextId(),
          fileName: file.name,
          sizeBytes,
          maxSizeBytes: AGENT_X_MAX_VIDEO_FILE_SIZE,
        });
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      nextPending.push({
        id: crypto.randomUUID(),
        file,
        ...(nativeMetadata.nativeUri ? { nativeUri: nativeMetadata.nativeUri } : {}),
        ...(nativeMetadata.nativeWebPath ? { nativeWebPath: nativeMetadata.nativeWebPath } : {}),
        ...(nativeMetadata.nativeSizeBytes ? { sizeBytes: nativeMetadata.nativeSizeBytes } : {}),
        ...(nativeMetadata.nativeDurationSeconds
          ? { durationSeconds: nativeMetadata.nativeDurationSeconds }
          : {}),
        ...(nativeMetadata.nativeSource ? { nativeSource: nativeMetadata.nativeSource } : {}),
        // Videos: start null, canvas thumbnail is set async below.
        // Images: blob URL is fine as <img src> renders it directly.
        previewUrl: isImage ? URL.createObjectURL(file) : (nativeMetadata.thumbnailDataUrl ?? null),
        isImage,
        isVideo,
      });
      knownFileSignatures.add(signature);
    }

    if (nextPending.length > 0) {
      this.pendingFiles.update((previous) => [...previous, ...nextPending]);
      void this.primePendingUploads(nextPending);
      for (const pending of nextPending.filter((p) => p.isVideo && p.previewUrl === null)) {
        void this.generateAndSetVideoThumbnail(pending);
      }
    }

    return nextPending.length;
  }

  private async generateAndSetVideoThumbnail(pending: PendingFile): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const thumbnailSource =
        pending.file.size === 0 && pending.nativeWebPath ? pending.nativeWebPath : pending.file;
      const dataUrl =
        typeof thumbnailSource === 'string'
          ? await this.generateVideoThumbnailFromUrl(thumbnailSource)
          : await this.generateVideoThumbnail(thumbnailSource);
      this.pendingFiles.update((list) =>
        list.map((p) =>
          p.id === pending.id && p.previewUrl === null ? { ...p, previewUrl: dataUrl } : p
        )
      );
    } catch {
      this.logger.warn('Video thumbnail generation failed', { name: pending.file.name });
    }
  }

  private generateVideoThumbnail(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      const objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;

      const cleanup = (): void => {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(objectUrl);
      };

      video.addEventListener(
        'loadeddata',
        () => {
          video.currentTime = Math.min(1, video.duration * 0.25) || 0;
        },
        { once: true }
      );

      video.addEventListener(
        'seeked',
        () => {
          try {
            const { width, height } = resolveThumbnailDimensions(
              video.videoWidth || 320,
              video.videoHeight || 240
            );
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              cleanup();
              reject(new Error('Canvas 2D context unavailable'));
              return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
            cleanup();
            resolve(dataUrl);
          } catch (err) {
            cleanup();
            reject(err);
          }
        },
        { once: true }
      );

      video.addEventListener(
        'error',
        () => {
          cleanup();
          reject(new Error(`Video thumbnail failed: ${file.name}`));
        },
        { once: true }
      );

      video.load();
    });
  }

  private generateVideoThumbnailFromUrl(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = url;

      const cleanup = (): void => {
        video.removeAttribute('src');
        video.load();
      };

      video.addEventListener(
        'loadeddata',
        () => {
          video.currentTime = Math.min(1, video.duration * 0.25) || 0;
        },
        { once: true }
      );

      video.addEventListener(
        'seeked',
        () => {
          try {
            const { width, height } = resolveThumbnailDimensions(
              video.videoWidth || 320,
              video.videoHeight || 240
            );
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              cleanup();
              reject(new Error('Canvas 2D context unavailable'));
              return;
            }
            ctx.drawImage(video, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
            cleanup();
            resolve(dataUrl);
          } catch (err) {
            cleanup();
            reject(err);
          }
        },
        { once: true }
      );

      video.addEventListener(
        'error',
        () => {
          cleanup();
          reject(new Error(`Video thumbnail failed: ${url}`));
        },
        { once: true }
      );

      video.load();
    });
  }

  private async primePendingUploads(files: readonly PendingFile[]): Promise<void> {
    const authToken = await this.getAuthToken?.().catch(() => null);
    if (!authToken) {
      return;
    }

    for (const pending of files) {
      this.ensureBackgroundUpload(pending, authToken);
    }
  }

  /**
   * Non-blocking split for immediate send.
   *
   * Ensures all background uploads have been started, then partitions the
   * pending files into:
   * - `ready`: files whose upload has already completed (have an `attachment`)
   * - `stubs`: files still uploading — returns only their metadata (no URL yet)
   *
   * The caller should include `ready` as full attachments in the chat request
   * and pass `stubs` as `attachmentStubs`, triggering the backend's
   * `waiting_for_attachments` pipeline.
   */
  prepareForImmediateSend(
    files: readonly PendingFile[],
    authToken: string
  ): { ready: AgentXAttachment[]; stubs: AgentXAttachmentStub[] } {
    const ready: AgentXAttachment[] = [];
    const stubs: AgentXAttachmentStub[] = [];
    for (const pending of files) {
      const record = this.ensureBackgroundUpload(pending, authToken);
      if (record.attachment) {
        ready.push(record.attachment);
      } else {
        stubs.push({
          id: pending.id,
          name: pending.file.name,
          mimeType: pending.file.type,
          sizeBytes: pending.sizeBytes ?? pending.file.size,
          type: resolveAttachmentType(pending.file.type),
        });
      }
    }
    return { ready, stubs };
  }

  /**
   * Waits for all still-uploading files to finish (up to `timeoutMs`).
   *
   * Ensures background uploads are started, then awaits their completion
   * promises. Used by the `onWaitingForAttachments` SSE callback to resolve
   * the backend waiter once uploads finish.
   *
   * Returns only successfully uploaded attachments (failed / timed-out are
   * silently omitted — the backend's timeout message covers the failure case).
   *
   * If a background upload already failed (e.g. due to a cold-start Capacitor
   * bridge race on the first new-session upload), the failed record is discarded
   * and the upload is restarted once with the current auth token before waiting.
   */
  async awaitPendingUploads(
    files: readonly PendingFile[],
    authToken: string,
    timeoutMs: number
  ): Promise<AgentXAttachment[]> {
    const waitDeadlineMs = Date.now() + timeoutMs;
    // Only process files that have an active upload record in backgroundUploads.
    // Files whose records are missing were either:
    //   - ready attachments already included in the original chat request, or
    //   - already cleaned up by a prior awaitPendingUploads call.
    // Calling ensureBackgroundUpload for missing records would start a redundant
    // second upload, so we deliberately skip them here.
    const activeEntries: Array<{ pending: PendingFile; record: BackgroundUploadRecord }> = [];
    for (const pending of files) {
      let record = this.backgroundUploads.get(pending.id);
      if (record) {
        // If the first-attempt upload failed (e.g. Capacitor bridge cold-start
        // race on a new session), restart it once so the backend's
        // waiting_for_attachments window is fully utilised before giving up.
        if (record.status === 'failed' && !record.attachment && !record.removed) {
          this.logger.info('Restarting failed background video upload in awaitPendingUploads', {
            pendingId: pending.id,
            fileName: pending.file.name,
          });
          this.backgroundUploads.delete(pending.id);
          record = this.ensureBackgroundUpload(pending, authToken);
        }
        activeEntries.push({ pending, record });
      }
    }

    const pendingRecords = activeEntries
      .map((e) => e.record)
      .filter((r) => !r.attachment && r.status !== 'failed');
    if (pendingRecords.length > 0) {
      await Promise.all(
        pendingRecords.map((record) => this.waitForBackgroundUpload(record, timeoutMs))
      );
    }

    // Second-chance restart: some uploads may have been 'uploading' when
    // awaitPendingUploads was called (so they were not restarted above), but
    // then exhausted all their own retries and settled as 'failed' during the
    // wait. This is the classic Capacitor cold-start race — the native Firebase
    // Storage SDK fails its first N attempts (bridge not fully warm) but succeeds
    // once the bridge has been used for a few seconds. At this point several
    // seconds have passed so the bridge is ready; restart and wait once more.
    const failedDuringWait = activeEntries.filter(({ pending }) => {
      const rec = this.backgroundUploads.get(pending.id);
      return rec !== undefined && rec.status === 'failed' && !rec.attachment && !rec.removed;
    });
    if (failedDuringWait.length > 0) {
      this.logger.info(
        'Restarting uploads that failed during awaitPendingUploads wait (Capacitor cold-start race)',
        {
          count: failedDuringWait.length,
          fileNames: failedDuringWait.map(({ pending }) => pending.file.name),
        }
      );
      for (const { pending } of failedDuringWait) {
        this.backgroundUploads.delete(pending.id);
        if (pending.isVideo) {
          this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'queued', 0);
        }
        this.ensureBackgroundUpload(pending, authToken);
      }
      const restartedRecords = failedDuringWait
        .map(({ pending }) => this.backgroundUploads.get(pending.id))
        .filter(
          (r): r is BackgroundUploadRecord =>
            r !== undefined && !r.attachment && r.status !== 'failed'
        );
      if (restartedRecords.length > 0) {
        // Cap the restart timeout so the resolve POST still reaches the backend
        // before its attachment waiter expires.
        const remainingWaitMs = Math.max(0, waitDeadlineMs - Date.now());
        const restartTimeoutMs = Math.min(remainingWaitMs, 60_000);
        if (restartTimeoutMs > 0) {
          await Promise.all(
            restartedRecords.map((record) => this.waitForBackgroundUpload(record, restartTimeoutMs))
          );
        }
      }
    }

    const result = activeEntries
      .map(({ pending }) => this.backgroundUploads.get(pending.id)?.attachment ?? null)
      .filter((a): a is AgentXAttachment => a !== null);

    // Clean up records now that we have collected all results. This unblocks the
    // deferred .finally() in syncPendingAttachmentsAfterSend — it will see !rec
    // and skip deletion (a safe no-op).
    for (const { pending } of activeEntries) {
      this.backgroundUploads.delete(pending.id);
    }

    return result;
  }

  private ensureBackgroundUpload(pending: PendingFile, authToken: string): BackgroundUploadRecord {
    let record = this.backgroundUploads.get(pending.id);
    if (!record) {
      let resolveResult: (attachment: AgentXAttachment | null) => void = () => undefined;
      const resultPromise = new Promise<AgentXAttachment | null>((resolve) => {
        resolveResult = resolve;
      });
      record = {
        pendingId: pending.id,
        resultPromise,
        resolveResult,
        started: false,
        status: 'queued',
        attachment: null,
        removed: false,
      };
      this.backgroundUploads.set(pending.id, record);
      if (pending.isVideo) {
        this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'queued', 0);
      }
    }

    if (!record.started) {
      record.started = true;
      this.enqueueBackgroundUpload(async () => {
        const activeRecord = this.backgroundUploads.get(pending.id);
        if (!activeRecord || activeRecord.removed) {
          activeRecord?.resolveResult(null);
          return;
        }

        activeRecord.status = 'uploading';
        if (pending.isVideo) {
          this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'uploading', 0);
        }
        if (pending.isVideo && pending.nativeUri) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        const attachment = await this.uploadPendingFile(pending, authToken);
        activeRecord.attachment = attachment;
        activeRecord.status = attachment ? 'complete' : 'failed';
        activeRecord.resolveResult(attachment);
      });
    }

    return record;
  }

  private enqueueBackgroundUpload(task: () => Promise<void>): void {
    this.backgroundUploadQueue.push(task);
    this.drainBackgroundUploadQueue();
  }

  private drainBackgroundUploadQueue(): void {
    while (
      this.activeBackgroundUploads < BACKGROUND_UPLOAD_CONCURRENCY &&
      this.backgroundUploadQueue.length > 0
    ) {
      const nextTask = this.backgroundUploadQueue.shift();
      if (!nextTask) {
        return;
      }

      this.activeBackgroundUploads += 1;
      void nextTask()
        .catch((error) => {
          this.logger.error('Background attachment upload failed', error);
        })
        .finally(() => {
          this.activeBackgroundUploads = Math.max(0, this.activeBackgroundUploads - 1);
          this.drainBackgroundUploadQueue();
        });
    }
  }

  private async uploadPendingFile(
    pending: PendingFile,
    authToken: string
  ): Promise<AgentXAttachment | null> {
    return pending.isVideo
      ? this.uploadVideoFile(pending, authToken)
      : this.uploadNonVideoFile(pending, authToken);
  }

  private async uploadPendingVideoWithRetry(
    pending: PendingFile,
    authToken: string
  ): Promise<UploadedVideoResult> {
    const host = this.requireHost();
    const maxAttempts = pending.nativeUri ? NATIVE_VIDEO_UPLOAD_MAX_ATTEMPTS : 1;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        // Re-resolve threadId on every attempt: in a new session the threadId
        // is null when the first attempt starts (SSE hasn't returned the
        // server-assigned threadId yet), but it may be available by the time a
        // retry runs, giving the backend a proper storage path.
        const threadId = host.resolveActiveThreadId();
        return await new Promise<UploadedVideoResult>((resolve, reject) => {
          const uploadHandle = this.videoUploadService.uploadVideo(pending.file, authToken, {
            threadId,
            nativeUri: pending.nativeUri,
            nativeWebPath: pending.nativeWebPath,
            sizeBytes: pending.sizeBytes,
            nativeDurationSeconds: pending.durationSeconds,
            nativeSource: pending.nativeSource,
          });
          const subscription = uploadHandle.progress$.subscribe({
            next: (progress) => {
              if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
                this.setVideoUploadBatchEntry(
                  pending.id,
                  pending.file.name,
                  'uploading',
                  progress.percent
                );
              }
              if (progress.phase === 'complete' && progress.streamUrl) {
                this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'complete', 100);
                resolve({
                  url: progress.streamUrl,
                  storagePath: progress.storagePath,
                  cloudflareVideoId: progress.cloudflareVideoId,
                  cloudflareStatus: progress.cloudflareStatus,
                  readyToStream: progress.readyToStream,
                  thumbnailUrl: progress.thumbnailUrl,
                });
                subscription.unsubscribe();
              } else if (progress.phase === 'cancelled') {
                reject(new Error(VIDEO_UPLOAD_CANCELLED_MESSAGE));
                subscription.unsubscribe();
              } else if (progress.phase === 'error') {
                reject(new Error(progress.errorMessage ?? 'Video upload failed'));
                subscription.unsubscribe();
              }
            },
            error: (error) => {
              reject(error);
              subscription.unsubscribe();
            },
          });
        });
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts) {
          break;
        }

        this.logger.warn('Native video upload attempt failed; retrying full upload pipeline', {
          contextId: host.contextId(),
          fileName: pending.file.name,
          attempt,
          maxAttempts,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'uploading', 0);
        await new Promise((resolve) =>
          setTimeout(resolve, NATIVE_VIDEO_UPLOAD_RETRY_DELAY_MS * attempt)
        );
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Video upload failed');
  }

  private async uploadNonVideoFile(
    pending: PendingFile,
    authToken: string
  ): Promise<AgentXAttachment | null> {
    const host = this.requireHost();
    const uploadTimeoutMs = AGENT_X_RUNTIME_CONFIG.attachmentTransport.uploadTimeoutMs;
    const maxUploadAttempts = AGENT_X_RUNTIME_CONFIG.attachmentTransport.uploadMaxAttempts;
    const formData = new FormData();
    formData.append('file', pending.file);
    const threadId = host.resolveActiveThreadId();
    if (threadId) {
      formData.append('threadId', threadId);
    }

    for (let attempt = 1; attempt <= maxUploadAttempts; attempt += 1) {
      try {
        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), uploadTimeoutMs);

        const response = await fetch(`${this.baseUrl}${AGENT_X_ENDPOINTS.UPLOAD}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          body: formData,
          signal: abortController.signal,
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Upload failed');
          throw new Error(`HTTP ${response.status}: ${errorText || 'Unknown error'}`);
        }

        const result = (await response.json()) as {
          success: boolean;
          data?: {
            url: string;
            storagePath?: string;
            name: string;
            mimeType: string;
            sizeBytes: number;
          };
          error?: string;
        };

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Unknown backend error');
        }

        return {
          id: pending.id,
          url: result.data.url,
          ...(result.data.storagePath ? { storagePath: result.data.storagePath } : {}),
          name: result.data.name,
          mimeType: result.data.mimeType,
          type: resolveAttachmentType(result.data.mimeType),
          sizeBytes: result.data.sizeBytes,
        };
      } catch (error) {
        if (attempt === maxUploadAttempts) {
          this.logger.error('Background non-video upload failed after retries', error, {
            fileName: pending.file.name,
            contextId: host.contextId(),
          });
          return null;
        }
      }
    }

    return null;
  }

  private async uploadVideoFile(
    pending: PendingFile,
    authToken: string
  ): Promise<AgentXAttachment | null> {
    const host = this.requireHost();

    try {
      this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'uploading', 0);
      const result = await this.uploadPendingVideoWithRetry(pending, authToken);

      const persistedThumbnailUrl = resolvePersistedVideoThumbnailUrl(
        result.thumbnailUrl,
        pending.previewUrl
      );

      const attachment: AgentXAttachment = {
        id: pending.id,
        url: result.url,
        ...(result.storagePath ? { storagePath: result.storagePath } : {}),
        ...(result.cloudflareVideoId ? { cloudflareVideoId: result.cloudflareVideoId } : {}),
        ...(result.cloudflareStatus ? { cloudflareStatus: result.cloudflareStatus } : {}),
        ...(result.readyToStream !== undefined ? { readyToStream: result.readyToStream } : {}),
        ...(persistedThumbnailUrl ? { thumbnailUrl: persistedThumbnailUrl } : {}),
        name: pending.file.name,
        mimeType: pending.file.type,
        type: 'video',
        sizeBytes: pending.sizeBytes ?? pending.file.size,
      };
      return attachment;
    } catch (error) {
      this.setVideoUploadBatchEntry(pending.id, pending.file.name, 'failed', 100);
      this.logger.error('Background video upload failed', error, {
        contextId: host.contextId(),
        fileName: pending.file.name,
      });
      return null;
    }
  }

  private async syncAttachmentToPersistedMessage(
    idempotencyKey: string,
    attachment: AgentXAttachment,
    authToken: string
  ): Promise<void> {
    // The backend always returns HTTP 200 on success:
    //   • { queued: false } → attachment was applied directly to the message
    //   • { queued: true  } → message not found yet; written to durable outbox
    //                         and will be reconciled on next thread load
    // We only retry on transient network/5xx errors (max 2 attempts).
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(
          `${this.baseUrl}${AGENT_X_ENDPOINTS.MESSAGE_ATTACHMENT_SYNC}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ idempotencyKey, attachment }),
          }
        );

        if (response.ok) {
          return; // Server guarantees eventual persistence (sync or outbox)
        }

        if (attempt === 2) {
          const errorText = await response.text().catch(() => 'Attachment sync failed');
          throw new Error(`HTTP ${response.status}: ${errorText || 'Unknown error'}`);
        }
      } catch (error) {
        if (attempt === 2) {
          this.logger.warn(
            'Background attachment sync could not reach server; outbox reconciles on next load if server received the upload',
            {
              idempotencyKey,
              attachmentId: attachment.id,
              fileName: attachment.name,
              error: error instanceof Error ? error.message : String(error),
            }
          );
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, MESSAGE_ATTACHMENT_SYNC_RETRY_MS));
    }
  }

  private discardPendingUpload(pendingId: string): void {
    const record = this.backgroundUploads.get(pendingId);
    if (!record) {
      this.removeVideoUploadBatchEntry(pendingId);
      return;
    }
    record.removed = true;
    this.backgroundUploads.delete(pendingId);
    this.removeVideoUploadBatchEntry(pendingId);
  }

  getFileColor(filename: string, alpha: number): string {
    const ext = this.getFileExt(filename).toLowerCase();
    const colors: Record<string, string> = {
      pdf: '239, 68, 68',
      doc: '59, 130, 246',
      docx: '59, 130, 246',
      xls: '34, 197, 94',
      xlsx: '34, 197, 94',
      ppt: '249, 115, 22',
      pptx: '249, 115, 22',
      txt: '148, 163, 184',
      csv: '34, 197, 94',
      zip: '168, 85, 247',
      rar: '168, 85, 247',
    };
    const rgb = colors[ext] ?? '148, 163, 184';
    return `rgba(${rgb}, ${alpha})`;
  }

  getFileExt(filename: string): string {
    const dotIndex = filename.lastIndexOf('.');
    if (dotIndex < 0) return 'FILE';
    return filename.slice(dotIndex + 1).toUpperCase();
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private addPendingConnectedSource(source: ConnectedAppSource): void {
    this.pendingConnectedSources.update((current) => {
      const exists = current.some(
        (item) => item.platform === source.platform && item.profileUrl === source.profileUrl
      );
      return exists ? current : [...current, source];
    });
  }

  private async openConnectedAccountsModal(): Promise<void> {
    const host = this.requireHost();
    const user = host.user();
    const role = (user?.role as OnboardingUserType) ?? null;
    const { ConnectedAccountsModalService } = await import('../../../components/connected-sources');
    const service = runInInjectionContext(this.injector, () =>
      inject(ConnectedAccountsModalService)
    );
    const result = await service.open({
      role,
      selectedSports: user?.selectedSports ?? [],
      linkSourcesData: buildLinkSourcesFormData({
        connectedSources: user?.connectedSources ?? [],
        connectedEmails: user?.connectedEmails ?? [],
        firebaseProviders: user?.firebaseProviders ?? [],
      }) as LinkSourcesFormData | null,
      scope: role === 'coach' || role === 'director' ? 'team' : 'athlete',
    });

    if (result.linkSources) {
      host.emitConnectedAccountsSave({
        linkSources: result.linkSources,
        requestResync: result.resync === true,
        resyncSources: result.sources ?? [],
      });
    }
  }

  private isDesktopAttachmentMenuMode(): boolean {
    return (
      this.requireHost().embedded() &&
      isPlatformBrowser(this.platformId) &&
      window.innerWidth >= 768
    );
  }

  private requireHost(): AgentXOperationChatAttachmentsFacadeHost {
    if (!this.host) {
      throw new Error('AgentXOperationChatAttachmentsFacade used before configure()');
    }

    return this.host;
  }
}

function unwrapSelectedFile(selectedFile: AttachmentSelectedFile): File {
  return isWrappedNativeAttachment(selectedFile) ? selectedFile.file : selectedFile;
}

function getNativeAttachmentMetadata(
  selectedFile: AttachmentSelectedFile
): Pick<
  NativeAttachmentFile,
  | 'nativeUri'
  | 'nativeWebPath'
  | 'nativeSizeBytes'
  | 'nativeDurationSeconds'
  | 'nativeSource'
  | 'thumbnailDataUrl'
> {
  const source = (
    isWrappedNativeAttachment(selectedFile) ? selectedFile.file : selectedFile
  ) as NativeAttachmentFile;
  return {
    ...(source.nativeUri ? { nativeUri: source.nativeUri } : {}),
    ...(source.nativeWebPath ? { nativeWebPath: source.nativeWebPath } : {}),
    ...(source.nativeSizeBytes ? { nativeSizeBytes: source.nativeSizeBytes } : {}),
    ...(source.nativeDurationSeconds
      ? { nativeDurationSeconds: source.nativeDurationSeconds }
      : {}),
    ...(source.nativeSource ? { nativeSource: source.nativeSource } : {}),
    ...(source.thumbnailDataUrl ? { thumbnailDataUrl: source.thumbnailDataUrl } : {}),
  };
}

function isWrappedNativeAttachment(
  value: AttachmentSelectedFile
): value is NativeAttachmentFile & { readonly file: File } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'file' in value &&
    (value as { readonly file?: unknown }).file instanceof File
  );
}

function normalizeAttachmentFile(
  file: File,
  metadata: Pick<
    NativeAttachmentFile,
    | 'nativeUri'
    | 'nativeWebPath'
    | 'nativeSizeBytes'
    | 'nativeDurationSeconds'
    | 'nativeSource'
    | 'thumbnailDataUrl'
  >
): File {
  const normalizedType = normalizeAttachmentMimeType(file.type);
  if (!normalizedType || normalizedType === file.type) {
    return file;
  }

  return Object.assign(
    new File([file], file.name, { type: normalizedType, lastModified: file.lastModified }),
    {
      ...(metadata.nativeUri ? { nativeUri: metadata.nativeUri } : {}),
      ...(metadata.nativeWebPath ? { nativeWebPath: metadata.nativeWebPath } : {}),
      ...(metadata.nativeSizeBytes ? { nativeSizeBytes: metadata.nativeSizeBytes } : {}),
      ...(metadata.nativeDurationSeconds
        ? { nativeDurationSeconds: metadata.nativeDurationSeconds }
        : {}),
      ...(metadata.nativeSource ? { nativeSource: metadata.nativeSource } : {}),
      ...(metadata.thumbnailDataUrl ? { thumbnailDataUrl: metadata.thumbnailDataUrl } : {}),
    }
  );
}

function resolveAttachmentFileSize(file: File): number {
  const nativeSizeBytes = (file as NativeAttachmentFile).nativeSizeBytes;
  return typeof nativeSizeBytes === 'number' && nativeSizeBytes > 0 ? nativeSizeBytes : file.size;
}

function normalizeAttachmentMimeType(mimeType: string): string | null {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase();
  if (!normalized) return null;
  if (
    normalized === 'video/mov' ||
    normalized === 'video/qt' ||
    normalized === 'video/x-quicktime'
  ) {
    return 'video/quicktime';
  }
  if (normalized === 'image/jpg') {
    return 'image/jpeg';
  }
  return normalized;
}
