/**
 * @fileoverview Create Post Skeleton Component - Loading State
 * @module @nxt1/ui/create-post
 * @version 1.0.0
 *
 * Skeleton loading placeholder for create post interface.
 * Matches the layout of CreatePostShellComponent for seamless transitions.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Architecture (2026 Best Practices):
 * - Uses global skeleton animation from @nxt1/ui/styles/base/skeleton.css
 * - Component owns layout/structure only
 * - Global CSS custom properties for skeleton colors
 * - Accessible (aria-hidden, reduced motion support)
 *
 * @example
 * ```html
 * @if (isLoading()) {
 *   <nxt1-create-post-skeleton />
 * }
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Skeleton variant for different loading states.
 */
export type CreatePostSkeletonVariant = 'full' | 'compact' | 'media-only';

@Component({
  selector: 'nxt1-create-post-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="create-post-skeleton"
      [class.create-post-skeleton--compact]="variant() === 'compact'"
      [class.create-post-skeleton--media-only]="variant() === 'media-only'"
      aria-hidden="true"
      role="presentation"
    >
      <!-- Header skeleton -->
      @if (variant() !== 'media-only') {
        <div class="skeleton-header">
          <div class="skeleton-avatar"></div>
          <div class="skeleton-user-info">
            <div class="skeleton-name"></div>
            <div class="skeleton-privacy"></div>
          </div>
          <div class="skeleton-close-btn"></div>
        </div>
      }

      <!-- Editor skeleton -->
      @if (variant() !== 'media-only') {
        <div class="skeleton-editor">
          <div class="skeleton-textarea">
            <div class="skeleton-text-line skeleton-text-line--full"></div>
            <div class="skeleton-text-line skeleton-text-line--medium"></div>
            <div class="skeleton-text-line skeleton-text-line--short"></div>
          </div>
        </div>
      }

      <!-- Media grid skeleton -->
      @if (variant() !== 'compact') {
        <div class="skeleton-media-grid">
          @for (i of mediaSkeletons; track i) {
            <div class="skeleton-media-item">
              <div class="skeleton-media-overlay">
                <div class="skeleton-media-icon"></div>
              </div>
            </div>
          }
          <div class="skeleton-media-add">
            <div class="skeleton-add-icon"></div>
          </div>
        </div>
      }

      <!-- Toolbar skeleton -->
      @if (variant() !== 'media-only') {
        <div class="skeleton-toolbar">
          <div class="skeleton-toolbar-buttons">
            @for (i of toolbarSkeletons; track i) {
              <div class="skeleton-toolbar-btn"></div>
            }
          </div>
          <div class="skeleton-xp-badge"></div>
        </div>
      }

      <!-- Footer skeleton -->
      @if (variant() !== 'media-only' && variant() !== 'compact') {
        <div class="skeleton-footer">
          <div class="skeleton-char-count"></div>
          <div class="skeleton-post-btn"></div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
         CREATE POST SKELETON - Loading Placeholder
         Uses global skeleton animation from @nxt1/ui/styles
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      /* Container */
      .create-post-skeleton {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 16px;
        background: var(--nxt1-color-bg-primary, var(--ion-background-color));
        border-radius: var(--nxt1-radius-xl, 16px);
        border: 1px solid var(--nxt1-color-border-subtle);
      }

      .create-post-skeleton--compact {
        gap: 12px;
        padding: 12px;
      }

      .create-post-skeleton--media-only {
        padding: 8px;
        gap: 8px;
      }

      /* Shimmer effect - uses global animation and design tokens */
      .skeleton-avatar,
      .skeleton-name,
      .skeleton-privacy,
      .skeleton-close-btn,
      .skeleton-text-line,
      .skeleton-media-item,
      .skeleton-media-add,
      .skeleton-toolbar-btn,
      .skeleton-xp-badge,
      .skeleton-char-count,
      .skeleton-post-btn,
      .skeleton-add-icon,
      .skeleton-media-icon {
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton) 25%,
            var(--nxt1-color-loading-skeletonShimmer) 50%,
            var(--nxt1-color-loading-skeleton) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s infinite ease-in-out;
      }

      /* ============================================
         HEADER SKELETON
         ============================================ */

      .skeleton-header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .skeleton-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .skeleton-user-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .skeleton-name {
        height: 16px;
        width: 120px;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .skeleton-privacy {
        height: 12px;
        width: 80px;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .skeleton-close-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* ============================================
         EDITOR SKELETON
         ============================================ */

      .skeleton-editor {
        min-height: 100px;
        padding: 12px 0;
      }

      .skeleton-textarea {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .skeleton-text-line {
        height: 16px;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .skeleton-text-line--full {
        width: 100%;
      }

      .skeleton-text-line--medium {
        width: 75%;
      }

      .skeleton-text-line--short {
        width: 40%;
      }

      /* ============================================
         MEDIA GRID SKELETON
         ============================================ */

      .skeleton-media-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }

      .skeleton-media-item {
        aspect-ratio: 1;
        border-radius: var(--nxt1-radius-lg, 12px);
        position: relative;
        overflow: hidden;
      }

      .skeleton-media-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--nxt1-color-surface-200);
      }

      .skeleton-media-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
      }

      .skeleton-media-add {
        aspect-ratio: 1;
        border-radius: var(--nxt1-radius-lg, 12px);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px dashed var(--nxt1-color-border-default);
        background: transparent !important;
        animation: none !important;
      }

      .skeleton-add-icon {
        width: 24px;
        height: 24px;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      /* ============================================
         TOOLBAR SKELETON
         ============================================ */

      .skeleton-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-toolbar-buttons {
        display: flex;
        gap: 16px;
      }

      .skeleton-toolbar-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
      }

      .skeleton-xp-badge {
        width: 80px;
        height: 32px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ============================================
         FOOTER SKELETON
         ============================================ */

      .skeleton-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 12px;
        border-top: 1px solid var(--nxt1-color-border-subtle);
      }

      .skeleton-char-count {
        width: 60px;
        height: 14px;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      .skeleton-post-btn {
        width: 100px;
        height: 44px;
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      /* ============================================
         ANIMATION KEYFRAMES
         ============================================ */

      @keyframes skeleton-shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      /* ============================================
         REDUCED MOTION
         ============================================ */

      @media (prefers-reduced-motion: reduce) {
        .skeleton-avatar,
        .skeleton-name,
        .skeleton-privacy,
        .skeleton-close-btn,
        .skeleton-text-line,
        .skeleton-media-item,
        .skeleton-toolbar-btn,
        .skeleton-xp-badge,
        .skeleton-char-count,
        .skeleton-post-btn {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePostSkeletonComponent {
  /**
   * Skeleton variant for different loading contexts.
   * - 'full': Complete create post interface skeleton
   * - 'compact': Minimal skeleton without media grid
   * - 'media-only': Only media grid skeleton
   */
  readonly variant = input<CreatePostSkeletonVariant>('full');

  /** Number of media placeholder items */
  protected readonly mediaSkeletons = [1, 2];

  /** Number of toolbar button placeholders */
  protected readonly toolbarSkeletons = [1, 2, 3, 4];
}
