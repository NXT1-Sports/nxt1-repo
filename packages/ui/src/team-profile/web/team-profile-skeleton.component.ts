/**
 * @fileoverview Team Profile Skeleton Component — Loading State
 * @module @nxt1/ui/team-profile/web
 * @version 1.0.0
 *
 * Pixel-perfect skeleton loading placeholder for the Team Profile feature.
 * Uses canonical NXT1 skeleton design tokens and animation pattern.
 *
 * Layout mirrors `team-profile-shell-web.component.ts` Madden Franchise
 * split layout exactly:
 *
 * Desktop: Page Header → Top Tabs → Side Nav + Content | Right Panel (Image + Org Card)
 * Mobile:  Mobile Hero → Top Tabs → Section Pills → Content
 *
 * Design tokens:
 * - `--nxt1-color-loading-skeleton`       — Base skeleton background
 * - `--nxt1-color-loading-skeletonShimmer` — Shimmer highlight
 * - `skeleton-shimmer` animation           — 1.5s infinite ease-in-out
 *
 * ⭐ WEB ONLY — SSR-safe, design-token-based ⭐
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'nxt1-team-profile-skeleton',
  standalone: true,
  imports: [],
  template: `
    <div class="sk-web" aria-hidden="true">
      <div class="sk-stage">
        <div class="sk-split">
          <!-- ═══ LEFT COLUMN ═══ -->
          <div class="sk-left">
            <!-- Desktop Page Header: Back + Logo + Team Name + Subtitle + Follow Stats -->
            <!-- mirrors: nxt1-team-page-header → nxt1-entity-page-header layout -->
            <div class="sk-page-header">
              <div class="sk-ph-row">
                <!-- Back button -->
                <div class="sk-ph-back skeleton-animate"></div>
                <!-- Logo -->
                <div class="sk-ph-logo skeleton-animate"></div>
                <!-- Identity: Team name + subtitle -->
                <div class="sk-ph-identity">
                  <div class="sk-ph-name skeleton-animate"></div>
                  <div class="sk-ph-subtitle skeleton-animate"></div>
                </div>
              </div>
            </div>

            <!-- Mobile Hero (mobile only) -->
            <!-- mirrors: nxt1-team-mobile-hero: logo(68x68) + name h1 + meta p -->
            <div class="sk-mobile-hero">
              <div class="sk-mh-inner">
                <div class="sk-mh-logo skeleton-animate"></div>
                <div class="sk-mh-text">
                  <div class="sk-mh-name skeleton-animate"></div>
                  <div class="sk-mh-meta skeleton-animate"></div>
                </div>
              </div>
            </div>

            <!-- Top Tab Bar (matches nxt1-option-scroller pill buttons) -->
            <div class="sk-top-tabs">
              @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
                <div class="sk-tab skeleton-animate"></div>
              }
            </div>

            <!-- Content Layer: Side nav + main content -->
            <!-- mirrors: .madden-content-layer → grid(180px, 1fr) -->
            <div class="sk-content-layer">
              <!-- Side Nav Column (desktop: vertical sticky, mobile: horizontal pills) -->
              <div class="sk-side-nav-column">
                <!-- Desktop: vertical nav items -->
                <div class="sk-side-nav">
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div class="sk-side-item skeleton-animate"></div>
                  }
                </div>
                <!-- Mobile: horizontal pill strip -->
                <div class="sk-mobile-pills">
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div class="sk-mobile-pill skeleton-animate"></div>
                  }
                </div>
              </div>

              <!-- Main Content Area (mirrors .madden-content-scroll) -->
              <div class="sk-content">
                <!-- Section: About / Key-Value grid -->
                <div class="sk-section">
                  <div class="sk-section-title skeleton-animate"></div>
                  <div class="sk-kv-grid">
                    @for (i of [1, 2, 3, 4]; track i) {
                      <div class="sk-kv-row">
                        <div class="sk-kv-key skeleton-animate"></div>
                        <div class="sk-kv-val skeleton-animate"></div>
                      </div>
                    }
                  </div>
                </div>

                <!-- Section: Staff cards -->
                <div class="sk-section">
                  <div class="sk-section-title skeleton-animate"></div>
                  <div class="sk-staff-grid">
                    @for (i of [1, 2]; track i) {
                      <div class="sk-staff-card">
                        <div class="sk-staff-avatar skeleton-animate"></div>
                        <div class="sk-staff-info">
                          <div class="sk-staff-name skeleton-animate"></div>
                          <div class="sk-staff-role skeleton-animate"></div>
                        </div>
                      </div>
                    }
                  </div>
                </div>

                <!-- Section: Content cards -->
                <div class="sk-section">
                  <div class="sk-section-title skeleton-animate"></div>
                  <div class="sk-card-stack">
                    @for (i of [1, 2, 3]; track i) {
                      <div class="sk-card skeleton-animate"></div>
                    }
                  </div>
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

              <!-- Team image carousel (mirrors .carousel-glow-wrap 56vh/18px radius) -->
              <div class="sk-carousel skeleton-animate"></div>

              <!-- Organization card (mirrors .madden-team-block) -->
              <div class="sk-org-card">
                <div class="sk-org-logo skeleton-animate"></div>
                <div class="sk-org-info">
                  <div class="sk-org-name skeleton-animate"></div>
                  <div class="sk-org-location skeleton-animate"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         TEAM PROFILE SKELETON — Loading State
         2026 Theme-Aware Design Tokens
         ============================================ */

      :host {
        display: block;
      }

      /* ─── Canonical Skeleton Animation ─── */
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
         WEB (Madden Franchise Split Layout)
         ============================================ */

      .sk-web {
        padding: 0;
      }

      .sk-stage {
        position: relative;
        min-height: calc(100vh - 64px);
        overflow: hidden;
      }

      .sk-split {
        position: relative;
        display: flex;
        height: 100%;
      }

      /* ─── LEFT COLUMN ─── */
      .sk-left {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        max-width: calc(100% - 380px);
        padding-left: 4px;
      }

      /* ─── DESKTOP PAGE HEADER ─── */
      /* mirrors: nxt1-entity-page-header row layout + team identity */
      .sk-page-header {
        padding: 20px 24px 12px calc(var(--shell-content-padding-x, 32px));
      }

      .sk-ph-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .sk-ph-back {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .sk-ph-logo {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        flex-shrink: 0;
      }

      .sk-ph-identity {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .sk-ph-name {
        width: 220px;
        height: 24px;
        border-radius: 6px;
      }

      .sk-ph-subtitle {
        width: 300px;
        height: 14px;
        border-radius: 4px;
      }

      .sk-ph-trailing {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4, 16px);
        flex-shrink: 0;
        margin-left: auto;
      }

      .sk-ph-stat {
        width: 56px;
        height: 36px;
        border-radius: 8px;
      }

      /* ─── MOBILE HERO (mobile only) ─── */
      /* mirrors: .team-mobile-hero__identity-card { display:flex; align-items:flex-start; gap:12px } */
      .sk-mobile-hero {
        display: none;
        padding: 0;
      }

      .sk-mh-inner {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .sk-mh-logo {
        width: 68px;
        height: 68px;
        border-radius: 12px;
        flex-shrink: 0;
      }

      /* mirrors: .team-mobile-hero__identity-copy { display:flex; flex-direction:column; gap:5px; padding-top:2px } */
      .sk-mh-text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding-top: 2px;
      }

      /* mirrors: .team-mobile-hero__name { font-size:22px; font-weight:800; line-height:1.12 } */
      .sk-mh-name {
        width: 160px;
        height: 26px;
        border-radius: 4px;
      }

      /* mirrors: .team-mobile-hero__meta { font-size:14px; font-weight:600 } */
      .sk-mh-meta {
        width: 110px;
        height: 16px;
        border-radius: 3px;
      }

      /* ─── TOP TAB BAR ─── */
      /* mirrors: .madden-top-tabs padding + nxt1-option-scroller pills */
      .sk-top-tabs {
        display: flex;
        gap: 8px;
        padding: 12px 8px 0;
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
        overflow: hidden;
      }

      .sk-tab {
        height: 36px;
        min-width: 64px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      /* Varying widths for natural look (mirrors real tab label lengths) */
      .sk-tab:nth-child(1) {
        width: 92px;
      } /* Overview */
      .sk-tab:nth-child(2) {
        width: 80px;
      } /* Timeline */
      .sk-tab:nth-child(3) {
        width: 72px;
      } /* Videos */
      .sk-tab:nth-child(4) {
        width: 68px;
      } /* Roster */
      .sk-tab:nth-child(5) {
        width: 84px;
      } /* Schedule */
      .sk-tab:nth-child(6) {
        width: 60px;
      } /* Stats */
      .sk-tab:nth-child(7) {
        width: 64px;
      } /* News */

      /* ─── CONTENT LAYER ─── */
      /* mirrors: .madden-content-layer → grid(180px, 1fr) */
      .sk-content-layer {
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        gap: var(--nxt1-spacing-6, 24px);
        flex: 1;
        min-height: 0;
        padding-top: var(--nxt1-spacing-2, 8px);
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
      }

      /* ─── Side Nav Column ─── */
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

      .sk-side-nav {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0-5, 2px);
        position: sticky;
        top: var(--nxt1-spacing-6, 24px);
      }

      .sk-side-item {
        height: 38px;
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      /* Varying widths for natural look */
      .sk-side-item:nth-child(1) {
        width: 100%;
      }
      .sk-side-item:nth-child(2) {
        width: 82%;
      }
      .sk-side-item:nth-child(3) {
        width: 92%;
      }
      .sk-side-item:nth-child(4) {
        width: 76%;
      }
      .sk-side-item:nth-child(5) {
        width: 86%;
      }

      .sk-mobile-pills {
        display: none;
        gap: 8px;
        overflow: hidden;
      }

      .sk-mobile-pill {
        height: 30px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
      }

      /* Varying widths for natural look */
      .sk-mobile-pill:nth-child(1) {
        width: 96px;
      }
      .sk-mobile-pill:nth-child(2) {
        width: 72px;
      }
      .sk-mobile-pill:nth-child(3) {
        width: 100px;
      }
      .sk-mobile-pill:nth-child(4) {
        width: 80px;
      }
      .sk-mobile-pill:nth-child(5) {
        width: 88px;
      }

      /* ─── Main Content Area ─── */
      /* mirrors: .madden-content-scroll center-aligned with max-width */
      .sk-content {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-6, 24px);
        padding: 0 12px 120px;
        align-items: center;
      }

      .sk-content > * {
        width: 100%;
        max-width: 660px;
      }

      .sk-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .sk-section-title {
        width: 120px;
        height: 16px;
        border-radius: 4px;
      }

      /* Key-Value Grid (About section) */
      .sk-kv-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sk-kv-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .sk-kv-key {
        width: 80px;
        height: 14px;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .sk-kv-val {
        width: 160px;
        height: 14px;
        border-radius: 4px;
      }

      /* Staff Cards */
      .sk-staff-grid {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sk-staff-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .sk-staff-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .sk-staff-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .sk-staff-name {
        width: 120px;
        height: 14px;
        border-radius: 4px;
      }

      .sk-staff-role {
        width: 80px;
        height: 12px;
        border-radius: 3px;
      }

      /* Content Cards */
      .sk-card-stack {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .sk-card {
        height: 72px;
        border-radius: 12px;
      }

      /* ─── RIGHT COLUMN (desktop only) ─── */
      /* mirrors: .madden-split-right + .madden-right-stack */
      .sk-right {
        flex-shrink: 0;
        width: 380px;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 0 16px 12px 0;
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

      /* Action Grid: Share + QR Code */
      .sk-action-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2, 8px);
        width: 100%;
      }

      .sk-action-btn {
        height: 56px;
        border-radius: var(--nxt1-radius-lg, 12px);
      }

      /* Team Image Carousel */
      .sk-carousel {
        width: 100%;
        height: 56vh;
        min-height: 360px;
        border-radius: 18px;
      }

      /* Organization Card */
      .sk-org-card {
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }

      .sk-org-logo {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        flex-shrink: 0;
      }

      .sk-org-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .sk-org-name {
        width: 140px;
        height: 14px;
        border-radius: 4px;
      }

      .sk-org-location {
        width: 100px;
        height: 12px;
        border-radius: 3px;
      }

      /* ═══ RESPONSIVE ═══ */
      @media (max-width: 1024px) {
        .sk-left {
          max-width: calc(100% - 280px);
        }
        .sk-right {
          width: 280px;
        }
        .sk-right-stack {
          width: 240px;
        }
        .sk-content-layer {
          grid-template-columns: 160px minmax(0, 1fr);
        }
      }

      @media (max-width: 768px) {
        /* Show mobile hero, hide desktop header */
        .sk-page-header {
          display: none;
        }
        .sk-mobile-hero {
          display: block;
          margin: 0 0 10px;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          padding: 14px 16px;
        }
        .sk-mobile-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            repeating-linear-gradient(
              -52deg,
              transparent 0 18px,
              color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 7%, transparent) 18px 19.5px,
              transparent 19.5px 44px
            ),
            radial-gradient(
              ellipse 80% 60% at -4% -8%,
              color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 22%, transparent) 0%,
              color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 8%, transparent) 38%,
              transparent 68%
            ),
            radial-gradient(
              ellipse 110% 55% at 50% 108%,
              color-mix(in srgb, var(--nxt1-color-primary, #d4ff00) 10%, transparent) 0%,
              transparent 60%
            ),
            linear-gradient(
              160deg,
              var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.07)) 0%,
              var(--nxt1-color-bg-primary, #0a0a0a) 100%
            );
          box-shadow: 0 2px 24px rgba(0, 0, 0, 0.45);
        }

        /* Hide right column */
        .sk-right {
          display: none;
        }

        /* Full width left */
        .sk-left {
          max-width: 100%;
        }

        /* Tabs & content adjustments */
        .sk-top-tabs {
          padding-left: 8px;
        }

        .sk-content-layer {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--nxt1-spacing-4, 16px);
          padding-top: 12px;
          padding-left: 0;
        }

        /* Side nav becomes horizontal pills on mobile */
        .sk-side-nav-column {
          display: contents;
        }
        .sk-side-nav {
          display: none;
        }
        .sk-mobile-pills {
          display: flex;
          order: 0;
          width: calc(100% - 24px);
          margin-inline: 12px;
        }

        .sk-content {
          order: 1;
          padding: 0 12px 24px;
          align-items: stretch;
        }
        .sk-content > * {
          max-width: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamProfileSkeletonComponent {}
