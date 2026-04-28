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
import { isPlatformBrowser } from '@angular/common';
import {
  AGENT_X_ALLOWED_MIME_TYPES,
  AGENT_X_ENDPOINTS,
  AGENT_X_MAX_ATTACHMENTS,
  AGENT_X_MAX_FILE_SIZE,
  AGENT_X_MAX_VIDEO_FILE_SIZE,
  resolveAttachmentType,
  type AgentXAttachment,
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
import { AGENT_X_API_BASE_URL } from '../../services/agent-x-job.service';
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
  clickDesktopAttachmentInput(): void;
  emitConnectedAccountsSave(request: AgentXConnectedAccountsSaveRequest): void;
  uid(): string;
}

@Injectable()
export class AgentXOperationChatAttachmentsFacade {
  private readonly baseUrl = inject(AGENT_X_API_BASE_URL);
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

  configure(host: AgentXOperationChatAttachmentsFacadeHost): void {
    this.host = host;
  }

  removePendingFile(index: number): void {
    this.pendingFiles.update((previous) => {
      const removed = previous[index];
      if (removed?.previewUrl) {
        URL.revokeObjectURL(removed.previewUrl);
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
    const uploadTimeoutMs = 20_000;
    const maxUploadAttempts = 2;

    const uploaded: AgentXAttachment[] = [];
    const failed: string[] = [];

    const videoFiles = files.filter((file) => file.isVideo);
    const nonVideoFiles = files.filter((file) => !file.isVideo);

    for (const pending of nonVideoFiles) {
      const formData = new FormData();
      formData.append('file', pending.file);
      const threadId = host.resolvedThreadId();
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
            id: host.uid(),
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
        const videoResult = await new Promise<{ streamUrl: string; cloudflareVideoId: string }>(
          (resolve, reject) => {
            this.videoUploadService.uploadVideo(pending.file, authToken).subscribe({
              next: (progress) => {
                if (progress.phase === 'uploading' || progress.phase === 'provisioning') {
                  host.videoUploadPercent.set(progress.percent);
                }
                if (
                  progress.phase === 'complete' &&
                  progress.streamUrl &&
                  progress.cloudflareVideoId
                ) {
                  host.videoUploadPercent.set(100);
                  resolve({
                    streamUrl: progress.streamUrl,
                    cloudflareVideoId: progress.cloudflareVideoId,
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
          id: host.uid(),
          url: videoResult.streamUrl,
          name: pending.file.name,
          mimeType: pending.file.type,
          type: 'video',
          sizeBytes: pending.file.size,
          cloudflareVideoId: videoResult.cloudflareVideoId,
        });
      } catch (error) {
        host.videoUploadPercent.set(null);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error('Video Cloudflare upload failed', error, {
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

  clearPendingFiles(): void {
    for (const pending of this.pendingFiles()) {
      if (pending.previewUrl) {
        URL.revokeObjectURL(pending.previewUrl);
      }
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
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : null,
        isImage,
        isVideo,
      });
    }

    if (nextPending.length > 0) {
      this.pendingFiles.update((previous) => [...previous, ...nextPending]);
    }

    return nextPending.length;
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
