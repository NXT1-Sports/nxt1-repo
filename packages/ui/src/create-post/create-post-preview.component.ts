/**
 * @fileoverview Create Post Preview Component
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Live preview card showing how the post will appear in the feed.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - User avatar and name
 * - Post content with truncation
 * - Media preview (single/grid)
 * - Poll preview
 * - Location display
 * - Privacy indicator
 * - Expandable/collapsible
 *
 * @example
 * ```html
 * <nxt1-create-post-preview
 *   [user]="currentUser()"
 *   [content]="postContent()"
 *   [media]="media()"
 *   [privacy]="privacy()"
 *   [location]="location()"
 *   [expanded]="showPreview()"
 *   (toggleExpand)="togglePreview()"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonIcon, IonRippleEffect } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronDownOutline,
  chevronUpOutline,
  earthOutline,
  peopleOutline,
  lockClosedOutline,
  locationOutline,
  heartOutline,
  chatbubbleOutline,
  shareOutline,
  bookmarkOutline,
  playCircleOutline,
} from 'ionicons/icons';
import type { PostMedia, PostPrivacy, PostLocation, TaggableUser } from '@nxt1/core';
import { HapticsService } from '../services/haptics/haptics.service';

// Register icons
@Component({
  selector: 'nxt1-create-post-preview',
  standalone: true,
  imports: [CommonModule, IonIcon, IonRippleEffect],
  template: `
    <div class="preview" [class.preview--expanded]="expanded()">
      <!-- Toggle header -->
      <button
        type="button"
        class="preview__header"
        (click)="onToggle()"
        aria-label="Toggle preview"
      >
        <ion-ripple-effect></ion-ripple-effect>
        <span class="preview__header-text">Preview</span>
        <ion-icon [name]="expanded() ? 'chevron-up-outline' : 'chevron-down-outline'"></ion-icon>
      </button>

      <!-- Preview content -->
      @if (expanded()) {
        <div class="preview__content" @expandAnimation>
          <div class="preview__card">
            <!-- Card header -->
            <div class="preview__card-header">
              <!-- Avatar -->
              <div class="preview__avatar">
                @if (user()?.photoUrl) {
                  <img [src]="user()?.photoUrl" [alt]="user()?.displayName" />
                } @else {
                  <div class="preview__avatar-placeholder">
                    {{ userInitials() }}
                  </div>
                }
              </div>

              <!-- User info -->
              <div class="preview__user-info">
                <div class="preview__user-name">{{ user()?.displayName ?? 'Your Name' }}</div>
                <div class="preview__meta">
                  <span class="preview__time">Just now</span>
                  <span class="preview__dot">·</span>
                  <ion-icon [name]="privacyIcon()"></ion-icon>
                </div>
              </div>
            </div>

            <!-- Content -->
            @if (content()) {
              <div class="preview__text">
                <p>{{ truncatedContent() }}</p>
                @if (isContentTruncated()) {
                  <span class="preview__more">...See more</span>
                }
              </div>
            }

            <!-- Location -->
            @if (location()) {
              <div class="preview__location">
                <ion-icon name="location-outline"></ion-icon>
                <span>{{ location()?.name }}</span>
              </div>
            }

            <!-- Media grid -->
            @if (hasMedia()) {
              <div class="preview__media" [class]="'preview__media--' + mediaLayout()">
                @for (item of displayMedia(); track item.id; let i = $index) {
                  <div
                    class="preview__media-item"
                    [class.preview__media-item--video]="item.type === 'video'"
                  >
                    @if (item.localUri || item.url || item.thumbnailUrl) {
                      <img
                        [src]="item.thumbnailUrl ?? item.localUri ?? item.url"
                        [alt]="item.altText ?? ''"
                      />
                    } @else {
                      <div class="preview__media-placeholder"></div>
                    }

                    <!-- Video indicator -->
                    @if (item.type === 'video') {
                      <div class="preview__video-badge">
                        <ion-icon name="play-circle-outline"></ion-icon>
                      </div>
                    }

                    <!-- More overlay -->
                    @if (i === 3 && remainingMedia() > 0) {
                      <div class="preview__media-more">+{{ remainingMedia() }}</div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Poll preview -->
            @if (hasPoll()) {
              <div class="preview__poll">
                <div class="preview__poll-option">
                  <div class="preview__poll-bar"></div>
                  <span>Option 1</span>
                </div>
                <div class="preview__poll-option">
                  <div class="preview__poll-bar"></div>
                  <span>Option 2</span>
                </div>
              </div>
            }

            <!-- Actions bar -->
            <div class="preview__actions">
              <button class="preview__action" disabled>
                <ion-icon name="heart-outline"></ion-icon>
                <span>Like</span>
              </button>
              <button class="preview__action" disabled>
                <ion-icon name="chatbubble-outline"></ion-icon>
                <span>Comment</span>
              </button>
              <button class="preview__action" disabled>
                <ion-icon name="share-outline"></ion-icon>
                <span>Share</span>
              </button>
              <button class="preview__action" disabled>
                <ion-icon name="bookmark-outline"></ion-icon>
              </button>
            </div>
          </div>

          <p class="preview__disclaimer">This is how your post will appear in the feed</p>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         PREVIEW - Theme-aware Design
         ============================================ */

      :host {
        display: block;
      }

      .preview {
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-xl, 16px);
        overflow: hidden;
        background: var(--nxt1-color-surface-100);
      }

      /* ============================================
         HEADER
         ============================================ */

      .preview__header {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      .preview__header:hover {
        background: var(--nxt1-color-surface-200);
      }

      .preview__header-text {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
      }

      .preview__header ion-icon {
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         CONTENT
         ============================================ */

      .preview__content {
        padding: 0 16px 16px;
      }

      /* ============================================
         CARD
         ============================================ */

      .preview__card {
        background: var(--nxt1-color-surface-200);
        border-radius: var(--nxt1-radius-lg, 12px);
        overflow: hidden;
      }

      .preview__card-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
      }

      /* Avatar */
      .preview__avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-surface-300);
      }

      .preview__avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .preview__avatar-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-alpha-primary20, rgba(204, 255, 0, 0.2));
      }

      /* User info */
      .preview__user-info {
        flex: 1;
        min-width: 0;
      }

      .preview__user-name {
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        font-weight: 600;
        color: var(--nxt1-color-text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .preview__meta {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
      }

      .preview__time {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary);
      }

      .preview__dot {
        color: var(--nxt1-color-text-tertiary);
      }

      .preview__meta ion-icon {
        font-size: 12px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* Text content */
      .preview__text {
        padding: 0 12px 12px;
      }

      .preview__text p {
        margin: 0;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-primary);
        line-height: 1.5;
        white-space: pre-wrap;
        word-wrap: break-word;
      }

      .preview__more {
        color: var(--nxt1-color-text-secondary);
        font-weight: 500;
      }

      /* Location */
      .preview__location {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 0 12px 12px;
      }

      .preview__location ion-icon {
        font-size: 14px;
        color: var(--nxt1-color-primary);
      }

      .preview__location span {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-secondary);
      }

      /* ============================================
         MEDIA GRID
         ============================================ */

      .preview__media {
        display: grid;
        gap: 2px;
      }

      .preview__media--single {
        grid-template-columns: 1fr;
      }

      .preview__media--double {
        grid-template-columns: 1fr 1fr;
      }

      .preview__media--triple {
        grid-template-columns: 2fr 1fr;
        grid-template-rows: 1fr 1fr;
      }

      .preview__media--triple .preview__media-item:first-child {
        grid-row: 1 / 3;
      }

      .preview__media--quad,
      .preview__media--multi {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: 1fr 1fr;
      }

      .preview__media-item {
        position: relative;
        aspect-ratio: 16/9;
        background: var(--nxt1-color-surface-300);
        overflow: hidden;
      }

      .preview__media--single .preview__media-item {
        aspect-ratio: 16/9;
      }

      .preview__media--double .preview__media-item,
      .preview__media--triple .preview__media-item,
      .preview__media--quad .preview__media-item,
      .preview__media--multi .preview__media-item {
        aspect-ratio: 1;
      }

      .preview__media-item img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .preview__media-placeholder {
        width: 100%;
        height: 100%;
        background: var(--nxt1-color-surface-300);
      }

      .preview__video-badge {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        border-radius: 50%;
        backdrop-filter: blur(4px);
      }

      .preview__video-badge ion-icon {
        font-size: 24px;
        color: #ffffff;
      }

      .preview__media-more {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.6);
        font-size: var(--nxt1-fontSize-xl, 1.25rem);
        font-weight: 700;
        color: #ffffff;
      }

      /* ============================================
         POLL PREVIEW
         ============================================ */

      .preview__poll {
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .preview__poll-option {
        position: relative;
        padding: 12px;
        background: var(--nxt1-color-surface-200);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-radius-md, 8px);
        overflow: hidden;
      }

      .preview__poll-bar {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 0%;
        background: var(--nxt1-color-alpha-primary10, rgba(204, 255, 0, 0.1));
      }

      .preview__poll-option span {
        position: relative;
        font-size: var(--nxt1-fontSize-sm, 0.875rem);
        color: var(--nxt1-color-text-primary);
      }

      /* ============================================
         ACTIONS BAR
         ============================================ */

      .preview__actions {
        display: flex;
        align-items: center;
        padding: 8px 12px;
        border-top: 1px solid var(--nxt1-color-border-default);
      }

      .preview__action {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px;
        -webkit-appearance: none;
        appearance: none;
        background: transparent;
        border: none;
        color: inherit;
        cursor: not-allowed;
        opacity: 0.6;
      }

      .preview__action:last-child {
        flex: 0;
      }

      .preview__action ion-icon {
        font-size: 18px;
        color: var(--nxt1-color-text-tertiary);
      }

      .preview__action span {
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================
         DISCLAIMER
         ============================================ */

      .preview__disclaimer {
        margin-top: 12px;
        text-align: center;
        font-size: var(--nxt1-fontSize-xs, 0.75rem);
        color: var(--nxt1-color-text-quaternary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostPreviewComponent {
  constructor() {
    addIcons({
      'chevron-down-outline': chevronDownOutline,
      'chevron-up-outline': chevronUpOutline,
      'earth-outline': earthOutline,
      'people-outline': peopleOutline,
      'lock-closed-outline': lockClosedOutline,
      'location-outline': locationOutline,
      'heart-outline': heartOutline,
      'chatbubble-outline': chatbubbleOutline,
      'share-outline': shareOutline,
      'bookmark-outline': bookmarkOutline,
      'play-circle-outline': playCircleOutline,
    });
  }

  private readonly haptics = inject(HapticsService);

  /** Current user */
  readonly user = input<TaggableUser | null>(null);

  /** Post content */
  readonly content = input('');

  /** Media items */
  readonly media = input<readonly PostMedia[]>([]);

  /** Privacy setting */
  readonly privacy = input<PostPrivacy>('public');

  /** Location */
  readonly location = input<PostLocation | null>(null);

  /** Whether poll exists */
  readonly hasPoll = input(false);

  /** Whether preview is expanded */
  readonly expanded = input(false);

  /** Emitted when toggle is clicked */
  readonly toggleExpand = output<void>();

  /** User initials for avatar placeholder */
  protected readonly userInitials = computed(() => {
    const name = this.user()?.displayName ?? '';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  });

  /** Privacy icon */
  protected readonly privacyIcon = computed(() => {
    switch (this.privacy()) {
      case 'public':
        return 'earth-outline';
      case 'team':
        return 'people-outline';
      case 'private':
        return 'lock-closed-outline';
      default:
        return 'earth-outline';
    }
  });

  /** Truncated content */
  protected readonly truncatedContent = computed(() => {
    const text = this.content();
    const maxLength = 200;
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim();
  });

  /** Whether content is truncated */
  protected readonly isContentTruncated = computed(() => this.content().length > 200);

  /** Whether has media */
  protected readonly hasMedia = computed(() => this.media().length > 0);

  /** Media layout class */
  protected readonly mediaLayout = computed(() => {
    const count = this.media().length;
    if (count === 1) return 'single';
    if (count === 2) return 'double';
    if (count === 3) return 'triple';
    if (count === 4) return 'quad';
    return 'multi';
  });

  /** Media items to display (max 4) */
  protected readonly displayMedia = computed(() => this.media().slice(0, 4));

  /** Remaining media count */
  protected readonly remainingMedia = computed(() => Math.max(0, this.media().length - 4));

  /**
   * Handle toggle click.
   */
  protected async onToggle(): Promise<void> {
    await this.haptics.impact('light');
    this.toggleExpand.emit();
  }
}
