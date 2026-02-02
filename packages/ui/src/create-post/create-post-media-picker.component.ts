/**
 * @fileoverview Create Post Media Picker Component
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Media attachment picker with drag-and-drop, thumbnails, and reordering.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Image/video thumbnails grid
 * - Drag-and-drop upload (web)
 * - Tap to add (mobile)
 * - Reorder media (drag on mobile, drag-drop on web)
 * - Remove media with haptic feedback
 * - Upload progress indicators
 * - Media limit indicator
 *
 * @example
 * ```html
 * <nxt1-create-post-media-picker
 *   [media]="media()"
 *   [maxMedia]="10"
 *   (mediaAdd)="onAddMedia()"
 *   (mediaRemove)="onRemoveMedia($event)"
 *   (mediaReorder)="onReorderMedia($event)"
 * />
 * ```
 */

import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  signal,
  inject,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonSpinner, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  addOutline,
  closeCircle,
  imageOutline,
  videocamOutline,
  playCircleOutline,
  reorderTwoOutline,
  alertCircleOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { type PostMedia, POST_MAX_MEDIA } from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
addIcons({
  'add-outline': addOutline,
  'close-circle': closeCircle,
  'image-outline': imageOutline,
  'videocam-outline': videocamOutline,
  'play-circle-outline': playCircleOutline,
  'reorder-two-outline': reorderTwoOutline,
  'alert-circle-outline': alertCircleOutline,
  'cloud-upload-outline': cloudUploadOutline,
});

@Component({
  selector: 'nxt1-create-post-media-picker',
  standalone: true,
  imports: [CommonModule, IonIcon, IonSpinner, IonRippleEffect],
  template: `
    <div
      class="media-picker"
      [class.media-picker--has-media]="hasMedia()"
      [class.media-picker--drag-over]="isDragOver()"
      [class.media-picker--disabled]="disabled()"
    >
      <!-- Media grid -->
      @if (hasMedia()) {
        <div class="media-grid" [style.--columns]="gridColumns()">
          @for (item of media(); track item.id; let i = $index) {
            <div
              class="media-item"
              [class.media-item--uploading]="item.status === 'uploading'"
              [class.media-item--processing]="item.status === 'processing'"
              [class.media-item--error]="item.status === 'error'"
              [class.media-item--video]="item.type === 'video'"
            >
              <!-- Thumbnail -->
              <div class="media-item__thumbnail">
                @if (item.type === 'video' && item.thumbnailUrl) {
                  <img [src]="item.thumbnailUrl" [alt]="item.altText ?? 'Video thumbnail'" />
                } @else if (item.localUri || item.url) {
                  <img [src]="item.localUri ?? item.url" [alt]="item.altText ?? 'Image'" />
                } @else {
                  <div class="media-item__placeholder">
                    <ion-icon
                      [name]="item.type === 'video' ? 'videocam-outline' : 'image-outline'"
                    ></ion-icon>
                  </div>
                }
              </div>

              <!-- Video play indicator -->
              @if (item.type === 'video' && item.status === 'complete') {
                <div class="media-item__video-indicator">
                  <ion-icon name="play-circle-outline"></ion-icon>
                  @if (item.duration) {
                    <span class="media-item__duration">{{ formatDuration(item.duration) }}</span>
                  }
                </div>
              }

              <!-- Upload progress -->
              @if (item.status === 'uploading') {
                <div class="media-item__progress">
                  <div class="media-item__progress-ring">
                    <svg viewBox="0 0 36 36">
                      <path
                        class="media-item__progress-bg"
                        d="M18 2.0845
                           a 15.9155 15.9155 0 0 1 0 31.831
                           a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        class="media-item__progress-fill"
                        [style.stroke-dasharray]="item.progress + ', 100'"
                        d="M18 2.0845
                           a 15.9155 15.9155 0 0 1 0 31.831
                           a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <span class="media-item__progress-text">{{ item.progress }}%</span>
                  </div>
                </div>
              }

              <!-- Processing state -->
              @if (item.status === 'processing') {
                <div class="media-item__processing">
                  <ion-spinner name="crescent" color="light"></ion-spinner>
                  <span>Processing...</span>
                </div>
              }

              <!-- Error state -->
              @if (item.status === 'error') {
                <div class="media-item__error">
                  <ion-icon name="alert-circle-outline"></ion-icon>
                  <span>{{ item.error ?? 'Upload failed' }}</span>
                </div>
              }

              <!-- Order badge -->
              <div class="media-item__order">{{ i + 1 }}</div>

              <!-- Remove button -->
              @if (!disabled() && item.status !== 'uploading') {
                <button
                  type="button"
                  class="media-item__remove"
                  (click)="onRemove(item.id, $event)"
                  aria-label="Remove media"
                >
                  <ion-icon name="close-circle"></ion-icon>
                </button>
              }
            </div>
          }

          <!-- Add more button (inside grid) -->
          @if (canAddMore()) {
            <button
              type="button"
              class="media-add-btn media-add-btn--grid"
              (click)="onAdd()"
              [disabled]="disabled()"
              aria-label="Add more media"
            >
              <ion-ripple-effect></ion-ripple-effect>
              <ion-icon name="add-outline"></ion-icon>
            </button>
          }
        </div>
      }

      <!-- Empty state / Drop zone -->
      @if (!hasMedia()) {
        <button
          type="button"
          class="media-drop-zone"
          [class.media-drop-zone--active]="isDragOver()"
          (click)="onAdd()"
          (dragover)="onDragOver($event)"
          (dragleave)="onDragLeave($event)"
          (drop)="onDrop($event)"
          [disabled]="disabled()"
          aria-label="Add photos or videos"
          #dropZone
        >
          <ion-ripple-effect></ion-ripple-effect>

          <div class="media-drop-zone__content">
            <div class="media-drop-zone__icon">
              <ion-icon name="cloud-upload-outline"></ion-icon>
            </div>
            <span class="media-drop-zone__title">
              @if (isDragOver()) {
                Drop to upload
              } @else {
                Add photos or videos
              }
            </span>
            <span class="media-drop-zone__subtitle"> Drag & drop or tap to browse </span>
          </div>
        </button>
      }

      <!-- Media count indicator -->
      @if (hasMedia()) {
        <div
          class="media-count"
          [class.media-count--near-limit]="isNearLimit()"
          [class.media-count--at-limit]="isAtLimit()"
        >
          <span>{{ media().length }}/{{ maxMedia() }}</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         MEDIA PICKER - Theme-aware Design
         ============================================ */

      :host {
        display: block;
      }

      .media-picker {
        position: relative;
      }

      .media-picker--disabled {
        opacity: 0.5;
        pointer-events: none;
      }

      /* ============================================
         MEDIA GRID
         ============================================ */

      .media-grid {
        display: grid;
        grid-template-columns: repeat(var(--columns, 3), 1fr);
        gap: 8px;
      }

      /* ============================================
         MEDIA ITEM
         ============================================ */

      .media-item {
        position: relative;
        aspect-ratio: 1;
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
      }

      .media-item__thumbnail {
        position: absolute;
        inset: 0;
      }

      .media-item__thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .media-item__placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.08));
      }

      .media-item__placeholder ion-icon {
        font-size: 32px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* Video indicator */
      .media-item__video-indicator {
        position: absolute;
        bottom: 8px;
        left: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background: rgba(0, 0, 0, 0.7);
        border-radius: var(--nxt1-radius-md, 8px);
        backdrop-filter: blur(4px);
      }

      .media-item__video-indicator ion-icon {
        font-size: 16px;
        color: #ffffff;
      }

      .media-item__duration {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 500;
        color: #ffffff;
      }

      /* Progress ring */
      .media-item__progress {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
      }

      .media-item__progress-ring {
        position: relative;
        width: 48px;
        height: 48px;
      }

      .media-item__progress-ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .media-item__progress-bg {
        fill: none;
        stroke: rgba(255, 255, 255, 0.2);
        stroke-width: 3;
      }

      .media-item__progress-fill {
        fill: none;
        stroke: var(--nxt1-color-primary, #ccff00);
        stroke-width: 3;
        stroke-linecap: round;
        transition: stroke-dasharray 0.3s ease;
      }

      .media-item__progress-text {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: #ffffff;
      }

      /* Processing state */
      .media-item__processing {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
      }

      .media-item__processing ion-spinner {
        --color: #ffffff;
        width: 24px;
        height: 24px;
      }

      .media-item__processing span {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: rgba(255, 255, 255, 0.8);
      }

      /* Error state */
      .media-item__error {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        background: rgba(239, 68, 68, 0.8);
        backdrop-filter: blur(4px);
      }

      .media-item__error ion-icon {
        font-size: 24px;
        color: #ffffff;
      }

      .media-item__error span {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: #ffffff;
        text-align: center;
        padding: 0 8px;
      }

      /* Order badge */
      .media-item__order {
        position: absolute;
        top: 6px;
        left: 6px;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.7);
        border-radius: 50%;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 600;
        color: #ffffff;
      }

      /* Remove button */
      .media-item__remove {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0;
        -webkit-tap-highlight-color: transparent;
      }

      .media-item__remove ion-icon {
        font-size: 24px;
        color: rgba(255, 255, 255, 0.9);
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
        transition: transform 0.15s ease;
      }

      .media-item__remove:hover ion-icon {
        transform: scale(1.1);
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
         ADD BUTTON (in grid)
         ============================================ */

      .media-add-btn {
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 2px dashed var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .media-add-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .media-add-btn ion-icon {
        font-size: 28px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        transition: color 0.15s ease;
      }

      .media-add-btn:hover ion-icon {
        color: var(--nxt1-color-primary, #ccff00);
      }

      /* ============================================
         DROP ZONE (empty state)
         ============================================ */

      .media-drop-zone {
        width: 100%;
        padding: 32px 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border: 2px dashed var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: var(--nxt1-radius-xl, 16px);
        cursor: pointer;
        transition: all var(--nxt1-duration-fast, 150ms) var(--nxt1-easing-out, ease-out);
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .media-drop-zone:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-color: var(--nxt1-color-primary, #ccff00);
      }

      .media-drop-zone--active {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
        border-color: var(--nxt1-color-primary, #ccff00);
        border-style: solid;
      }

      .media-drop-zone__content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        text-align: center;
      }

      .media-drop-zone__icon {
        width: 56px;
        height: 56px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));
        border-radius: 50%;
        margin-bottom: 4px;
      }

      .media-drop-zone__icon ion-icon {
        font-size: 28px;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .media-drop-zone:hover .media-drop-zone__icon {
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .media-drop-zone:hover .media-drop-zone__icon ion-icon {
        color: var(--nxt1-color-primary, #ccff00);
      }

      .media-drop-zone__title {
        font-size: var(--nxt1-fontSize-base, 1rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary, #ffffff);
      }

      .media-drop-zone__subtitle {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      /* ============================================
         MEDIA COUNT INDICATOR
         ============================================ */

      .media-count {
        position: absolute;
        bottom: -24px;
        right: 0;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
      }

      .media-count--near-limit {
        color: var(--nxt1-color-warning, #f59e0b);
      }

      .media-count--at-limit {
        color: var(--nxt1-color-error, #ef4444);
      }

      /* ============================================
         DRAG OVER STATE
         ============================================ */

      .media-picker--drag-over .media-grid {
        opacity: 0.5;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostMediaPickerComponent {
  private readonly haptics = inject(HapticsService);
  private readonly dropZone = viewChild<ElementRef>('dropZone');

  /** Media items */
  readonly media = input<readonly PostMedia[]>([]);

  /** Maximum number of media items */
  readonly maxMedia = input(POST_MAX_MEDIA);

  /** Whether the picker is disabled */
  readonly disabled = input(false);

  /** Emitted when add button is clicked */
  readonly mediaAdd = output<void>();

  /** Emitted when media is removed */
  readonly mediaRemove = output<string>();

  /** Emitted when media order changes */
  readonly mediaReorder = output<{ from: number; to: number }>();

  /** Emitted when files are dropped */
  readonly filesDropped = output<FileList>();

  /** Whether drag is over drop zone */
  protected readonly isDragOver = signal(false);

  /** Whether has any media */
  protected readonly hasMedia = computed(() => this.media().length > 0);

  /** Whether can add more media */
  protected readonly canAddMore = computed(() => this.media().length < this.maxMedia());

  /** Whether near media limit */
  protected readonly isNearLimit = computed(() => {
    const count = this.media().length;
    const max = this.maxMedia();
    return count >= max - 2 && count < max;
  });

  /** Whether at media limit */
  protected readonly isAtLimit = computed(() => this.media().length >= this.maxMedia());

  /** Grid columns based on media count */
  protected readonly gridColumns = computed(() => {
    const count = this.media().length + (this.canAddMore() ? 1 : 0);
    if (count <= 2) return 2;
    return 3;
  });

  /**
   * Handle add button click.
   */
  protected async onAdd(): Promise<void> {
    if (!this.disabled() && this.canAddMore()) {
      await this.haptics.impact('light');
      this.mediaAdd.emit();
    }
  }

  /**
   * Handle remove button click.
   */
  protected async onRemove(id: string, event: Event): Promise<void> {
    event.stopPropagation();
    await this.haptics.notification('warning');
    this.mediaRemove.emit(id);
  }

  /**
   * Handle drag over.
   */
  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.disabled() && this.canAddMore()) {
      this.isDragOver.set(true);
    }
  }

  /**
   * Handle drag leave.
   */
  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  /**
   * Handle drop.
   */
  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    if (this.disabled() || !this.canAddMore()) return;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      await this.haptics.notification('success');
      this.filesDropped.emit(files);
    }
  }

  /**
   * Format video duration.
   */
  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
