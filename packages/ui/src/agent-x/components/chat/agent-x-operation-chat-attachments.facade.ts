import {
  EnvironmentInjector,
  Injectable,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
  type WritableSignal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_ENDPOINTS,
  AGENT_X_MAX_ATTACHMENTS,
  AGENT_X_MAX_FILE_SIZE,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  AGENT_X_RUNTIME_CONFIG,
  resolveAttachmentType,
  type AgentXAttachment,
  type AgentXAttachmentStub,
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
import { AgentXVideoUploadService } from '../../services/agent-x-video-upload.service';
import {
  AGENT_X_API_BASE_URL,
  AGENT_X_AUTH_TOKEN_FACTORY,
} from '../../services/agent-x-job.service';
import { AgentXService } from '../../services/agent-x.service';
import {
  AgentXAttachmentsSheetComponent,
  type ConnectedAppSource,
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
  readonly user: () => AgentXUser | null;
  resolveActiveThreadId(): string | null;
  clickDesktopAttachmentInput(): void;
  emitConnectedAccountsSave(request: AgentXConnectedAccountsSaveRequest): void;
  uid(): string;
}

type BackgroundUploadStatus = 'queued' | 'uploading' | 'complete' | 'failed';

interface BackgroundUploadRecord {
  readonly pendingId: string;
  readonly resultPromise: Promise<AgentXAttachment | null>;
  readonly resolveResult: (attachment: AgentXAttachment | null) => void;
  started: boolean;
  status: BackgroundUploadStatus;
  attachment: AgentXAttachment | null;
  removed: boolean;
}

const BACKGROUND_UPLOAD_CONCURRENCY = 3;
const MESSAGE_ATTACHMENT_SYNC_RETRY_MS =
  AGENT_X_RUNTIME_CONFIG.attachmentTransport.messageSyncRetryMs;
const PRE_SEND_BACKGROUND_UPLOAD_WAIT_MS =
  AGENT_X_RUNTIME_CONFIG.attachmentTransport.preSendBackgroundUploadWaitMs;

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

  readonly pendingFiles = signal<PendingFile[]>([]);
  readonly pendingConnectedSources = signal<ConnectedAppSource[]>([]);
  readonly isDragActive = signal(false);
  readonly showDesktopAttachmentMenu = signal(false);
  readonly desktopAttachmentSources = computed(() =>
    this.agentXService.attachmentConnectedSources()
  );

  private host: AgentXOperationChatAttachmentsFacadeHost | null = null;
  private readonly backgroundUploads = new Map<string, BackgroundUploadRecord>();
  private readonly backgroundUploadQueue: Array<() => Promise<void>> = [];
  private activeBackgroundUploads = 0;

  configure(host: AgentXOperationChatAttachmentsFacadeHost): void {
    this.host = host;
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
    const result = await modal.onWillDismiss<File[] | ConnectedAppSource>();

    if (result.data && result.role === 'files-selected') {
      this.stageFiles(result.data as File[]);
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
      try {
        host.videoUploadPercent.set(0);
        const threadId = host.resolveActiveThreadId();
        const videoResult = await new Promise<{ url: string; storagePath?: string }>(
          (resolve, reject) => {
            this.videoUploadService.uploadVideo(pending.file, authToken, { threadId }).subscribe({
              next: (progress) => {
                if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
                  host.videoUploadPercent.set(progress.percent);
                }
                if (progress.phase === 'complete' && progress.streamUrl) {
                  host.videoUploadPercent.set(100);
                  resolve({
                    url: progress.streamUrl,
                    storagePath: progress.storagePath,
                  });
                } else if (progress.phase === 'error') {
                  reject(new Error(progress.errorMessage ?? 'Video upload failed'));
                }
              },
              error: (error) => reject(error),
            });
          }
        );
        host.videoUploadPercent.set(null);

        uploaded.push({
          id: pending.id,
          url: videoResult.url,
          ...(videoResult.storagePath ? { storagePath: videoResult.storagePath } : {}),
          name: pending.file.name,
          mimeType: pending.file.type,
          type: 'video',
          sizeBytes: pending.file.size,
        });
      } catch (error) {
        host.videoUploadPercent.set(null);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Video upload failed', error, {
          contextId: host.contextId(),
          fileName: pending.file.name,
          fileSize: pending.file.size,
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

    // Wait briefly for in-flight background uploads so the initial chat request
    // carries attachment URLs whenever they are ready at send time.
    const pendingRecords = records.filter(
      (record) => !record.attachment && record.status !== 'failed'
    );
    if (pendingRecords.length > 0) {
      await Promise.all(
        pendingRecords.map((record) =>
          this.waitForBackgroundUpload(record, PRE_SEND_BACKGROUND_UPLOAD_WAIT_MS)
        )
      );
    }

    const readyAttachments = files
      .map((pending) => this.backgroundUploads.get(pending.id)?.attachment ?? null)
      .filter((attachment): attachment is AgentXAttachment => attachment !== null);

    // Last-chance guarantee: if any attachment is still missing (queued/uploading/failed),
    // retry those files synchronously in the send path so the chat request does not lose media context.
    const readyIds = new Set(readyAttachments.map((attachment) => attachment.id));
    const missingFiles = files.filter((pending) => !readyIds.has(pending.id));
    if (missingFiles.length === 0) {
      return readyAttachments;
    }

    const host = this.requireHost();
    this.logger.warn('Pre-send attachment fallback activated for missing uploads', {
      contextId: host.contextId(),
      totalFiles: files.length,
      readyCount: readyAttachments.length,
      missingCount: missingFiles.length,
      missingNames: missingFiles.map((file) => file.file.name),
    });

    const fallbackAttachments = await this.uploadFiles(missingFiles, authToken);
    return [...readyAttachments, ...fallbackAttachments];
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
        presentation: 'overlay',
      })
      .finally(() => viewer.cleanup());
  }

  openAttachmentViewer(attachments: readonly MessageAttachment[], index: number): void {
    const mediaItems: MediaViewerItem[] = attachments.map((attachment) => {
      if (attachment.type === 'image' || attachment.type === 'video') {
        return {
          url: attachment.url,
          type: attachment.type,
          alt: attachment.name,
        };
      }
      return {
        url: attachment.url,
        type: 'doc',
        name: attachment.name,
      };
    });

    if (!mediaItems.length) return;

    this.mediaViewer.open({
      items: mediaItems,
      initialIndex: Math.max(0, Math.min(index, mediaItems.length - 1)),
      source: 'agent-x-chat',
    });
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

  clearPendingFiles(): void {
    for (const pending of this.pendingFiles()) {
      if (pending.previewUrl) {
        URL.revokeObjectURL(pending.previewUrl);
      }
      this.discardPendingUpload(pending.id);
    }
    this.pendingFiles.set([]);
  }

  stageFiles(files: readonly File[]): number {
    const host = this.requireHost();
    if (files.length === 0) return 0;

    const currentCount = this.pendingFiles().length;
    const nextPending: PendingFile[] = [];

    for (const file of files) {
      if (currentCount + nextPending.length >= AGENT_X_MAX_ATTACHMENTS) {
        this.toast.error(`Maximum ${AGENT_X_MAX_ATTACHMENTS} attachments allowed`);
        this.logger.warn('Rejected file because attachment limit was reached', {
          contextId: host.contextId(),
          fileName: file.name,
        });
        break;
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

      const maxFileSize = file.type.startsWith('video/')
        ? AGENT_X_MAX_VIDEO_FILE_SIZE
        : AGENT_X_MAX_FILE_SIZE;
      if (file.size > maxFileSize) {
        const maxMb = Math.round(maxFileSize / (1024 * 1024));
        this.toast.error(`${file.name} exceeds the ${maxMb}MB limit`);
        this.logger.warn('Rejected oversized operation chat file', {
          contextId: host.contextId(),
          fileName: file.name,
          sizeBytes: file.size,
          maxSizeBytes: maxFileSize,
        });
        continue;
      }

      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      nextPending.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: isImage || isVideo ? URL.createObjectURL(file) : null,
        isImage,
        isVideo,
      });
    }

    if (nextPending.length > 0) {
      this.pendingFiles.update((previous) => [...previous, ...nextPending]);
      void this.primePendingUploads(nextPending);
    }

    return nextPending.length;
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
          sizeBytes: pending.file.size,
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
   */
  async awaitPendingUploads(
    files: readonly PendingFile[],
    _authToken: string,
    timeoutMs: number
  ): Promise<AgentXAttachment[]> {
    // Only process files that have an active upload record in backgroundUploads.
    // Files whose records are missing were either:
    //   - ready attachments already included in the original chat request, or
    //   - already cleaned up by a prior awaitPendingUploads call.
    // Calling ensureBackgroundUpload for missing records would start a redundant
    // second upload, so we deliberately skip them here.
    const activeEntries: Array<{ pending: PendingFile; record: BackgroundUploadRecord }> = [];
    for (const pending of files) {
      const record = this.backgroundUploads.get(pending.id);
      if (record) {
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

  private async uploadNonVideoFile(
    pending: PendingFile,
    authToken: string
  ): Promise<AgentXAttachment | null> {
    const host = this.requireHost();
    const uploadTimeoutMs = AGENT_X_RUNTIME_CONFIG.attachmentTransport.uploadTimeoutMs;
    const maxUploadAttempts = AGENT_X_RUNTIME_CONFIG.attachmentTransport.uploadMaxAttempts;
    const formData = new FormData();
    formData.append('file', pending.file);
    const threadId = await this.waitForThreadId(
      AGENT_X_RUNTIME_CONFIG.attachmentTransport.threadIdResolveWaitMs
    );
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
    const threadId = await this.waitForThreadId(
      AGENT_X_RUNTIME_CONFIG.attachmentTransport.threadIdResolveWaitMs
    );

    try {
      const result = await new Promise<{ streamUrl: string; storagePath?: string }>(
        (resolve, reject) => {
          this.videoUploadService.uploadVideo(pending.file, authToken, { threadId }).subscribe({
            next: (progress) => {
              if (progress.phase === 'complete' && progress.streamUrl) {
                resolve({
                  streamUrl: progress.streamUrl,
                  storagePath: progress.storagePath,
                });
              } else if (progress.phase === 'error') {
                reject(new Error(progress.errorMessage ?? 'Video upload failed'));
              }
            },
            error: (error) => reject(error),
          });
        }
      );

      return {
        id: pending.id,
        url: result.streamUrl,
        ...(result.storagePath ? { storagePath: result.storagePath } : {}),
        name: pending.file.name,
        mimeType: pending.file.type,
        type: 'video',
        sizeBytes: pending.file.size,
      };
    } catch (error) {
      this.logger.error('Background video upload failed', error, {
        contextId: host.contextId(),
        fileName: pending.file.name,
      });
      return null;
    }
  }

  /**
   * Waits for the SSE `onThread` event to resolve the threadId for the current
   * chat session, up to `timeoutMs`. Returns immediately if the threadId is
   * already known (existing thread or already-fired onThread). Falls back to
   * null on timeout — uploads then land in the unbound path as before.
   */
  private waitForThreadId(timeoutMs: number): Promise<string | null> {
    const host = this.requireHost();
    const immediate = host.resolveActiveThreadId();
    if (immediate) return Promise.resolve(immediate);

    return new Promise<string | null>((resolve) => {
      let settled = false;
      let effectRef: ReturnType<typeof effect> | null = null;

      const settle = (id: string | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadlineId);
        effectRef?.destroy();
        resolve(id);
      };

      const deadlineId = setTimeout(() => settle(null), timeoutMs);

      effectRef = runInInjectionContext(this.injector, () =>
        effect(() => {
          // Reading resolvedThreadId() here registers it as a signal dependency.
          // The effect re-runs the moment onThread sets the signal, resolving
          // the promise with the correct threadId before any upload fires.
          const id = host.resolveActiveThreadId();
          if (id) settle(id);
        })
      );
    });
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
      return;
    }
    record.removed = true;
    this.backgroundUploads.delete(pendingId);
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
