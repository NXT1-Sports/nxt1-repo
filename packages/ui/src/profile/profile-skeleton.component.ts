/**
 * @fileoverview Profile Skeleton Component — Loading State
 * @module @nxt1/ui/profile
 * @version 3.0.0
 *
 * Pixel-perfect skeleton loading placeholders for the Profile feature.
 *
 * Variants:
 * - `'full'`  — Mobile (Ionic) profile: hero → tabs → section pills → content.
 *              Matches `profile-shell.component.ts` layout exactly.
 * - `'web'`   — Desktop Madden split layout + responsive mobile breakpoint.
 *              Matches `profile-shell-web.component.ts` layout exactly.
 * - `'post'`  — Single post card skeleton (used inside timeline tab).
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';

/** Available skeleton layout variants. */
export type ProfileSkeletonVariant = 'post' | 'full' | 'web';

@Component({
  selector: 'nxt1-profile-skeleton',
  standalone: true,
  template: `
    <div class="profile-skeleton" [class]="'profile-skeleton--' + variant()">
      @switch (variant()) {
        @case ('post') {
          <!-- Mirrors FeedCardShellComponent hideAuthor=true layout exactly:
               card shell (border+radius+glass) → lead media → meta-bar → content → 2-col stats -->
          <div class="skeleton-post">
            <!-- Lead media (full-bleed, top-corner-rounded like .feed-shell__lead) -->
            <div class="skeleton-post-lead skeleton-animate"></div>
            <!-- Meta-bar: type badge pill + time gap | menu dot (mirrors .feed-shell__meta-bar) -->
            <div class="skeleton-post-meta-bar">
              <div class="skeleton-post-meta-bar__left">
                <div class="skeleton-post-badge skeleton-animate"></div>
                <div class="skeleton-post-time skeleton-animate"></div>
              </div>
              <div class="skeleton-post-menu skeleton-animate"></div>
            </div>
            <!-- Content area (mirrors .feed-shell__content padding: 12px 16px) -->
            <div class="skeleton-post-content">
              <div class="skeleton-post-content-line skeleton-animate"></div>
              <div
                class="skeleton-post-content-line skeleton-post-content-line--short skeleton-animate"
              ></div>
            </div>
            <!-- Stats bar: 2-col grid mirroring .feed-shell__stats -->
            <div class="skeleton-post-stats">
              <div class="skeleton-post-stat skeleton-animate"></div>
              <div class="skeleton-post-stat skeleton-animate"></div>
            </div>
          </div>
        }

        @case ('full') {
          <!-- ═══ MOBILE PROFILE SKELETON ═══ -->
          <!-- Matches profile-shell.component (Ionic) mobile layout exactly:
               Mobile Hero → Top Tabs → Section Nav Pills → Content Sections -->
          <div class="sk-mobile" aria-hidden="true">
            <!-- ═══ MOBILE HERO: Avatar ring + NxtEntityHero identity ═══ -->
            <!-- mirrors: madden-mobile-hero — full-width block layout -->
            <div class="sk-hero">
              <!-- entity-hero identity card -->
              <!-- mirrors: nxt1-entity-hero — avatar-ring + name-row + badge-row + chips -->
              <div class="sk-hero__identity">
                <div class="sk-hero__name skeleton-animate"></div>
                <div class="sk-hero__chip skeleton-animate"></div>
                <div class="sk-hero__chips">
                  @for (i of [1, 2, 3]; track i) {
                    <div class="sk-hero__chip-item skeleton-animate"></div>
                  }
                </div>
              </div>
            </div>

            <!-- ═══ TOP TABS (Overview, Timeline, Videos, News …) ═══ -->
            <!-- mirrors: nxt1-option-scroller pills -->
            <div class="sk-tabs">
              @for (i of [1, 2, 3, 4, 5, 6, 7]; track i) {
                <div class="sk-tabs__pill skeleton-animate"></div>
              }
            </div>
          </div>
        }

        @case ('web') {
          <!-- ═══ DESKTOP: Madden Franchise split layout ═══ -->
          <div class="sk-web" aria-hidden="true">
            <div class="sk-stage">
              <div class="sk-split">
                <!-- ═══ LEFT COLUMN ═══ -->
                <div class="sk-left">
                  <!-- Page Header: Back + Identity(Name+Subtitle) + Edit Profile Button (desktop only) -->
                  <!-- mirrors: nxt1-entity-page-header → back, identity(name + subline), trailing(edit-btn) -->
                  <div class="sk-page-header">
                    <div class="sk-ph-row">
                      <!-- Back button -->
                      <div class="sk-ph-back skeleton-animate"></div>
                      <!-- Identity: Name + subtitle -->
                      <div class="sk-ph-identity">
                        <div class="sk-ph-name skeleton-animate"></div>
                        <div class="sk-ph-subtitle skeleton-animate"></div>
                      </div>
                      <!-- Trailing: Edit Profile button (own profile) -->
                      <div class="sk-ph-trailing">
                        <div class="sk-ph-edit skeleton-animate"></div>
                      </div>
                    </div>
                  </div>

                  <!-- Mobile Hero (mobile only) -->
                  <!-- mirrors: .madden-mobile-hero — full-width block layout -->
                  <div class="sk-mobile-hero">
                    <!-- Identity (mirrors nxt1-entity-hero) -->
                    <div class="sk-mh-identity">
                      <div class="sk-mh-name skeleton-animate"></div>
                      <!-- position chip: mirrors .eh__position-chip { height:22px; border-radius:6px } -->
                      <div class="sk-mh-chip skeleton-animate"></div>
                      <!-- meta chips: mirrors .eh__chips .eh__chip { height:~26px; border-radius:99px } -->
                      <div class="sk-mh-chips">
                        @for (i of [1, 2, 3]; track i) {
                          <div class="sk-mh-chip-item skeleton-animate"></div>
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

      /* Skeleton animation — uses shared --nxt1-skeleton-gradient token (defined in
         @nxt1/ui/styles/base/skeleton.css). The gradient and keyframe are the single
         source of truth; we reference them here via the token + fallback. */
      .skeleton-animate {
        background: var(
          --nxt1-skeleton-gradient,
          linear-gradient(
            90deg,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 25%,
            var(--nxt1-color-loading-skeletonShimmer, rgba(255, 255, 255, 0.15)) 50%,
            var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08)) 75%
          )
        );
        background-size: 200% 100%;
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
        border-radius: var(--nxt1-radius-sm, 4px);
      }

      @media (prefers-reduced-motion: reduce) {
        .skeleton-animate {
          animation: none;
          background: var(--nxt1-color-loading-skeleton, rgba(255, 255, 255, 0.08));
        }
      }

      /* ============================================
         POST SKELETON (post variant)
         ============================================ */

      /* ============================================
         POST SKELETON (post variant)
         Mirrors FeedCardShellComponent hideAuthor=true layout:
           .feed-shell (border-radius:16px, border, glass bg, padding:0)
             .feed-shell__lead (top-rounded media)
             .feed-shell__meta-bar (padding:10px 14px 0) [type badge + time | menu]
             .feed-shell__content (padding:12px 16px)
             .feed-shell__stats (grid repeat(2,1fr), padding:10px 16px, border-top)
         ============================================ */

      .skeleton-post {
        padding: 0;
        border-radius: var(--nxt1-radius-lg, 16px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-glass-bg, rgba(20, 20, 20, 0.88));
        overflow: hidden;
        margin-bottom: 12px;
      }

      /* Lead media — mirrors .feed-shell__lead (top-corner-rounded, full-bleed) */
      .skeleton-post-lead {
        height: 200px;
        border-radius: var(--nxt1-radius-lg, 16px) var(--nxt1-radius-lg, 16px) 0 0;
        width: 100%;
      }

      /* Meta-bar — mirrors .feed-shell__meta-bar (padding:10px 14px 0) */
      .skeleton-post-meta-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 0;
        gap: 8px;
      }

      .skeleton-post-meta-bar__left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Type badge pill — mirrors .feed-shell__type-badge */
      .skeleton-post-badge {
        width: 64px;
        height: 22px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* Time label — mirrors .feed-shell__time (font-size:12px) */
      .skeleton-post-time {
        width: 48px;
        height: 12px;
        border-radius: 4px;
      }

      /* Menu dot — mirrors .feed-shell__menu-btn (32×32) */
      .skeleton-post-menu {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* Content area — mirrors .feed-shell__content (padding:12px 16px) */
      .skeleton-post-content {
        padding: 12px 16px;
      }

      .skeleton-post-content-line {
        height: 14px;
        border-radius: 4px;
        margin-bottom: 8px;
      }

      .skeleton-post-content-line:last-child {
        margin-bottom: 0;
      }

      .skeleton-post-content-line--short {
        width: 65%;
      }

      /* Stats bar — mirrors .feed-shell__stats (grid 2-col, padding:10px 16px, border-top) */
      .skeleton-post-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        padding: 10px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        gap: 8px;
      }

      .skeleton-post-stat {
        height: 20px;
        border-radius: 4px;
      }

      /* ============================================
         FULL PAGE SKELETON (full variant) — Mobile Profile
         Matches profile-shell.component mobile layout:
         Hero → Tabs → Section Pills → Content Sections
         Every dimension matches the real mobile profile CSS.
         ============================================ */

      .sk-mobile {
        padding-bottom: 120px;
      }

      /* ─── MOBILE HERO ─── */
      /* mirrors: .madden-mobile-hero — full-width section with sporty background */
      .sk-hero {
        display: block;
        margin: 0 0 10px;
        position: relative;
        isolation: isolate;
        overflow: hidden;
        padding: 14px 16px;
      }

      /* ── Sporty background (matches .madden-mobile-hero::before) ── */
      .sk-hero::before {
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

      /* mirrors: .eh { display:flex; gap:14px; align-items:center; padding:6px 0 12px } */
      .sk-hero__identity {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 6px;
        min-width: 0;
        align-self: center;
      }

      /* mirrors: .eh__name { font-size:1.5rem; font-weight:800; line-height:1.08 } */
      .sk-hero__name {
        height: 26px;
        width: 140px;
        max-width: 100%;
        border-radius: 4px;
      }

      /* mirrors: .eh__position-chip { height:22px; padding:0 9px; border-radius:6px } */
      .sk-hero__chip {
        height: 22px;
        width: 52px;
        border-radius: 6px;
      }

      /* mirrors: .eh__chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:2px } */
      .sk-hero__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-top: 2px;
      }

      /* mirrors: .eh__chip { height approx 26px; padding:4px 10px 4px 8px; border-radius:99px } */
      .sk-hero__chip-item {
        height: 26px;
        border-radius: 99px;
      }
      .sk-hero__chip-item:nth-child(1) {
        width: 90px;
      }
      .sk-hero__chip-item:nth-child(2) {
        width: 110px;
      }
      .sk-hero__chip-item:nth-child(3) {
        width: 100px;
      }

      /* ─── TOP TABS ─── */
      /* mirrors: nxt1-option-scroller pill row */
      .sk-tabs {
        display: flex;
        gap: 8px;
        padding: 0 12px;
        overflow: hidden;
        margin-top: 4px;
      }

      .sk-tabs__pill {
        height: 36px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
      }

      /* Varying widths for natural look */
      .sk-tabs__pill:nth-child(1) {
        width: 92px;
      }
      .sk-tabs__pill:nth-child(2) {
        width: 80px;
      }
      .sk-tabs__pill:nth-child(3) {
        width: 72px;
      }
      .sk-tabs__pill:nth-child(4) {
        width: 64px;
      }
      .sk-tabs__pill:nth-child(5) {
        width: 76px;
      }
      .sk-tabs__pill:nth-child(6) {
        width: 68px;
      }
      .sk-tabs__pill:nth-child(7) {
        width: 84px;
      }

      /* ─── SECTION NAV PILLS ─── */
      /* mirrors: nxt1-section-nav-web mobile pill strip */
      .sk-section-pills {
        display: flex;
        gap: 4px;
        padding: 10px 12px;
        overflow: hidden;
      }

      .sk-section-pills__pill {
        height: 30px;
        border-radius: var(--nxt1-radius-full, 9999px);
        flex-shrink: 0;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(255, 255, 255, 0.04);
      }

      .sk-section-pills__pill:nth-child(1) {
        width: 100px;
      }
      .sk-section-pills__pill:nth-child(2) {
        width: 80px;
      }
      .sk-section-pills__pill:nth-child(3) {
        width: 96px;
      }
      .sk-section-pills__pill:nth-child(4) {
        width: 72px;
      }
      .sk-section-pills__pill:nth-child(5) {
        width: 84px;
      }

      /* ─── CONTENT SECTIONS ─── */
      .sk-content-mobile {
        display: flex;
        flex-direction: column;
        gap: 20px;
        padding: 0 12px;
      }

      /* ── Teams ── */
      /* mirrors: .ov-mobile-teams */
      .sk-teams {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sk-teams__title {
        width: 120px;
        height: 12px;
        border-radius: 3px;
      }

      .sk-teams__stack {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* mirrors: .madden-team-block { padding:10px 12px; border-radius:10px; gap:10px; border:1px solid } */
      .sk-teams__card {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02));
      }

      /* mirrors: .madden-team-logo { width:36px; height:36px; border-radius:8px } (mobile size) */
      .sk-teams__logo {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        flex-shrink: 0;
      }

      .sk-teams__info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .sk-teams__name {
        width: 100px;
        height: 14px;
        border-radius: 3px;
      }

      .sk-teams__location {
        width: 70px;
        height: 10px;
        border-radius: 3px;
      }

      /* ── Archetypes ── */
      /* mirrors: .ov-archetype-badges { display:flex; flex-wrap:wrap; gap:12px } */
      .sk-archetypes {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sk-archetypes__title {
        width: 140px;
        height: 12px;
        border-radius: 3px;
      }

      .sk-archetypes__grid {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      /* mirrors: .ov-archetype-badge { padding:7px 14px; border-radius:999px } */
      .sk-archetypes__badge {
        width: 120px;
        height: 34px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* ── Connected Accounts ── */
      /* mirrors: .ov-connected-grid { display:flex; flex-wrap:wrap; gap:10px } */
      .sk-connected {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .sk-connected__title {
        width: 160px;
        height: 12px;
        border-radius: 3px;
      }

      .sk-connected__grid {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      /* mirrors: .ov-connected-chip { padding:8px 14px; border-radius:999px } */
      .sk-connected__chip {
        width: 110px;
        height: 30px;
        border-radius: var(--nxt1-radius-full, 9999px);
      }

      /* mirrors: .ov-connected-explainer { padding:14px; border-radius:12px } */
      .sk-connected__explainer {
        height: 42px;
        width: 100%;
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-top: 4px;
      }

      /* ── XP Ring + Badges ── */
      /* mirrors: .ov-mobile-xp-section { display:flex; flex-direction:row; align-items:center; gap:12px; padding:28px 0 14px } */
      .sk-xp {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 28px 0 14px;
      }

      /* mirrors: .ov-mobile-xp-ring { width: clamp(92px,28vw,112px) } */
      .sk-xp__ring {
        width: clamp(92px, 28vw, 112px);
        height: clamp(92px, 28vw, 112px);
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* mirrors: .ov-mobile-xp-badge-grid { display:flex; flex-wrap:wrap; gap:8px } */
      .sk-xp__badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        flex: 1;
        min-width: 0;
        align-content: center;
      }

      /* mirrors: .ov-mobile-xp-badge-orb { width:38px; height:38px; border-radius:10px } */
      .sk-xp__badge {
        width: 38px;
        height: 38px;
        border-radius: 10px;
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
      /* mirrors: .madden-stage { min-height: calc(100vh - 64px); overflow: hidden; flex-shrink: 0 } */
      .sk-stage {
        position: relative;
        min-height: calc(100vh - 64px);
        overflow: hidden;
        flex-shrink: 0;
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

      /* Back button (mirrors nxt1-back-button — circular icon) */
      .sk-ph-back {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* Identity: mirrors .mdh-identity { flex:1 } → .mdh-name-block → .mdh-name-row + .mdh-subline */
      .sk-ph-identity {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      /* Name text: mirrors .mdh-last { font-size: 2xl ≈ 24-28px; font-weight: bold } */
      .sk-ph-name {
        height: 28px;
        width: 180px;
        max-width: 100%;
        border-radius: 6px;
      }

      /* Subtitle: mirrors .mdh-first { font-size: base ≈ 16px } */
      .sk-ph-subtitle {
        height: 18px;
        width: 240px;
        max-width: 100%;
        border-radius: 4px;
      }

      /* Trailing group: mirrors .mdh-trailing { flex-shrink:0; margin-left:auto; display:flex; align-items:center; gap:16px } */
      .sk-ph-trailing {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4, 16px);
        margin-left: auto;
      }

      /* Edit Profile button: mirrors .mdh-edit-btn { padding: 7px 16px; border-radius: 8px; font-size: 13px } */
      .sk-ph-edit {
        width: 112px;
        height: 32px;
        border-radius: var(--nxt1-radius-md, 8px);
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
         mirrors: .madden-top-tabs { padding: 0 8px; padding-left: calc(var(--shell-content-padding-x,32px) - 4px); margin-top: 12px; margin-bottom: 12px }
         ═══════════════════════════════════════ */
      .sk-top-tabs {
        display: flex;
        gap: 8px;
        padding: 0 8px;
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
        margin-top: 12px;
        margin-bottom: 12px;
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
        padding-top: var(--nxt1-spacing-6, 24px);
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
        /* mirrors: .madden-mobile-hero — full-width section with sporty background */
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

        /* mirrors: .eh { align-items:center; gap:14px; padding:6px 0 12px } */
        .sk-mh-identity {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-top: 6px;
          min-width: 0;
          align-self: center;
        }

        .sk-mh-name {
          height: 26px;
          width: 140px;
          max-width: 100%;
          border-radius: 4px;
        }

        /* position chip */
        .sk-mh-chip {
          height: 22px;
          width: 52px;
          border-radius: 6px;
        }

        /* meta chips row */
        .sk-mh-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 2px;
        }
        .sk-mh-chip-item {
          height: 26px;
          border-radius: 99px;
        }
        .sk-mh-chip-item:nth-child(1) {
          width: 90px;
        }
        .sk-mh-chip-item:nth-child(2) {
          width: 110px;
        }
        .sk-mh-chip-item:nth-child(3) {
          width: 100px;
        }

        /* Top tabs: reduce left padding + adjust margins (mirrors real profile mobile) */
        .sk-top-tabs {
          padding-left: 8px;
          margin-top: 4px;
          margin-bottom: 0;
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
  /** Skeleton layout variant: `'full'` (mobile), `'web'` (desktop), or `'post'` (single post card). */
  readonly variant = input<ProfileSkeletonVariant>('post');
}
