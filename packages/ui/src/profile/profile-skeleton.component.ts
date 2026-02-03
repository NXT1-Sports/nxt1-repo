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

export type ProfileSkeletonVariant = 'header' | 'stats' | 'post' | 'offer' | 'event' | 'full';

@Component({
  selector: 'nxt1-profile-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="profile-skeleton" [class]="'profile-skeleton--' + variant()">
      @switch (variant()) {
        @case ('header') {
          <div class="skeleton-header">
            <!-- Banner placeholder -->
            <div class="skeleton-banner skeleton-animate"></div>

            <!-- Avatar and info -->
            <div class="skeleton-header-content">
              <div class="skeleton-avatar skeleton-animate"></div>
              <div class="skeleton-info">
                <div class="skeleton-name skeleton-animate"></div>
                <div class="skeleton-meta skeleton-animate"></div>
                <div class="skeleton-bio skeleton-animate"></div>
                <div class="skeleton-bio skeleton-bio--short skeleton-animate"></div>
                <div class="skeleton-actions">
                  <div class="skeleton-btn skeleton-animate"></div>
                  <div class="skeleton-btn skeleton-btn--secondary skeleton-animate"></div>
                </div>
              </div>
            </div>

            <!-- Follow stats -->
            <div class="skeleton-follow-stats">
              <div class="skeleton-stat skeleton-animate"></div>
              <div class="skeleton-stat skeleton-animate"></div>
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
         ============================================ */

      .skeleton-header {
        position: relative;
      }

      .skeleton-banner {
        height: 200px;
        border-radius: var(--nxt1-radius-lg, 12px);

        @media (max-width: 768px) {
          height: 150px;
          border-radius: 0;
        }
      }

      .skeleton-header-content {
        display: flex;
        gap: 20px;
        padding: 0 24px;
        margin-top: -60px;
        position: relative;
        z-index: 1;

        @media (max-width: 768px) {
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 0 16px;
          margin-top: -50px;
        }
      }

      .skeleton-avatar {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        flex-shrink: 0;
        border: 4px solid var(--nxt1-color-bg-primary, #0a0a0a);

        @media (max-width: 768px) {
          width: 100px;
          height: 100px;
        }
      }

      .skeleton-info {
        flex: 1;
        padding-top: 70px;

        @media (max-width: 768px) {
          padding-top: 12px;
          width: 100%;
        }
      }

      .skeleton-name {
        height: 32px;
        width: 200px;
        margin-bottom: 8px;

        @media (max-width: 768px) {
          margin: 0 auto 8px;
        }
      }

      .skeleton-meta {
        height: 20px;
        width: 150px;
        margin-bottom: 16px;

        @media (max-width: 768px) {
          margin: 0 auto 16px;
        }
      }

      .skeleton-bio {
        height: 16px;
        width: 100%;
        max-width: 400px;
        margin-bottom: 8px;

        @media (max-width: 768px) {
          margin: 0 auto 8px;
        }
      }

      .skeleton-bio--short {
        width: 60%;
        margin-bottom: 20px;
      }

      .skeleton-actions {
        display: flex;
        gap: 12px;

        @media (max-width: 768px) {
          justify-content: center;
        }
      }

      .skeleton-btn {
        height: 40px;
        width: 120px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .skeleton-btn--secondary {
        width: 100px;
      }

      .skeleton-follow-stats {
        display: flex;
        gap: 24px;
        padding: 20px 24px;
        margin-top: 16px;

        @media (max-width: 768px) {
          justify-content: center;
        }
      }

      .skeleton-stat {
        height: 20px;
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSkeletonComponent {
  /** Skeleton variant */
  readonly variant = input<ProfileSkeletonVariant>('post');
}
