/**
 * @fileoverview Profile Skeleton Component - Loading State
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * Skeleton loading placeholder for Profile feature.
 * Shows animated placeholders matching the profile layout.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ProfileSkeletonVariant =
  | 'header'
  | 'stats'
  | 'post'
  | 'offer'
  | 'event'
  | 'full'
  | 'web';

@Component({
  selector: 'nxt1-profile-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="profile-skeleton" [class]="'profile-skeleton--' + variant()">
      @switch (variant()) {
        @case ('header') {
          <div class="skeleton-header">
            <!-- Banner placeholder (rounded, with margins matching real header) -->
            <div class="skeleton-banner skeleton-animate"></div>

            <!-- Content below banner (NO overlap, matches real header layout) -->
            <div class="skeleton-header-content">
              <!-- Top row: Avatar left + Name/followers right (YouTube-style) -->
              <div class="skeleton-top-row">
                <div class="skeleton-avatar-wrapper">
                  <div class="skeleton-avatar-glow"></div>
                  <div class="skeleton-avatar skeleton-animate"></div>
                </div>
                <div class="skeleton-name-section">
                  <div class="skeleton-name skeleton-animate"></div>
                  <div class="skeleton-followers skeleton-animate"></div>
                  <div class="skeleton-sport skeleton-animate"></div>
                </div>
              </div>

              <!-- Details section (full width below avatar row) -->
              <div class="skeleton-details">
                <div class="skeleton-meta skeleton-animate"></div>
                <div class="skeleton-chips">
                  <div class="skeleton-chip skeleton-animate"></div>
                  <div class="skeleton-chip skeleton-animate"></div>
                  <div class="skeleton-chip skeleton-animate"></div>
                </div>
                <div class="skeleton-bio skeleton-animate"></div>
                <div class="skeleton-bio skeleton-bio--short skeleton-animate"></div>
                <div class="skeleton-actions">
                  <div class="skeleton-btn skeleton-animate"></div>
                  <div class="skeleton-btn skeleton-btn--secondary skeleton-animate"></div>
                </div>
              </div>
            </div>
          </div>
        }

        @case ('stats') {
          <div class="skeleton-stats-bar">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <div class="skeleton-stat-card">
                <div class="skeleton-stat-icon skeleton-animate"></div>
                <div class="skeleton-stat-value skeleton-animate"></div>
                <div class="skeleton-stat-label skeleton-animate"></div>
              </div>
            }
          </div>
        }

        @case ('post') {
          <div class="skeleton-post">
            <div class="skeleton-post-header">
              <div class="skeleton-post-avatar skeleton-animate"></div>
              <div class="skeleton-post-meta">
                <div class="skeleton-post-name skeleton-animate"></div>
                <div class="skeleton-post-time skeleton-animate"></div>
              </div>
            </div>
            <div class="skeleton-post-content skeleton-animate"></div>
            <div class="skeleton-post-media skeleton-animate"></div>
            <div class="skeleton-post-actions">
              <div class="skeleton-post-action skeleton-animate"></div>
              <div class="skeleton-post-action skeleton-animate"></div>
              <div class="skeleton-post-action skeleton-animate"></div>
            </div>
          </div>
        }

        @case ('offer') {
          <div class="skeleton-offer">
            <div class="skeleton-offer-logo skeleton-animate"></div>
            <div class="skeleton-offer-info">
              <div class="skeleton-offer-name skeleton-animate"></div>
              <div class="skeleton-offer-meta skeleton-animate"></div>
            </div>
            <div class="skeleton-offer-badge skeleton-animate"></div>
          </div>
        }

        @case ('event') {
          <div class="skeleton-event">
            <div class="skeleton-event-date skeleton-animate"></div>
            <div class="skeleton-event-info">
              <div class="skeleton-event-name skeleton-animate"></div>
              <div class="skeleton-event-location skeleton-animate"></div>
            </div>
          </div>
        }

        @case ('full') {
          <!-- Full page skeleton -->
          <nxt1-profile-skeleton variant="header" />
          <nxt1-profile-skeleton variant="stats" />
          <div class="skeleton-posts-section">
            <div class="skeleton-section-title skeleton-animate"></div>
            @for (i of [1, 2, 3]; track i) {
              <nxt1-profile-skeleton variant="post" />
            }
          </div>
        }

        @case ('web') {
          <div class="skeleton-web-shell">
            <div class="skeleton-web-stage">
              <div class="skeleton-web-split">
                <div class="skeleton-web-left">
                  <div class="skeleton-web-header skeleton-animate"></div>

                  <div class="skeleton-web-top-tabs">
                    @for (i of [1, 2, 3, 4]; track i) {
                      <div class="skeleton-web-tab skeleton-animate"></div>
                    }
                  </div>

                  <div class="skeleton-web-content-layer">
                    <div class="skeleton-web-side-nav">
                      @for (i of [1, 2, 3, 4, 5]; track i) {
                        <div class="skeleton-web-side-item skeleton-animate"></div>
                      }
                    </div>

                    <div class="skeleton-web-content">
                      <div class="skeleton-web-section">
                        <div class="skeleton-web-title skeleton-animate"></div>
                        <div class="skeleton-web-lines">
                          <div class="skeleton-web-line skeleton-animate"></div>
                          <div
                            class="skeleton-web-line skeleton-web-line--short skeleton-animate"
                          ></div>
                        </div>
                      </div>

                      <div class="skeleton-web-section">
                        <div class="skeleton-web-title skeleton-animate"></div>
                        <div class="skeleton-web-profile-grid">
                          @for (i of [1, 2, 3, 4, 5]; track i) {
                            <div class="skeleton-web-profile-row skeleton-animate"></div>
                          }
                        </div>
                      </div>

                      <div class="skeleton-web-section">
                        <div class="skeleton-web-title skeleton-animate"></div>
                        <div class="skeleton-web-badges">
                          @for (i of [1, 2, 3, 4]; track i) {
                            <div class="skeleton-web-badge skeleton-animate"></div>
                          }
                        </div>
                      </div>

                      <div class="skeleton-web-section">
                        <div class="skeleton-web-title skeleton-animate"></div>
                        <div class="skeleton-web-chip-grid">
                          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                            <div class="skeleton-web-chip skeleton-animate"></div>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="skeleton-web-right">
                  <div class="skeleton-web-action-grid">
                    @for (i of [1, 2, 3, 4]; track i) {
                      <div class="skeleton-web-action skeleton-animate"></div>
                    }
                  </div>

                  <div class="skeleton-web-carousel skeleton-animate"></div>

                  <div class="skeleton-web-team-stack">
                    <div class="skeleton-web-team skeleton-animate"></div>
                    <div
                      class="skeleton-web-team skeleton-web-team--secondary skeleton-animate"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      /* ============================================
       PROFILE SKELETON - Loading State
       2026 Theme-Aware Design Tokens
       ============================================ */

      :host {
        display: block;
      }

      /* Skeleton animation - Uses global design tokens */
      .skeleton-animate {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton) 0%,
          var(--nxt1-color-loading-skeletonShimmer) 50%,
          var(--nxt1-color-loading-skeleton) 100%
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      @keyframes skeleton-shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        .skeleton-animate {
          animation: none;
          background: var(--nxt1-color-loading-skeleton);
        }
      }

      /* ============================================
         HEADER SKELETON
         Matches profile-header-web.component.ts layout:
         Banner (rounded, mx-4 mt-2) → Content below (no overlap)
         → Avatar left + Name right → Details below
         ============================================ */

      .skeleton-header {
        position: relative;
      }

      /* Banner: matches mx-4 mt-2 h-[200px] rounded-2xl */
      .skeleton-banner {
        height: 200px;
        margin: 8px 16px 0;
        border-radius: 16px;

        @media (min-width: 769px) {
          height: 220px;
        }

        @media (max-width: 768px) {
          margin: 8px 12px 0;
        }
      }

      /* Content area: matches px-6 pt-4 flex flex-col */
      .skeleton-header-content {
        display: flex;
        flex-direction: column;
        padding: 16px 24px 0;

        @media (max-width: 768px) {
          padding: 12px 16px 0;
        }
      }

      /* Top row: Avatar + Name side-by-side, matches flex items-start gap-4 */
      .skeleton-top-row {
        display: flex;
        align-items: flex-start;
        gap: 16px;

        @media (max-width: 768px) {
          gap: 12px;
        }
      }

      /* Avatar wrapper: matches profile-avatar-wrapper in real header */
      .skeleton-avatar-wrapper {
        position: relative;
        width: 120px;
        height: 120px;
        flex-shrink: 0;

        @media (max-width: 768px) {
          width: 96px;
          height: 96px;
        }
      }

      /* Skeleton avatar circle */
      .skeleton-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
      }

      /* Gradient overlay on top — matches real avatar blend effect */
      .skeleton-avatar-glow {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        z-index: 2;
        pointer-events: none;
        background: radial-gradient(
          circle,
          transparent 40%,
          color-mix(
              in srgb,
              var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.06)) 50%,
              var(--nxt1-color-bg-primary, #0a0a0a)
            )
            72%,
          var(--nxt1-color-bg-primary, #0a0a0a) 90%
        );
      }

      /* Name section: right of avatar, matches min-w-0 flex-1 pt-2 */
      .skeleton-name-section {
        flex: 1;
        min-width: 0;
        padding-top: 8px;
      }

      /* Name: matches text-[28px] font-bold */
      .skeleton-name {
        height: 32px;
        width: 200px;
        max-width: 100%;
        margin-bottom: 8px;

        @media (max-width: 768px) {
          height: 26px;
          width: 160px;
        }
      }

      /* Followers line: matches mt-1 text-sm */
      .skeleton-followers {
        height: 18px;
        width: 180px;
        max-width: 100%;
        margin-bottom: 8px;
      }

      /* Sport/position line: matches mt-1 text-base */
      .skeleton-sport {
        height: 18px;
        width: 150px;
        max-width: 100%;
      }

      /* Details: full width below avatar row, matches pt-3 pb-6 */
      .skeleton-details {
        padding: 12px 0 24px;

        @media (max-width: 768px) {
          padding: 10px 0 20px;
        }
      }

      /* School/location: matches text-sm flex items-center gap-x-4 */
      .skeleton-meta {
        height: 16px;
        width: 220px;
        max-width: 100%;
        margin-bottom: 12px;
      }

      /* Class year / height / weight chips: matches mt-2 flex gap-2 rounded-full */
      .skeleton-chips {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }

      .skeleton-chip {
        height: 28px;
        width: 80px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* Bio: matches mt-3 max-w-[500px] text-[15px] */
      .skeleton-bio {
        height: 16px;
        width: 100%;
        max-width: 400px;
        margin-bottom: 8px;
      }

      .skeleton-bio--short {
        width: 60%;
        margin-bottom: 16px;
      }

      /* Action buttons: matches mt-4 flex gap-3, left-aligned */
      .skeleton-actions {
        display: flex;
        gap: 12px;
        margin-top: 4px;
      }

      /* Follow button: matches min-w-[120px] rounded-full px-6 py-2.5 */
      .skeleton-btn {
        height: 40px;
        width: 120px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .skeleton-btn--secondary {
        width: 100px;
      }

      /* ============================================
         STATS BAR SKELETON
         ============================================ */

      .skeleton-stats-bar {
        display: flex;
        gap: 16px;
        padding: 16px 24px;
        overflow-x: auto;
        scrollbar-width: none;

        &::-webkit-scrollbar {
          display: none;
        }

        @media (max-width: 768px) {
          padding: 16px;
        }
      }

      .skeleton-stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px;
        min-width: 100px;
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
        border-radius: var(--nxt1-radius-md, 8px);
      }

      .skeleton-stat-icon {
        width: 32px;
        height: 32px;
        border-radius: 50%;
      }

      .skeleton-stat-value {
        width: 50px;
        height: 24px;
      }

      .skeleton-stat-label {
        width: 70px;
        height: 14px;
      }

      /* ============================================
         POST SKELETON
         ============================================ */

      .skeleton-post {
        padding: 16px;
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .skeleton-post-header {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
      }

      .skeleton-post-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .skeleton-post-meta {
        flex: 1;
      }

      .skeleton-post-name {
        width: 120px;
        height: 18px;
        margin-bottom: 6px;
      }

      .skeleton-post-time {
        width: 80px;
        height: 14px;
      }

      .skeleton-post-content {
        height: 60px;
        margin-bottom: 12px;
      }

      .skeleton-post-media {
        height: 200px;
        border-radius: var(--nxt1-radius-md, 8px);
        margin-bottom: 12px;
      }

      .skeleton-post-actions {
        display: flex;
        gap: 24px;
      }

      .skeleton-post-action {
        width: 60px;
        height: 20px;
      }

      /* ============================================
         OFFER SKELETON
         ============================================ */

      .skeleton-offer {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px;
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .skeleton-offer-logo {
        width: 56px;
        height: 56px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }

      .skeleton-offer-info {
        flex: 1;
      }

      .skeleton-offer-name {
        width: 150px;
        height: 20px;
        margin-bottom: 6px;
      }

      .skeleton-offer-meta {
        width: 100px;
        height: 14px;
      }

      .skeleton-offer-badge {
        width: 80px;
        height: 28px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ============================================
         EVENT SKELETON
         ============================================ */

      .skeleton-event {
        display: flex;
        gap: 16px;
        padding: 16px;
        border-bottom: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .skeleton-event-date {
        width: 60px;
        height: 60px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }

      .skeleton-event-info {
        flex: 1;
      }

      .skeleton-event-name {
        width: 180px;
        height: 20px;
        margin-bottom: 8px;
      }

      .skeleton-event-location {
        width: 120px;
        height: 14px;
      }

      /* ============================================
         FULL PAGE SKELETON
         ============================================ */

      .skeleton-posts-section {
        padding-top: 24px;
      }

      .skeleton-section-title {
        width: 120px;
        height: 24px;
        margin: 0 24px 16px;

        @media (max-width: 768px) {
          margin: 0 16px 16px;
        }
      }

      /* ============================================
         WEB PROFILE SHELL SKELETON
         Matches profile-shell-web split layout
         ============================================ */

      .skeleton-web-shell {
        --sw-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --sw-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --sw-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--sw-bg);
        width: 100%;
        height: calc(100vh - 64px);
        min-height: 640px;
        overflow: hidden;
      }

      .skeleton-web-stage {
        height: 100%;
      }

      .skeleton-web-split {
        display: flex;
        height: 100%;
        gap: 0;
      }

      .skeleton-web-left {
        flex: 1;
        min-width: 0;
        max-width: calc(100% - 380px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding-left: 4px;
      }

      .skeleton-web-right {
        width: 380px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 0 16px 12px 0;
      }

      .skeleton-web-header {
        height: 92px;
        margin: 8px 12px 10px;
        border-radius: 14px;
      }

      .skeleton-web-top-tabs {
        display: flex;
        gap: 8px;
        padding: 0 8px 10px;
      }

      .skeleton-web-tab {
        height: 28px;
        width: 96px;
        border-radius: 999px;
      }

      .skeleton-web-content-layer {
        display: flex;
        flex: 1;
        min-height: 0;
      }

      .skeleton-web-side-nav {
        width: 140px;
        flex-shrink: 0;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .skeleton-web-side-item {
        height: 34px;
        border-radius: 8px;
      }

      .skeleton-web-content {
        flex: 1;
        min-width: 0;
        padding: 8px 12px 96px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .skeleton-web-section {
        background: var(--sw-surface);
        border: 1px solid var(--sw-border);
        border-radius: 12px;
        padding: 14px;
      }

      .skeleton-web-title {
        width: 148px;
        height: 16px;
        margin-bottom: 12px;
      }

      .skeleton-web-lines {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .skeleton-web-line {
        height: 12px;
        width: 100%;
        max-width: 520px;
      }

      .skeleton-web-line--short {
        max-width: 360px;
      }

      .skeleton-web-profile-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }

      .skeleton-web-profile-row {
        height: 14px;
      }

      .skeleton-web-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .skeleton-web-badge {
        width: 152px;
        height: 42px;
        border-radius: 999px;
      }

      .skeleton-web-chip-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .skeleton-web-chip {
        width: 126px;
        height: 30px;
        border-radius: 999px;
      }

      .skeleton-web-action-grid {
        width: 300px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      .skeleton-web-action {
        height: 68px;
        border-radius: 12px;
      }

      .skeleton-web-carousel {
        width: 300px;
        height: 56vh;
        min-height: 360px;
        border-radius: 16px;
      }

      .skeleton-web-team-stack {
        width: 300px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .skeleton-web-team {
        height: 70px;
        border-radius: 12px;
      }

      .skeleton-web-team--secondary {
        opacity: 0.8;
      }

      @media (max-width: 1200px) {
        .skeleton-web-left {
          max-width: calc(100% - 340px);
        }

        .skeleton-web-right {
          width: 340px;
        }

        .skeleton-web-action-grid,
        .skeleton-web-carousel,
        .skeleton-web-team-stack {
          width: 272px;
        }
      }

      @media (max-width: 980px) {
        .skeleton-web-shell {
          height: auto;
          min-height: 100vh;
          overflow: visible;
        }

        .skeleton-web-split {
          flex-direction: column;
        }

        .skeleton-web-left,
        .skeleton-web-right {
          max-width: 100%;
          width: 100%;
          padding: 0 12px;
        }

        .skeleton-web-side-nav {
          display: none;
        }

        .skeleton-web-content {
          padding: 8px 0 24px;
        }

        .skeleton-web-action-grid,
        .skeleton-web-carousel,
        .skeleton-web-team-stack {
          width: 100%;
          max-width: 420px;
        }

        .skeleton-web-carousel {
          height: 52vh;
          min-height: 300px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSkeletonComponent {
  /** Skeleton variant */
  readonly variant = input<ProfileSkeletonVariant>('post');
}
