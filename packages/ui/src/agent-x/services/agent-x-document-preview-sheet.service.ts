/**
 * @fileoverview Opens Agent X deliverables in a mobile document preview bottom sheet.
 * @module @nxt1/ui/agent-x
 *
 * Native apps and phone-width browsers preview chat deliverables (PDF, Word, spreadsheet,
 * presentation) in a sheet stacked over the operation chat; desktop keeps the Files panel.
 *
 * The sheet is presented with ModalController directly — NxtBottomSheetService.openSheet()
 * dismisses the active sheet first, which would close the chat underneath.
 */

import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular/standalone';
import { NxtBrowserService } from '../../services/browser/browser.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtPlatformService } from '../../services/platform/platform.service';
import { AgentXDocumentPreviewSheetComponent } from '../components/shared/agent-x-document-preview-sheet.component';
import {
  isDocumentPreviewableFile,
  isPdfDocumentFile,
  openDeliverableFallback,
} from '../utils/document-file.utils';
import { AgentXFilesService, type AgentXLibraryFile } from './agent-x-files.service';

/** Matches the media viewer's mobile breakpoint (`NxtMediaViewerService.shouldUseOverlay`). */
const MOBILE_SHEET_MAX_WIDTH = 768;

export const AGENT_X_DOCUMENT_PREVIEW_SHEET_CSS_CLASS = 'agent-x-document-preview-sheet';

@Injectable({ providedIn: 'root' })
export class AgentXDocumentPreviewSheetService {
  private readonly modalCtrl = inject(ModalController);
  private readonly filesService = inject(AgentXFilesService);
  private readonly platform = inject(NxtPlatformService);
  private readonly browser = inject(NxtBrowserService);
  private readonly logger = inject(NxtLoggingService).child('AgentXDocumentPreviewSheet');

  private requestSeq = 0;
  private activeModal: HTMLIonModalElement | null = null;

  /** True when deliverables should open in the bottom sheet instead of the desktop Files panel. */
  shouldUseSheet(): boolean {
    return this.platform.isNative() || this.platform.viewport().width < MOBILE_SHEET_MAX_WIDTH;
  }

  /**
   * Opens the sheet right away (loading state) and resolves the chat deliverable URL to its Files
   * record in parallel — on mobile the Files library is often not loaded yet, so the lookup can
   * take a moment. Files that cannot be previewed (or are not indexed yet) close the sheet and
   * fall back to a download / in-app browser open.
   */
  async open(url: string): Promise<void> {
    // Rapid taps: only the most recent request may present a sheet or fall back.
    const requestSeq = ++this.requestSeq;
    const fileRequest = this.resolvePreviewFile(url);
    // Rejections are handled below; this keeps a failed present() from leaving one unhandled.
    fileRequest.catch(() => undefined);

    let modal: HTMLIonModalElement | null;
    try {
      modal = await this.present(
        { fileRequest, pendingName: deliverableNameFromUrl(url) },
        requestSeq
      );
    } catch (error) {
      this.logger.warn('Document preview sheet failed to open; falling back', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (requestSeq === this.requestSeq) openDeliverableFallback(url, this.browser);
      return;
    }
    if (!modal) return;

    try {
      await fileRequest;
    } catch (error) {
      // Superseded by a newer tap, or the user already closed the sheet: nothing to do.
      if (requestSeq !== this.requestSeq || this.activeModal !== modal) return;
      // Signed download URLs contain credentials; never include them in logs.
      this.logger.warn('Deliverable not previewable; falling back', {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.dismiss();
      openDeliverableFallback(url, this.browser);
    }
  }

  /** Dismisses the preview sheet if one is open. */
  async dismiss(): Promise<void> {
    const modal = this.activeModal;
    this.activeModal = null;
    if (modal) {
      await modal.dismiss(undefined, 'replace').catch(() => undefined);
    }
  }

  /** Resolves the Files record to preview; rejects when the file has no inline preview. */
  private async resolvePreviewFile(url: string): Promise<AgentXLibraryFile> {
    const file = await this.filesService.resolveDeliverable(url);
    if (!isDocumentPreviewableFile(file)) {
      throw new Error('This file type has no inline preview');
    }
    if (!isPdfDocumentFile(file)) return file;

    try {
      return await this.filesService.refreshFile(file.id, file.teamId?.trim() || null, {
        disposition: 'inline',
      });
    } catch {
      // The preview session re-signs an inline URL server-side; the cached record still works.
      return file;
    }
  }

  /** Presents the sheet; returns null when a newer request superseded this one. */
  private async present(
    props: { readonly fileRequest: Promise<AgentXLibraryFile>; readonly pendingName: string },
    requestSeq: number
  ): Promise<HTMLIonModalElement | null> {
    await this.dismiss();
    if (requestSeq !== this.requestSeq) return null;

    const modal = await this.modalCtrl.create({
      component: AgentXDocumentPreviewSheetComponent,
      componentProps: props,
      // Full height, like the operation chat sheet (Ionic keeps it below the status bar).
      breakpoints: [0, 1],
      initialBreakpoint: 1,
      expandToScroll: false,
      handle: true,
      handleBehavior: 'none',
      showBackdrop: true,
      backdropBreakpoint: 0,
      backdropDismiss: true,
      canDismiss: true,
      cssClass: [
        'nxt1-sheet-modal',
        this.platform.isIOS() ? 'nxt1-sheet-modal--ios' : 'nxt1-sheet-modal--android',
        AGENT_X_DOCUMENT_PREVIEW_SHEET_CSS_CLASS,
      ],
    });
    // A newer tap arrived while the modal was being created; drop the never-presented overlay.
    if (requestSeq !== this.requestSeq) {
      modal.remove();
      return null;
    }

    this.activeModal = modal;
    void modal.onWillDismiss().then(() => {
      if (this.activeModal === modal) this.activeModal = null;
    });
    await modal.present();
    return modal;
  }
}

/** Best-effort file name from a deliverable link, shown while the Files record loads. */
export function deliverableNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.searchParams.get('path') ?? parsed.pathname;
    const segment =
      path
        .split(/\/|%2F/i)
        .filter(Boolean)
        .pop() ?? '';
    const name = decodeURIComponent(segment).trim();
    return /\.[A-Za-z0-9]{2,5}$/.test(name) ? name : '';
  } catch {
    return '';
  }
}
