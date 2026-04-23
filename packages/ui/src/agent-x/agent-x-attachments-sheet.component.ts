/**
 * @fileoverview Agent X Attachments Bottom Sheet
 * @module @nxt1/ui/agent-x
 * @version 1.0.0
 *
 * Modal sheet for selecting attachment sources:
 * - File upload (photos, videos, documents)
 * - Connected app sources (Instagram, TikTok, YouTube, etc. with favicon icons)
 *
 * Shared between web and mobile, rendered as bottom sheet on mobile.
 */

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalController } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../components/icon/icon.component';
import { HapticsService } from '../services/haptics/haptics.service';

/**
 * Connected app source with platform identifier and profile URL for favicon.
 */
export interface ConnectedAppSource {
  readonly platform: string;
  readonly profileUrl: string;
  readonly scopeType?: 'global' | 'sport' | 'team';
  readonly scopeId?: string;
}

/**
 * Result from attachment sheet selection.
 */
export interface AttachmentSheetResult {
  readonly type: 'file' | 'app-source';
  readonly source?: ConnectedAppSource;
}

@Component({
  selector: 'nxt1-agent-x-attachments-sheet',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <div class="attachments-sheet">
      <!-- Header -->
      <div class="sheet-header">
        <h2 class="sheet-title">Add Attachment</h2>
        <button type="button" class="sheet-close" (click)="onClose()" aria-label="Close">
          <nxt1-icon name="close" [size]="24" />
        </button>
      </div>

      <!-- Content -->
      <div class="sheet-content">
        <!-- File Upload Section -->
        <section class="attachment-section">
          <h3 class="section-label">Upload</h3>
          <button type="button" class="attachment-option" (click)="onSelectFile()">
            <div class="option-icon-wrapper">
              <nxt1-icon name="documentAdd" [size]="28" />
            </div>
            <div class="option-info">
              <span class="option-title">Upload File</span>
              <span class="option-subtitle">Photo, video, or document</span>
            </div>
            <nxt1-icon name="chevronRight" [size]="20" className="option-arrow" />
          </button>
          <input
            #fileInput
            type="file"
            hidden
            multiple
            accept="image/*,video/*,.pdf,.doc,.docx"
            (change)="onFileSelected($event)"
            aria-label="Select files"
          />
        </section>

        <!-- Connected Sources Section -->
        @if (connectedSources().length > 0) {
          <section class="attachment-section">
            <h3 class="section-label">Connected Sources</h3>
            <div class="connected-sources-grid">
              @for (source of connectedSources(); track source.platform) {
                <button
                  type="button"
                  class="connected-source"
                  [attr.title]="source.platform"
                  (click)="onSelectSource(source)"
                >
                  <img
                    class="source-favicon"
                    [src]="getFaviconUrl(source)"
                    [alt]="source.platform"
                    loading="lazy"
                  />
                  <span class="source-label">{{ source.platform }}</span>
                </button>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .attachments-sheet {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      :host-context(.light),
      :host-context([data-theme='light']) {
        background: var(--nxt1-color-bg-primary, #ffffff);
        color: var(--nxt1-color-text-primary, #1a1a1a);
      }

      /* ─── Header ─── */
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-bottom: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.09));
      }

      .sheet-title {
        font-size: 18px;
        font-weight: 600;
        margin: 0;
        line-height: 1.2;
      }

      .sheet-close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        cursor: pointer;
        transition:
          background 0.15s ease,
          color 0.15s ease;
      }

      .sheet-close:active {
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.06));
      }

      /* ─── Content ─── */
      .sheet-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px 0;
        scrollbar-width: none;
      }

      .sheet-content::-webkit-scrollbar {
        display: none;
      }

      .attachment-section {
        padding: 0 16px 24px 16px;
      }

      .section-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        margin: 0 0 12px 0;
      }

      /* ─── File Upload Button ─── */
      .attachment-option {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.09));
        border-radius: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: inherit;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease;
      }

      .attachment-option:active {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }

      .option-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        color: var(--nxt1-color-primary, #ccff00);
        flex-shrink: 0;
      }

      .option-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        text-align: left;
      }

      .option-title {
        display: block;
        font-size: 14px;
        font-weight: 500;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .option-subtitle {
        display: block;
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .option-arrow {
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        flex-shrink: 0;
      }

      /* ─── Connected Sources Grid ─── */
      .connected-sources-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 12px;
      }

      .connected-source {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 12px;
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.09));
        border-radius: 12px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: inherit;
        cursor: pointer;
        transition:
          background 0.15s ease,
          border-color 0.15s ease,
          transform 0.15s ease;
      }

      .connected-source:active {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        transform: scale(0.98);
      }

      .source-favicon {
        width: 44px;
        height: 44px;
        border-radius: 8px;
        object-fit: cover;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
      }

      .source-label {
        font-size: 11px;
        font-weight: 500;
        text-align: center;
        word-break: break-word;
        line-height: 1.2;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      :host-context(.light) {
        --nxt1-color-text-secondary: rgba(0, 0, 0, 0.7);
        --nxt1-color-text-tertiary: rgba(0, 0, 0, 0.4);
        --nxt1-color-surface-100: rgba(0, 0, 0, 0.04);
        --nxt1-color-surface-200: rgba(0, 0, 0, 0.06);
        --nxt1-color-border-subtle: rgba(0, 0, 0, 0.09);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentXAttachmentsSheetComponent {
  private readonly modalCtrl = inject(ModalController);
  private readonly haptics = inject(HapticsService);

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  // ── Inputs ──
  readonly connectedSources = input<readonly ConnectedAppSource[]>([]);

  // ── Outputs ──
  readonly fileSelected = output<File[]>();
  readonly sourceSelected = output<ConnectedAppSource>();

  /** Get favicon URL for a platform. */
  getFaviconUrl(source: ConnectedAppSource): string {
    // Use Google favicon API as fallback
    const url = new URL(source.profileUrl);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=128`;
  }

  /** Close sheet. */
  protected async onClose(): Promise<void> {
    await this.haptics.impact('light');
    await this.modalCtrl.dismiss(null, 'cancel');
  }

  /** Open file picker. */
  protected async onSelectFile(): Promise<void> {
    await this.haptics.impact('light');
    this.fileInput?.nativeElement.click();
  }

  /** Handle file selection. */
  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) {
      await this.haptics.impact('light');
      this.fileSelected.emit(files);
      await this.modalCtrl.dismiss(files, 'files-selected');
    }
    input.value = '';
  }

  /** Select connected source. */
  protected async onSelectSource(source: ConnectedAppSource): Promise<void> {
    await this.haptics.impact('light');
    this.sourceSelected.emit(source);
    await this.modalCtrl.dismiss(source, 'source-selected');
  }
}
