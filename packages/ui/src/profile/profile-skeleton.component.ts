/**
 * @fileoverview Profile Skeleton Component - Loading State
 * @module @nxt1/ui/profile
 * @version 2.0.0
 *
 * Pixel-perfect skeleton loading placeholder for Profile feature.
 * Matches the EXACT layout structure of profile-shell-web.component
 * for both desktop (Madden split layout) and mobile (hero + stacked).
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
            <div class="skeleton-banner skeleton-animate"></div>
            <div class="skeleton-header-content">
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
          <!-- ═══ DESKTOP: Madden Franchise split layout ═══ -->
          <div class="sk-web" aria-hidden="true">
            <div class="sk-stage">
              <!-- Halftone dots (decorative, matches real profile) -->
              <div class="sk-halftone"></div>

              <div class="sk-split">
                <!-- ═══ LEFT COLUMN ═══ -->
                <div class="sk-left">
                  <!-- Page Header: Back + Identity(Name+Follow) + Badges + XP ring (desktop only) -->
                  <!-- mirrors: .mdh-row → back, identity(name-row(name+follow) + subline), right(badges + xp) -->
                  <div class="sk-page-header">
                    <div class="sk-ph-row">
                      <!-- Back button -->
                      <div class="sk-ph-back skeleton-animate"></div>
                      <!-- Identity: Name row (name + follow) + subtitle -->
                      <div class="sk-ph-identity">
                        <div class="sk-ph-name-row">
                          <div class="sk-ph-name skeleton-animate"></div>
                          <div class="sk-ph-follow skeleton-animate"></div>
                        </div>
                        <div class="sk-ph-subtitle skeleton-animate"></div>
                      </div>
                      <!-- Right group: Badge shelf + XP ring -->
                      <div class="sk-ph-right">
                        <div class="sk-ph-badges">
                          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                            <div class="sk-ph-badge skeleton-animate"></div>
                          }
                        </div>
                        <div class="sk-ph-xp skeleton-animate"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Mobile Hero (mobile only) -->
                  <!-- mirrors: .madden-mobile-hero → grid(148px, 1fr) carousel | identity(name, meta, follow, stats) -->
                  <div class="sk-mobile-hero">
                    <!-- Left: Player image carousel -->
                    <div class="sk-mh-carousel skeleton-animate"></div>
                    <!-- Right: Identity -->
                    <div class="sk-mh-identity">
                      <div class="sk-mh-name skeleton-animate"></div>
                      <div class="sk-mh-meta skeleton-animate"></div>
                      <div class="sk-mh-follow skeleton-animate"></div>
                      <!-- Stats rows: Class, Height, Weight, Location -->
                      <div class="sk-mh-stats">
                        @for (i of [1, 2, 3, 4]; track i) {
                          <div class="sk-mh-stat-row">
                            <div class="sk-mh-stat-key skeleton-animate"></div>
                            <div class="sk-mh-stat-val skeleton-animate"></div>
                          </div>
                        }
                      </div>
                    </div>
                  </div>

                  <!-- Top Tab Bar (matches nxt1-option-scroller — pill buttons) -->
                  <div class="sk-top-tabs">
                    @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
                      <div class="sk-tab skeleton-animate"></div>
                    }
                  </div>

                  <!-- Content layer: Side nav column + main content scroll -->
                  <!-- mirrors: .madden-content-layer → grid(180px, 1fr) -->
                  <div class="sk-content-layer">
                    <!-- Side Nav Column (desktop: vertical sticky, mobile: display:contents → horizontal pills) -->
                    <!-- mirrors: .madden-side-nav-column → nxt1-section-nav-web -->
                    <div class="sk-side-nav-column">
                      <!-- Desktop: vertical nav items -->
                      <div class="sk-side-nav">
                        @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                          <div class="sk-side-item skeleton-animate"></div>
                        }
                      </div>
                      <!-- Mobile: horizontal pill strip (mirrors section-nav mobile) -->
                      <div class="sk-mobile-pills">
                        @for (i of [1, 2, 3, 4, 5]; track i) {
                          <div class="sk-mobile-pill skeleton-animate"></div>
                        }
                      </div>
                    </div>

                    <!-- Main Content Area (mirrors .madden-content-scroll) -->
                    <div class="sk-content">
                      <!-- Mobile Team Cards (mobile only, mirrors .ov-mobile-teams) -->
                      <div class="sk-mobile-teams">
                        <div class="sk-section-title skeleton-animate"></div>
                        <div class="sk-team-stack">
                          <div class="sk-team-card">
                            <div class="sk-team-logo skeleton-animate"></div>
                            <div class="sk-team-info">
                              <div class="sk-team-name skeleton-animate"></div>
                              <div class="sk-team-location skeleton-animate"></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- Section 1: Player Profile (key-value grid, desktop only) -->
                      <div class="sk-section sk-section--profile">
                        <div class="sk-section-title skeleton-animate"></div>
                        <div class="sk-profile-grid">
                          @for (i of [1, 2, 3, 4]; track i) {
                            <div class="sk-profile-row">
                              <div class="sk-profile-key skeleton-animate"></div>
                              <div class="sk-profile-val skeleton-animate"></div>
                            </div>
                          }
                        </div>
                      </div>

                      <!-- Section 2: Player Archetypes -->
                      <div class="sk-section">
                        <div class="sk-section-title skeleton-animate"></div>
                        <div class="sk-archetype-grid">
                          @for (i of [1, 2, 3]; track i) {
                            <div class="sk-archetype skeleton-animate"></div>
                          }
                        </div>
                      </div>

                      <!-- Section 3: Connected Accounts -->
                      <div class="sk-section">
                        <div class="sk-section-title skeleton-animate"></div>
                        <div class="sk-connected-grid">
                          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                            <div class="sk-connected-chip skeleton-animate"></div>
                          }
                        </div>
                        <div class="sk-connected-explainer skeleton-animate"></div>
                      </div>

                      <!-- Section 4: XP + Badges (visible both, matches .ov-mobile-xp-section) -->
                      <div class="sk-section sk-section--xp-badges">
                        <div class="sk-xp-ring skeleton-animate"></div>
                        <div class="sk-badge-grid">
                          @for (i of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; track i) {
                            <div class="sk-badge-orb skeleton-animate"></div>
                          }
                        </div>
                      </div>

                      <!-- Section 5: Last synced button -->
                      <div class="sk-section">
                        <div class="sk-sync-btn skeleton-animate"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ═══ RIGHT COLUMN (desktop only) ═══ -->
                <!-- mirrors: .madden-split-right → .madden-right-stack (300px, centered) -->
                <div class="sk-right">
                  <div class="sk-right-stack">
                    <!-- Action buttons: Share + QR Code (mirrors .right-action-grid 2-col) -->
                    <div class="sk-action-grid">
                      <div class="sk-action-btn skeleton-animate"></div>
                      <div class="sk-action-btn skeleton-animate"></div>
                    </div>

                    <!-- Player image carousel (mirrors .carousel-glow-wrap 56vh/18px radius) -->
                    <div class="sk-carousel skeleton-animate"></div>

                    <!-- Team cards (mirrors .madden-team-stack) -->
                    <div class="sk-team-stack">
                      <div class="sk-team-card">
                        <div class="sk-team-logo skeleton-animate"></div>
                        <div class="sk-team-info">
                          <div class="sk-team-name skeleton-animate"></div>
                          <div class="sk-team-location skeleton-animate"></div>
                        </div>
                      </div>
                      <div class="sk-team-card">
                        <div class="sk-team-logo skeleton-animate"></div>
                        <div class="sk-team-info">
                          <div class="sk-team-name skeleton-animate"></div>
                          <div class="sk-team-location skeleton-animate"></div>
                        </div>
                      </div>
                    </div>
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

      /* Skeleton animation */
      .skeleton-animate {
        background: linear-gradient(
          90deg,
          var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.04)) 0%,
          var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.08)) 50%,
          var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.04)) 100%
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

      @media (prefers-reduced-motion: reduce) {
        .skeleton-animate {
          animation: none;
          background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.04));
        }
      }

      /* ============================================
         HEADER SKELETON (header variant)
         ============================================ */

      .skeleton-header {
        position: relative;
      }

      .skeleton-banner {
        height: 200px;
        margin: 8px 16px 0;
        border-radius: 16px;
      }

      .skeleton-header-content {
        display: flex;
        flex-direction: column;
        padding: 16px 24px 0;
      }

      .skeleton-top-row {
        display: flex;
        align-items: flex-start;
        gap: 16px;
      }

      .skeleton-avatar-wrapper {
        position: relative;
        width: 120px;
        height: 120px;
        flex-shrink: 0;
      }

      .skeleton-avatar {
        width: 100%;
        height: 100%;
        border-radius: 50%;
      }

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

      .skeleton-name-section {
        flex: 1;
        min-width: 0;
        padding-top: 8px;
      }

      .skeleton-name {
        height: 32px;
        width: 200px;
        max-width: 100%;
        margin-bottom: 8px;
      }

      .skeleton-followers {
        height: 18px;
        width: 180px;
        max-width: 100%;
        margin-bottom: 8px;
      }

      .skeleton-sport {
        height: 18px;
        width: 150px;
        max-width: 100%;
      }

      .skeleton-details {
        padding: 12px 0 24px;
      }

      .skeleton-meta {
        height: 16px;
        width: 220px;
        max-width: 100%;
        margin-bottom: 12px;
      }

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

      .skeleton-actions {
        display: flex;
        gap: 12px;
        margin-top: 4px;
      }

      .skeleton-btn {
        height: 40px;
        width: 120px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      .skeleton-btn--secondary {
        width: 100px;
      }

      /* ============================================
         STATS BAR SKELETON (stats variant)
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
         POST SKELETON (post variant)
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
         OFFER SKELETON (offer variant)
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
         EVENT SKELETON (event variant)
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
         FULL PAGE SKELETON (full variant)
         ============================================ */

      .skeleton-posts-section {
        padding-top: 24px;
      }

      .skeleton-section-title {
        width: 120px;
        height: 24px;
        margin: 0 24px 16px;
      }

      /* ============================================
         WEB PROFILE SKELETON (web variant)
         Pixel-perfect match of profile-shell-web layout.

         Desktop: .madden-split → left (header/tabs/sidenav/content) + right (actions/carousel/teams)
         Mobile:  Mobile hero (carousel + identity) → tabs → sub-tabs → content (single column)

         Every dimension, gap, padding, and border-radius matches
         the real profile-shell-web.component.ts CSS exactly.
         ============================================ */

      .sk-web {
        --sk-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --sk-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --sk-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--sk-bg);
        width: 100%;
      }

      /* ─────── STAGE ─────── */
      /* mirrors: .madden-stage { height: calc(100vh - 64px); overflow: hidden } */
      .sk-stage {
        position: relative;
        height: calc(100vh - 64px);
        overflow: hidden;
      }

      /* Decorative halftone background (matches .stage-halftone-bg) */
      .sk-halftone {
        position: absolute;
        inset: 0;
        z-index: 1;
        opacity: 0.015;
        background-image: radial-gradient(circle, currentColor 1px, transparent 1px);
        background-size: 24px 24px;
        pointer-events: none;
      }

      /* ─────── SPLIT ─────── */
      /* mirrors: .madden-split { display: flex; height: 100% } */
      .sk-split {
        position: relative;
        z-index: 5;
        display: flex;
        height: 100%;
      }

      /* ─────── LEFT COLUMN ─────── */
      /* mirrors: .madden-split-left { flex:1; max-width: calc(100% - 380px); padding-left: 4px } */
      .sk-left {
        flex: 1;
        min-width: 0;
        max-width: calc(100% - 380px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding-left: 4px;
      }

      /* ═══════════════════════════════════════
         PAGE HEADER (desktop only)
         mirrors: .madden-header-top-pad { padding-top: 20px }
                  .mdh-row { display:flex; align-items:center; gap:12px; padding: 0 4px }
         ═══════════════════════════════════════ */
      .sk-page-header {
        padding-top: 20px;
      }

      .sk-ph-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        padding: 0 var(--nxt1-spacing-1, 4px);
      }

      /* Back button (mirrors nxt1-back-button md ghost) */
      .sk-ph-back {
        width: 36px;
        height: 36px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }

      /* Identity: mirrors .mdh-identity { flex:1 } → .mdh-name-block → .mdh-name-row + .mdh-subline */
      .sk-ph-identity {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5, 2px);
      }

      /* Name row: mirrors .mdh-name-row { display:flex; align-items:center; gap:12px } */
      .sk-ph-name-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        min-width: 0;
      }

      /* Name text: mirrors .mdh-last { font-size: 2xl ≈ 24-28px; font-weight: bold } */
      .sk-ph-name {
        height: 28px;
        width: 180px;
        max-width: 100%;
        border-radius: 6px;
      }

      /* Follow button inside name row: mirrors .mdh-follow-btn { padding:7px 16px; 8px radius } */
      .sk-ph-follow {
        width: 88px;
        height: 34px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }

      /* Subtitle: mirrors .mdh-first { font-size: base ≈ 16px } */
      .sk-ph-subtitle {
        height: 18px;
        width: 240px;
        max-width: 100%;
        border-radius: 4px;
      }

      /* Right group: mirrors .mdh-right { flex-shrink:0; display:flex; align-items:center; gap:12px; margin-left:auto } */
      .sk-ph-right {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        margin-left: auto;
      }

      /* Badge shelf: mirrors .mdh-badges { display:flex; gap:6px } */
      .sk-ph-badges {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5, 6px);
        flex-shrink: 0;
      }

      /* Individual badge: mirrors .mdh-badge { width:30px; height:30px; border-radius:8px } */
      .sk-ph-badge {
        width: 30px;
        height: 30px;
        border-radius: var(--nxt1-radius-md, 8px);
      }

      /* XP ring: mirrors .mdh-xp { width:104px; height:104px } */
      .sk-ph-xp {
        width: 104px;
        height: 104px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* ═══════════════════════════════════════
         MOBILE HERO (hidden on desktop, shown ≤768px)
         mirrors: .madden-mobile-hero { grid-template-columns: 148px minmax(0,1fr); gap:12px; margin:32px 12px 10px }
         ═══════════════════════════════════════ */
      .sk-mobile-hero {
        display: none; /* Hidden on desktop */
      }

      /* ═══════════════════════════════════════
         TOP TAB BAR
         mirrors: .madden-top-tabs { padding: 0 8px; padding-left: calc(var(--shell-content-padding-x,32px) - 4px); margin-top: -6px }
         ═══════════════════════════════════════ */
      .sk-top-tabs {
        display: flex;
        gap: 8px;
        padding: 0 8px;
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
        margin-top: -6px;
        overflow: hidden;
        flex-shrink: 0;
      }

      /* mirrors: .option-scroller__option { height: 36px } */
      .sk-tab {
        height: 36px;
        min-width: 64px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      /* Varying widths to look natural */
      .sk-tab:nth-child(1) {
        width: 92px;
      }
      .sk-tab:nth-child(2) {
        width: 80px;
      }
      .sk-tab:nth-child(3) {
        width: 72px;
      }
      .sk-tab:nth-child(4) {
        width: 64px;
      }
      .sk-tab:nth-child(5) {
        width: 76px;
      }
      .sk-tab:nth-child(6) {
        width: 68px;
      }
      .sk-tab:nth-child(7) {
        width: 84px;
      }

      /* ═══════════════════════════════════════
         CONTENT LAYER
         mirrors: .madden-content-layer { grid-template-columns: 180px minmax(0,1fr); gap:24px;
                   padding-top:8px; padding-left: calc(var(--shell-content-padding-x,32px) - 4px) }
         ═══════════════════════════════════════ */
      .sk-content-layer {
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        gap: var(--nxt1-spacing-6, 24px);
        padding-top: var(--nxt1-spacing-2, 8px);
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }

      /* ═══════════════════════════════════════
         SIDE NAV COLUMN (desktop: vertical, mobile: display:contents → horizontal pills)
         mirrors: .madden-side-nav-column { display:flex; flex-direction:column; gap:16px; overflow-y:auto }
         ═══════════════════════════════════════ */
      .sk-side-nav-column {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4, 16px);
        align-self: stretch;
        overflow-y: auto;
        scrollbar-width: none;
        padding-bottom: 120px;
      }

      .sk-side-nav-column::-webkit-scrollbar {
        display: none;
      }

      /* Desktop vertical nav: mirrors .section-nav (flex-direction:column; gap:2px; position:sticky; top:24px) */
      .sk-side-nav {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5, 2px);
        position: sticky;
        top: var(--nxt1-spacing-6, 24px);
      }

      /* Nav items: mirrors .nav-item { padding: 8px 12px; border-radius: 12px } */
      .sk-side-item {
        height: 38px;
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      /* Varying widths for natural look */
      .sk-side-item:nth-child(1) {
        width: 100%;
      }
      .sk-side-item:nth-child(2) {
        width: 85%;
      }
      .sk-side-item:nth-child(3) {
        width: 92%;
      }
      .sk-side-item:nth-child(4) {
        width: 70%;
      }
      .sk-side-item:nth-child(5) {
        width: 82%;
      }
      .sk-side-item:nth-child(6) {
        width: 76%;
      }

      /* Mobile pill strip — hidden on desktop, shown on mobile */
      .sk-mobile-pills {
        display: none;
      }

      /* ═══════════════════════════════════════
         MAIN CONTENT AREA
         mirrors: .madden-content-scroll { overflow-y:auto; padding: 0 12px 120px; align-items:center }
                  .madden-content-scroll > * { max-width: 660px }
         ═══════════════════════════════════════ */
      .sk-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 0 12px 120px;
        overflow: hidden;
        align-items: center;
      }

      .sk-content > * {
        width: 100%;
        max-width: 660px;
      }

      /* Mobile teams: hidden on desktop */
      .sk-mobile-teams {
        display: none;
      }

      /* ─── CONTENT SECTIONS ─── */
      .sk-section {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      /* section title: mirrors .ov-section-title { font-size:11px; letter-spacing:0.08em } */
      .sk-section-title {
        width: 140px;
        height: 14px;
        border-radius: 4px;
      }

      /* Player Profile: key-value grid (mirrors .ov-profile-grid) */
      .sk-profile-grid {
        display: flex;
        flex-direction: column;
        gap: 0;
      }

      /* mirrors: .ov-profile-row { display:flex; align-items:center; padding: 10px 0; border-bottom } */
      .sk-profile-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--sk-border);
      }

      .sk-profile-row:last-child {
        border-bottom: none;
      }

      /* mirrors: .ov-profile-key { min-width:80px; font-size:13px } */
      .sk-profile-key {
        width: 60px;
        height: 14px;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .sk-profile-val {
        width: 100px;
        height: 16px;
        border-radius: 4px;
      }

      /* Player Archetypes (mirrors .ov-archetype-badges { display:flex; flex-wrap:wrap; gap:12px }) */
      .sk-archetype-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      /* mirrors: .ov-archetype-badge { padding: 8px 18px; border-radius: 999px } */
      .sk-archetype {
        width: 140px;
        height: 38px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* Connected Accounts (mirrors .ov-connected-grid { display:flex; flex-wrap:wrap; gap:10px }) */
      .sk-connected-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      /* mirrors: .ov-connected-chip { padding:8px 14px; border-radius:999px } */
      .sk-connected-chip {
        width: 130px;
        height: 34px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* mirrors: .ov-connected-explainer { padding:14px; border-radius:12px } */
      .sk-connected-explainer {
        height: 42px;
        width: 100%;
        max-width: 480px;
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-top: 4px;
      }

      /* XP + Badges section (mirrors .ov-mobile-xp-section row layout) */
      .sk-section--xp-badges {
        flex-direction: row;
        align-items: center;
        gap: 12px;
        padding: 28px 0 14px;
      }

      /* mirrors: .ov-mobile-xp-ring { width: clamp(92px,28vw,112px) } */
      .sk-xp-ring {
        width: 100px;
        height: 100px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* mirrors: .ov-mobile-xp-badge-grid { display:flex; flex-wrap:wrap; gap:8px } */
      .sk-badge-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        flex: 1;
        min-width: 0;
        align-content: center;
      }

      /* mirrors: .ov-mobile-xp-badge-orb { width:38px; height:38px; border-radius:10px } */
      .sk-badge-orb {
        width: 38px;
        height: 38px;
        border-radius: 10px;
      }

      /* Last synced button */
      .sk-sync-btn {
        width: 100%;
        height: 54px;
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      /* ═══════════════════════════════════════
         RIGHT COLUMN (desktop only)
         mirrors: .madden-split-right { width:380px; flex-shrink:0; padding: 0 16px 12px 0 }
                  .madden-right-stack { width:300px; padding-top:20px; gap:12px }
         ═══════════════════════════════════════ */
      .sk-right {
        width: 380px;
        flex-shrink: 0;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 0 16px 12px 0;
        overflow: hidden;
      }

      .sk-right-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3, 12px);
        width: 300px;
        padding-top: 20px;
        padding-bottom: 12px;
      }

      /* Action buttons grid: mirrors .right-action-grid { grid-template-columns: 1fr 1fr; gap: 8px } */
      .sk-action-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
      }

      /* mirrors: .right-action-btn { padding: 12px 8px; border-radius: 12px; border: 1px solid } */
      .sk-action-btn {
        height: 56px;
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      /* Player image carousel: mirrors .carousel-glow-wrap { height:56vh; border-radius:18px } */
      .sk-carousel {
        width: 100%;
        height: 56vh;
        min-height: 360px;
        border-radius: 18px;
      }

      /* Team cards: mirrors .madden-team-stack { gap:8px } */
      .sk-team-stack {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: 100%;
      }

      /* mirrors: .madden-team-block { padding:12px 14px; border-radius:12px; border:1px solid; gap:12px } */
      .sk-team-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid var(--sk-border);
        background: var(--sk-surface);
      }

      /* mirrors: .madden-team-logo { width:44px; height:44px; border-radius:10px } */
      .sk-team-logo {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        flex-shrink: 0;
      }

      .sk-team-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      /* mirrors: .madden-team-name { font-size:14px; font-weight:700 } */
      .sk-team-name {
        width: 120px;
        height: 16px;
        border-radius: 4px;
      }

      /* mirrors: .madden-team-location { font-size:12px } */
      .sk-team-location {
        width: 80px;
        height: 12px;
        border-radius: 4px;
      }

      /* ============================================
         RESPONSIVE: ≤1024px (smaller right column)
         mirrors real profile @media (max-width: 1024px) exactly
         ============================================ */
      @media (max-width: 1024px) {
        /* mirrors: .madden-split-left { max-width: calc(100% - 280px) } */
        .sk-left {
          max-width: calc(100% - 280px);
        }

        /* mirrors: .madden-split-right { width: 280px } */
        .sk-right {
          width: 280px;
        }

        /* mirrors: .madden-right-stack { width: 240px } */
        .sk-right-stack {
          width: 240px;
        }

        /* mirrors: .mdh-xp { width: 88px; height: 88px } at this breakpoint */
        .sk-ph-xp {
          width: 88px;
          height: 88px;
        }

        /* mirrors: .mdh-badge smaller at this breakpoint */
        .sk-ph-badge {
          width: 26px;
          height: 26px;
        }

        /* mirrors: .madden-side-nav-column { width: 160px } */
        .sk-content-layer {
          grid-template-columns: 160px minmax(0, 1fr);
        }
      }

      /* ============================================
         RESPONSIVE: ≤768px (mobile layout)
         mirrors real profile @media (max-width: 768px) exactly:
         - Right column: hidden
         - Page header: hidden (shell top nav handles navigation)
         - Mobile hero: shown (grid 148px / 1fr)
         - Content layer: single column
         - Side nav column: display:contents → section-nav-web becomes horizontal pills
         ============================================ */
      @media (max-width: 768px) {
        /* mirrors: .madden-stage { height:auto; overflow:visible } */
        .sk-stage {
          height: auto;
          min-height: 100vh;
          overflow: visible;
        }

        /* mirrors: .madden-split { height:auto } */
        .sk-split {
          height: auto;
        }

        /* mirrors: .madden-split-left { max-width:100%; overflow:visible } */
        .sk-left {
          max-width: 100%;
          overflow: visible;
          padding-left: 0;
        }

        /* mirrors: .madden-split-right { display:none } */
        .sk-right {
          display: none;
        }

        /* mirrors: page header hidden on mobile (shell top nav handles navigation) */
        .sk-page-header {
          display: none;
        }

        /* ─── MOBILE HERO (shown on mobile) ─── */
        /* mirrors: .madden-mobile-hero { display:grid; grid-template-columns:148px minmax(0,1fr); gap:12px; margin:32px 12px 10px } */
        .sk-mobile-hero {
          display: grid;
          grid-template-columns: 148px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
          margin: 32px 12px 10px;
        }

        /* mirrors: .madden-mobile-hero__carousel { width:148px } → .carousel-glow-wrap { height:228px; border-radius:14px } */
        .sk-mh-carousel {
          width: 148px;
          height: 228px;
          border-radius: 14px;
        }

        /* mirrors: .madden-mobile-hero__identity { display:flex; flex-direction:column; gap:5px; padding-top:2px } */
        .sk-mh-identity {
          display: flex;
          flex-direction: column;
          gap: 5px;
          padding-top: 2px;
          min-width: 0;
        }

        /* mirrors: .madden-mobile-hero__name { font-size:22px; font-weight:800; line-height:1.12 } */
        .sk-mh-name {
          height: 26px;
          width: 140px;
          max-width: 100%;
          border-radius: 4px;
        }

        /* mirrors: .madden-mobile-hero__meta { font-size:14px; font-weight:600 } */
        .sk-mh-meta {
          height: 18px;
          width: 80px;
          max-width: 100%;
          border-radius: 4px;
        }

        /* mirrors: .madden-mobile-hero__follow-btn { padding:7px 16px; border-radius:8px; margin-top:6px } */
        .sk-mh-follow {
          height: 34px;
          width: 88px;
          border-radius: var(--nxt1-radius-md, 8px);
          margin-top: 6px;
        }

        /* mirrors: .madden-mobile-hero__stats { display:flex; flex-direction:column; margin-top:8px } */
        .sk-mh-stats {
          display: flex;
          flex-direction: column;
          margin-top: 8px;
        }

        /* mirrors: .mobile-hero-stat { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom } */
        .sk-mh-stat-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid var(--sk-border);
        }

        .sk-mh-stat-row:last-child {
          border-bottom: none;
        }

        /* mirrors: .mobile-hero-stat__key { font-size:13px; min-width:50px } */
        .sk-mh-stat-key {
          width: 50px;
          height: 14px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        /* mirrors: .mobile-hero-stat__val { font-size:14px; font-weight:700 } */
        .sk-mh-stat-val {
          width: 60px;
          height: 16px;
          border-radius: 3px;
        }

        /* Top tabs: reduce left padding (mirrors real profile mobile) */
        .sk-top-tabs {
          padding-left: 8px;
        }

        /* ─── CONTENT LAYER: single column ─── */
        /* mirrors: .madden-content-layer { grid-template-columns:1fr; gap:16px; padding-top:12px; padding-left:0 } */
        .sk-content-layer {
          display: flex;
          flex-direction: column;
          gap: var(--nxt1-spacing-4, 16px);
          padding-top: 12px;
          padding-left: 0;
          min-height: auto;
          overflow: visible;
        }

        /* ─── SIDE NAV COLUMN: display:contents on mobile ─── */
        /* mirrors: .madden-side-nav-column { display:contents } */
        .sk-side-nav-column {
          display: contents;
          padding-bottom: 0;
        }

        /* Desktop vertical nav hidden on mobile */
        .sk-side-nav {
          display: none;
        }

        /* Mobile pill strip shown — matches section-nav-web mobile rendering */
        /* mirrors: .madden-side-nav-column ::ng-deep .section-nav { flex-direction:row; gap:4px; ... }
                    .madden-side-nav-column ::ng-deep .nav-item { padding:6px 10px; font-size:11px; border-radius:999px } */
        .sk-mobile-pills {
          display: flex;
          gap: 4px;
          padding: 0 12px 10px;
          overflow: hidden;
          order: 0;
          width: calc(100% - 24px);
          margin-inline: 12px;
        }

        .sk-mobile-pill {
          height: 30px;
          border-radius: var(--nxt1-radius-full, 9999px);
          flex-shrink: 0;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
        }

        .sk-mobile-pill:nth-child(1) {
          width: 100px;
        }
        .sk-mobile-pill:nth-child(2) {
          width: 80px;
        }
        .sk-mobile-pill:nth-child(3) {
          width: 96px;
        }
        .sk-mobile-pill:nth-child(4) {
          width: 72px;
        }
        .sk-mobile-pill:nth-child(5) {
          width: 84px;
        }

        /* Content scroll on mobile */
        /* mirrors: .madden-content-scroll { order:1; padding: 0 12px 24px; max-width:none } */
        .sk-content {
          order: 1;
          padding: 0 12px 24px;
          overflow: visible;
        }

        .sk-content > * {
          max-width: none;
        }

        /* Mobile team cards — shown on mobile (mirrors .ov-mobile-teams { display:block }) */
        .sk-mobile-teams {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
        }

        /* Smaller team cards on mobile (mirrors .ov-mobile-teams .madden-team-block { padding:10px 12px; gap:10px } ) */
        .sk-mobile-teams .sk-team-card {
          padding: 10px 12px;
          border-radius: 10px;
          gap: 10px;
        }

        .sk-mobile-teams .sk-team-logo {
          width: 36px;
          height: 36px;
          border-radius: 8px;
        }

        .sk-mobile-teams .sk-team-name {
          width: 100px;
          height: 14px;
        }

        .sk-mobile-teams .sk-team-location {
          width: 70px;
          height: 10px;
        }

        /* Player Profile grid hidden on mobile (data shown in mobile hero stats) */
        /* mirrors: .ov-section--player-stats { display:none } */
        .sk-section--profile {
          display: none;
        }

        /* XP section adjustments */
        .sk-xp-ring {
          width: clamp(92px, 28vw, 112px);
          height: clamp(92px, 28vw, 112px);
        }

        /* Archetype badges smaller on mobile (mirrors .ov-archetype-badge { padding:7px 14px }) */
        .sk-archetype {
          width: 120px;
          height: 34px;
        }

        /* Connected chips smaller on mobile */
        .sk-connected-chip {
          width: 110px;
          height: 30px;
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
