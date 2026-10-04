/**
 * @fileoverview Agent X Document Preview Sheet
 * @module @nxt1/ui/agent-x
 *
 * Bottom-sheet body for previewing an Agent X deliverable (PDF, Word, spreadsheet,
 * presentation) on mobile. Opened by `AgentXDocumentPreviewSheetService` as a modal stacked
 * over the operation chat; desktop uses the Files panel instead.
 *
 * The sheet opens immediately on tap: while the deliverable is still being resolved to its Files
 * record (`fileRequest`), it shows a loading state titled with `pendingName`.
 */

import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Input,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NxtSheetHeaderComponent } from '../../../components/bottom-sheet/sheet-header.component';
import { NxtDocumentViewerComponent } from '../../../components/document-viewer/document-viewer.component';
import { NxtBrowserService } from '../../../services/browser/browser.service';
import { NxtFileSaveService } from '../../../services/file-save/file-save.service';
import { HapticsService } from '../../../services/haptics/haptics.service';
import { NxtLoggingService } from '../../../services/logging/logging.service';
import { NxtToastService } from '../../../services/toast/toast.service';
import { AgentXFilesService, type AgentXLibraryFile } from '../../services/agent-x-files.service';
import { resolveDownloadFileName } from '../../utils/document-file.utils';

export const AGENT_X_DOCUMENT_PREVIEW_SHEET_TEST_IDS = {
  ROOT: 'agent-x-document-preview-sheet',
  CLOSE_BTN: 'agent-x-document-preview-sheet-close',
  LOADING: 'agent-x-document-preview-sheet-loading',
} as const;

@Component({
  selector: 'nxt1-agent-x-document-preview-sheet',
  standalone: true,
  imports: [NxtSheetHeaderComponent, NxtDocumentViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-testid]': 'testIds.ROOT' },
  template: `
    <nxt1-sheet-header
      [title]="title()"
      closePosition="right"
      [centerTitle]="true"
      [closeTestId]="testIds.CLOSE_BTN"
    />

    <div class="doc-sheet__body">
      @if (resolvedFile(); as file) {
        <nxt1-document-viewer
          [file]="file"
          [compact]="true"
          [editable]="false"
          [showAskAgent]="false"
          [toolbarDownload]="true"
          [downloadBusy]="downloading()"
          (downloadRequested)="download()"
          (openOriginalRequested)="openOriginal()"
        />
      } @else {
        <div
          class="doc-sheet__loading"
          role="status"
          aria-live="polite"
          [attr.data-testid]="testIds.LOADING"
        >
          <span class="doc-sheet__spinner" aria-hidden="true"></span>
          <span class="doc-sheet__loading-text">Opening document...</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }

      .doc-sheet__body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }

      .doc-sheet__body > nxt1-document-viewer {
        flex: 1;
        min-height: 0;
      }

      .doc-sheet__loading {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
      }

      .doc-sheet__spinner {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(255, 255, 255, 0.12);
        border-top-color: var(--agent-primary, var(--nxt1-color-primary, #ccff00));
        border-radius: 50%;
        animation: docSheetSpin 0.7s linear infinite;
      }

      .doc-sheet__loading-text {
        font-size: 13px;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
      }

      @keyframes docSheetSpin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class AgentXDocumentPreviewSheetComponent {
  // Inputs use @Input() setters (not signal inputs or ngOnChanges): Ionic assigns componentProps
  // directly on the instance, which never triggers ngOnChanges.

  /** A file that is already resolved. */
  @Input() set file(value: AgentXLibraryFile | null | undefined) {
    this.resolvedFile.set(value ?? null);
  }

  /**
   * Pending Files lookup for the tapped deliverable. The sheet shows a loading state until it
   * resolves; on rejection the opener dismisses the sheet and falls back, so it is ignored here.
   */
  @Input() set fileRequest(request: Promise<AgentXLibraryFile> | null | undefined) {
    const requestId = ++this.fileRequestId;
    if (!request) return;
    request.then(
      (file) => {
        if (requestId === this.fileRequestId) this.resolvedFile.set(file);
      },
      () => undefined
    );
  }

  /** Header title while the file is still loading (e.g. the name parsed from the link). */
  @Input() set pendingName(value: string | null | undefined) {
    this.pendingNameValue.set(value?.trim() ?? '');
  }

  protected readonly testIds = AGENT_X_DOCUMENT_PREVIEW_SHEET_TEST_IDS;
  protected readonly downloading = signal(false);
  protected readonly resolvedFile = signal<AgentXLibraryFile | null>(null);
  private readonly pendingNameValue = signal('');
  protected readonly title = computed(
    () => this.resolvedFile()?.name || this.pendingNameValue() || 'Document'
  );

  private fileRequestId = 0;

  private readonly filesService = inject(AgentXFilesService);
  private readonly fileSave = inject(NxtFileSaveService);
  private readonly browser = inject(NxtBrowserService);
  private readonly toast = inject(NxtToastService);
  private readonly haptics = inject(HapticsService);
  private readonly logger = inject(NxtLoggingService).child('AgentXDocumentPreviewSheet');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      // Ionic's sheet drag gesture listens on the modal wrapper (bubble phase) and starts from
      // any non-ion-content target, which would hijack PDF / grid scrolling. Keep content touches
      // inside the body so only the handle and header drag-to-dismiss.
      const el = this.host.nativeElement.querySelector<HTMLElement>('.doc-sheet__body');
      if (!el) return;
      const stop = (event: Event): void => event.stopPropagation();
      el.addEventListener('touchstart', stop, { passive: true });
      el.addEventListener('mousedown', stop);
      destroyRef.onDestroy(() => {
        el.removeEventListener('touchstart', stop);
        el.removeEventListener('mousedown', stop);
      });
    });
  }

  protected async download(): Promise<void> {
    const file = this.resolvedFile();
    if (!file || this.downloading()) return;
    void this.haptics.impact('light');

    // Streamed files (no stored binary) cannot use the /download route; hand off the URL.
    if (!file.storagePath) {
      this.openOriginal();
      return;
    }

    this.downloading.set(true);
    try {
      const blob = await this.filesService.downloadFileContent(file.id);
      if (blob.size === 0) {
        throw new Error('Downloaded file is empty');
      }
      const outcome = await this.fileSave.saveBlob(blob, resolveDownloadFileName(file), {
        title: file.name,
        dialogTitle: 'Save or share file',
      });
      if (outcome === 'downloaded') {
        this.toast.success('Download started');
      }
    } catch (error) {
      // Never log the file URL: signed links carry credentials.
      this.logger.warn('Document download failed', {
        fileId: file.id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.toast.error('Failed to download file');
    } finally {
      this.downloading.set(false);
    }
  }

  protected openOriginal(): void {
    const url = this.resolvedFile()?.url;
    if (!url) return;
    void this.browser.openLink({
      url,
      source: 'agent_x_document_sheet',
      surface: 'message',
    });
  }
}
