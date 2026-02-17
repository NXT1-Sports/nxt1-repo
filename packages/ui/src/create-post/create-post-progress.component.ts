/**
 * @fileoverview Create Post Progress Component
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Upload progress indicator with overall and per-file progress.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Overall progress bar
 * - Individual file progress list
 * - Estimated time remaining
 * - Cancel button
 * - Success/error states
 * - Animations
 *
 * @example
 * ```html
 * <nxt1-create-post-progress
 *   [isUploading]="isUploading()"
 *   [overallProgress]="uploadProgress()"
 *   [files]="uploadingFiles()"
 *   (cancel)="cancelUpload()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  closeOutline,
  checkmarkCircle,
  alertCircle,
  cloudUploadOutline,
  documentOutline,
  imageOutline,
  videocamOutline,
} from 'ionicons/icons';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  'close-outline': closeOutline,
  'checkmark-circle': checkmarkCircle,
  'alert-circle': alertCircle,
  'cloud-upload-outline': cloudUploadOutline,
  'document-outline': documentOutline,
  'image-outline': imageOutline,
  'videocam-outline': videocamOutline,
});

export interface UploadingFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

@Component({
  selector: 'nxt1-create-post-progress',
  standalone: true,
  imports: [CommonModule, IonIcon, IonSpinner, IonRippleEffect],
  template: `
    @if (isUploading() || hasFiles()) {
      <div
        class="progress"
        [class.progress--uploading]="isUploading()"
        [class.progress--complete]="isComplete()"
        [class.progress--error]="hasError()"
      >
        <!-- Header -->
        <div class="progress__header">
          <div class="progress__title">
            @if (isComplete()) {
              <ion-icon name="checkmark-circle" class="progress__icon--success"></ion-icon>
              <span>Upload complete</span>
            } @else if (hasError()) {
              <ion-icon name="alert-circle" class="progress__icon--error"></ion-icon>
              <span>Upload failed</span>
            } @else {
              <ion-icon name="cloud-upload-outline"></ion-icon>
              <span
                >Uploading {{ files().length }} {{ files().length === 1 ? 'file' : 'files' }}</span
              >
            }
          </div>

          @if (isUploading()) {
            <button
              type="button"
              class="progress__cancel"
              (click)="onCancel()"
              aria-label="Cancel upload"
            >
              <ion-ripple-effect></ion-ripple-effect>
              <ion-icon name="close-outline"></ion-icon>
            </button>
          }
        </div>

        <!-- Overall progress bar -->
        @if (isUploading()) {
          <div class="progress__bar-container">
            <div class="progress__bar" [style.width.%]="overallProgress()">
              <div class="progress__bar-shimmer"></div>
            </div>
          </div>

          <div class="progress__stats">
            <span class="progress__percentage">{{ overallProgress() }}%</span>
            @if (estimatedTimeRemaining()) {
              <span class="progress__eta">~{{ estimatedTimeRemaining() }} remaining</span>
            }
          </div>
        }

        <!-- File list -->
        @if (showFileList()) {
          <div class="progress__files">
            @for (file of files(); track file.id) {
              <div
                class="progress__file"
                [class.progress__file--complete]="file.status === 'complete'"
                [class.progress__file--error]="file.status === 'error'"
                [class.progress__file--uploading]="file.status === 'uploading'"
              >
                <!-- File icon -->
                <div class="progress__file-icon">
                  <ion-icon [name]="getFileIcon(file.type)"></ion-icon>
                </div>

                <!-- File info -->
                <div class="progress__file-info">
                  <span class="progress__file-name">{{ file.name }}</span>
                  <span class="progress__file-size">{{ formatFileSize(file.size) }}</span>
                </div>

                <!-- Status -->
                <div class="progress__file-status">
                  @if (file.status === 'complete') {
                    <ion-icon name="checkmark-circle" class="progress__icon--success"></ion-icon>
                  } @else if (file.status === 'error') {
                    <ion-icon name="alert-circle" class="progress__icon--error"></ion-icon>
                  } @else if (file.status === 'uploading' || file.status === 'processing') {
                    <div class="progress__file-progress">
                      <ion-spinner name="crescent"></ion-spinner>
                      <span>{{ file.progress }}%</span>
                    </div>
                  } @else {
                    <span class="progress__pending">Pending</span>
                  }
                </div>
              </div>
            }
          </div>
        }

        <!-- Error message -->
        @if (hasError() && errorMessage()) {
          <div class="progress__error-message">
            {{ errorMessage() }}
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      /* ============================================
         PROGRESS - Theme-aware Design
         ============================================ */

      :host {
        display: block;
      }

      .progress {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-xl, 16px);
        padding: 16px;
        animation: fadeIn 0.2s ease;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .progress--complete {
        border-color: var(--nxt1-color-success, #22c55e);
        background: rgba(34, 197, 94, 0.05);
      }

      .progress--error {
        border-color: var(--nxt1-color-error, #ef4444);
        background: rgba(239, 68, 68, 0.05);
      }

      /* ============================================
         HEADER
         ============================================ */

      .progress__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .progress__title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
      }

      .progress__title ion-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-secondary);
      }

      .progress__icon--success {
        color: var(--nxt1-color-success, #22c55e) !important;
      }

      .progress__icon--error {
        color: var(--nxt1-color-error, #ef4444) !important;
      }

      .progress__cancel {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: transparent;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .progress__cancel:hover {
        background: var(--nxt1-color-surface-200);
      }

      .progress__cancel ion-icon {
        font-size: 20px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         PROGRESS BAR
         ============================================ */

      .progress__bar-container {
        height: 6px;
        background: var(--nxt1-color-surface-300);
        border-radius: 3px;
        overflow: hidden;
      }

      .progress__bar {
        height: 100%;
        background: var(--nxt1-color-primary, #ccff00);
        border-radius: 3px;
        transition: width 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .progress__bar-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
        animation: shimmer 1.5s infinite;
      }

      @keyframes shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }

      .progress__stats {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 8px;
      }

      .progress__percentage {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-primary, #ccff00);
        font-variant-numeric: tabular-nums;
      }

      .progress__eta {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         FILE LIST
         ============================================ */

      .progress__files {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 200px;
        overflow-y: auto;
      }

      .progress__file {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .progress__file--complete {
        background: rgba(34, 197, 94, 0.1);
      }

      .progress__file--error {
        background: rgba(239, 68, 68, 0.1);
      }

      .progress__file-icon {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-300);
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .progress__file-icon ion-icon {
        font-size: 18px;
        color: var(--nxt1-color-text-secondary);
      }

      .progress__file-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .progress__file-name {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 500;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .progress__file-size {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary);
      }

      .progress__file-status {
        flex-shrink: 0;
      }

      .progress__file-status ion-icon {
        font-size: 20px;
      }

      .progress__file-progress {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .progress__file-progress ion-spinner {
        --color: var(--nxt1-color-primary, #ccff00);
        width: 16px;
        height: 16px;
      }

      .progress__file-progress span {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        font-variant-numeric: tabular-nums;
      }

      .progress__pending {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-quaternary);
      }

      /* ============================================
         ERROR MESSAGE
         ============================================ */

      .progress__error-message {
        margin-top: 12px;
        padding: 12px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: var(--nxt1-radius-md, 8px);
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-error, #ef4444);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostProgressComponent {
  private readonly haptics = inject(HapticsService);

  /** Whether currently uploading */
  readonly isUploading = input(false);

  /** Overall progress (0-100) */
  readonly overallProgress = input(0);

  /** Files being uploaded */
  readonly files = input<readonly UploadingFile[]>([]);

  /** Estimated time remaining (formatted string) */
  readonly estimatedTimeRemaining = input<string | null>(null);

  /** Error message */
  readonly errorMessage = input<string | null>(null);

  /** Whether to show file list */
  readonly showFileList = input(true);

  /** Emitted when cancel is clicked */
  readonly cancel = output<void>();

  /** Whether has any files */
  protected readonly hasFiles = computed(() => this.files().length > 0);

  /** Whether all uploads complete */
  protected readonly isComplete = computed(() => {
    const files = this.files();
    return files.length > 0 && files.every((f) => f.status === 'complete');
  });

  /** Whether any upload has error */
  protected readonly hasError = computed(() => this.files().some((f) => f.status === 'error'));

  /**
   * Handle cancel click.
   */
  protected async onCancel(): Promise<void> {
    await this.haptics.notification('warning');
    this.cancel.emit();
  }

  /**
   * Get icon for file type.
   */
  protected getFileIcon(type: string): string {
    switch (type) {
      case 'image':
        return 'image-outline';
      case 'video':
        return 'videocam-outline';
      default:
        return 'document-outline';
    }
  }

  /**
   * Format file size for display.
   */
  protected formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}
