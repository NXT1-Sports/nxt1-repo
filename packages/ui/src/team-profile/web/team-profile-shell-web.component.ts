/**
 * @fileoverview Team Profile Shell Component - Web (Tailwind SSR)
 * @module @nxt1/ui/team-profile/web
 * @version 2.0.0
 *
 * Web-optimized Team Profile Shell — thin composition layer.
 * All tab content is extracted into dedicated components.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 *
 * ⭐ WEB ONLY - Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * Mirrors the ProfileShellWebComponent architecture exactly:
 * Shell handles layout (split, halftone, right panel),
 * while child components own their section content & styles.
 *
 * Design: Madden Franchise Mode split layout (left: content, right: team branding)
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  computed,
  signal,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  type TeamProfileTabId,
  type TeamProfileTab,
  type TeamProfilePost,
  type TeamProfileRosterMember,
  TEAM_PROFILE_TABS,
  TEAM_PROFILE_EMPTY_STATES,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
import { NxtImageComponent } from '../../components/image';
import { NxtRefresherComponent, type RefreshEvent } from '../../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../../components/option-scroller';
import {
  NxtSectionNavWebComponent,
  type SectionNavItem,
  type SectionNavChangeEvent,
} from '../../components/section-nav-web';
import { NxtImageCarouselComponent } from '../../components/image-carousel';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { TeamProfileService } from '../team-profile.service';

// ─── Extracted Section Components ───
import { TeamPageHeaderComponent } from './team-page-header.component';
import { TeamMobileHeroComponent } from './team-mobile-hero.component';
import { TeamOverviewWebComponent } from './team-overview-web.component';
import { TeamRosterWebComponent } from './team-roster-web.component';
import { TeamScheduleWebComponent } from './team-schedule-web.component';
import { TeamStatsWebComponent } from './team-stats-web.component';
import { TeamNewsWebComponent } from './team-news-web.component';
import { TeamRecruitingWebComponent } from './team-recruiting-web.component';
import { TeamTimelineWebComponent } from './team-timeline-web.component';
import { TeamVideosWebComponent } from './team-videos-web.component';
import { TeamPhotosWebComponent } from './team-photos-web.component';

@Component({
  selector: 'nxt1-team-profile-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtIconComponent,
    NxtImageComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    NxtImageCarouselComponent,
    // Extracted section components
    TeamPageHeaderComponent,
    TeamMobileHeroComponent,
    TeamOverviewWebComponent,
    TeamRosterWebComponent,
    TeamScheduleWebComponent,
    TeamStatsWebComponent,
    TeamTimelineWebComponent,
    TeamVideosWebComponent,
    TeamNewsWebComponent,
    TeamRecruitingWebComponent,
    TeamPhotosWebComponent,
  ],
  template: `
    <main class="team-profile-main">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <!-- Loading Skeleton -->
      @if (teamProfile.isLoading()) {
        <section class="madden-skeleton">
          <div class="madden-skeleton-stage">
            <div class="skeleton-split">
              <div class="skeleton-left">
                <div class="skeleton-header animate-pulse">
                  <div class="skeleton-logo"></div>
                  <div class="skeleton-text-group">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-subtitle"></div>
                  </div>
                </div>
                <div class="skeleton-tabs animate-pulse">
                  @for (i of [1, 2, 3, 4, 5]; track i) {
                    <div class="skeleton-tab"></div>
                  }
                </div>
                <div class="skeleton-content animate-pulse">
                  @for (i of [1, 2, 3]; track i) {
                    <div class="skeleton-card"></div>
                  }
                </div>
              </div>
              <div class="skeleton-right animate-pulse">
                <div class="skeleton-team-image"></div>
                <div class="skeleton-info-block"></div>
                <div class="skeleton-info-block-sm"></div>
              </div>
            </div>
          </div>
        </section>
      }

      <!-- Error State -->
      @else if (teamProfile.error()) {
        <section class="madden-error">
          <div class="madden-error-icon" aria-hidden="true">⚠️</div>
          <h2 class="madden-error-title">Failed to load team profile</h2>
          <p class="madden-error-msg">{{ teamProfile.error() }}</p>
          <button type="button" class="madden-error-btn" (click)="onRetry()">Try Again</button>
        </section>
      }

      <!-- ═══ MADDEN FRANCHISE MODE — SPLIT LAYOUT ═══ -->
      @else if (teamProfile.team()) {
        <div class="madden-stage">
          <!-- Faded halftone accent background -->
          <div class="stage-halftone-bg" aria-hidden="true">
            <div class="stage-halftone-dots" [style.--team-accent]="teamAccentColor()"></div>
            <div class="stage-halftone-fade" [style.--team-accent]="teamAccentColor()"></div>
          </div>

          <!-- ═══ SPLIT: LEFT CONTENT | RIGHT TEAM BRANDING ═══ -->
          <div class="madden-split">
            <!-- LEFT SIDE: Header + Tabs + Content -->
            <div class="madden-split-left">
              <!-- Desktop Header (extracted component) -->
              <div class="madden-header-top-pad hidden md:block">
                <nxt1-team-page-header (back)="backClick.emit()" (follow)="followClick.emit()" />
              </div>

              <!-- Mobile Hero (extracted component) -->
              <div class="md:hidden">
                <nxt1-team-mobile-hero (back)="backClick.emit()" (follow)="followClick.emit()" />
              </div>

              <!-- TOP TAB BAR -->
              <nav class="madden-top-tabs" aria-label="Team profile sections">
                <nxt1-option-scroller
                  [options]="tabOptions()"
                  [selectedId]="teamProfile.activeTab()"
                  [config]="{ scrollable: true, stretchToFill: false, showDivider: false }"
                  (selectionChange)="onTabChange($event)"
                />
              </nav>

              <!-- Content Area: Side tabs + scrollable content -->
              <div class="madden-content-layer">
                <!-- LEFT SIDE NAV COLUMN -->
                <div class="madden-side-nav-column">
                  <nxt1-section-nav-web
                    [items]="sideTabItems()"
                    [activeId]="activeSideTab()"
                    ariaLabel="Section navigation"
                    (selectionChange)="onSectionNavChange($event)"
                  />
                </div>

                <!-- MAIN CONTENT AREA — Each tab renders its own extracted component -->
                <section class="madden-content-scroll" aria-live="polite">
                  @switch (teamProfile.activeTab()) {
                    @case ('overview') {
                      <nxt1-team-overview-web [activeSideTab]="activeSideTab()" />
                    }

                    @case ('timeline') {
                      <nxt1-team-timeline-web
                        [activeSection]="activeSideTab()"
                        (postClick)="onPostClick($event)"
                      />
                    }

                    @case ('videos') {
                      <nxt1-team-videos-web
                        [activeSection]="activeSideTab()"
                        (videoClick)="onPostClick($event)"
                      />
                    }

                    @case ('roster') {
                      <nxt1-team-roster-web
                        [activeSideTab]="activeSideTab()"
                        (memberClick)="onRosterMemberClick($event)"
                      />
                    }

                    @case ('schedule') {
                      <nxt1-team-schedule-web [activeSideTab]="activeSideTab()" />
                    }

                    @case ('stats') {
                      <nxt1-team-stats-web [activeSideTab]="activeSideTab()" />
                    }

                    @case ('news') {
                      <nxt1-team-news-web
                        [activeSection]="activeSideTab()"
                        (postClick)="onPostClick($event)"
                      />
                    }

                    @case ('recruiting') {
                      <nxt1-team-recruiting-web [activeSection]="activeSideTab()" />
                    }

                    @case ('photos') {
                      <nxt1-team-photos-web [activeSection]="activeSideTab()" />
                    }
                  }
                </section>
              </div>
            </div>

            <!-- RIGHT SIDE: Team image + team info -->
            <div class="madden-split-right">
              <div class="madden-right-stack">
                <!-- ─── ACTION GRID ─── -->
                <div class="right-action-grid">
                  <button
                    type="button"
                    class="right-action-btn"
                    (click)="shareClick.emit()"
                    aria-label="Share team"
                  >
                    <nxt1-icon name="share" [size]="20" />
                    <span>Share Team</span>
                  </button>
                  <button
                    type="button"
                    class="right-action-btn"
                    (click)="qrCodeClick.emit()"
                    aria-label="Open QR code"
                  >
                    <nxt1-icon name="qrCode" [size]="20" />
                    <span>QR Code</span>
                  </button>
                </div>

                @if (teamProfile.galleryImages().length > 0) {
                  <div class="carousel-glow-wrap">
                    <div class="carousel-glow-border" aria-hidden="true"></div>
                    <div class="carousel-glow-ambient" aria-hidden="true"></div>
                    <nxt1-image-carousel
                      [images]="teamProfile.galleryImages()"
                      [alt]="teamProfile.team()?.teamName ?? 'Team'"
                      [autoPlay]="true"
                      [autoPlayInterval]="5000"
                      [overlayTitle]="teamProfile.team()?.teamName ?? ''"
                      [overlaySubtitle]="headerSubtitle()"
                      class="madden-team-carousel"
                    />
                    @if (teamProfile.team()?.verificationStatus === 'verified') {
                      <span class="carousel-verified-badge">
                        <nxt1-icon name="checkmark-circle" [size]="14" />
                        Verified
                      </span>
                    }
                  </div>
                } @else if (teamProfile.team()?.logoUrl) {
                  <div class="team-logo-display">
                    <nxt1-image
                      [src]="teamProfile.team()!.logoUrl!"
                      [alt]="teamProfile.team()!.teamName"
                      [width]="160"
                      [height]="160"
                      variant="avatar"
                      fit="contain"
                      [priority]="true"
                      [showPlaceholder]="false"
                    />
                  </div>
                }

                <!-- Team Info Block -->
                <div class="team-info-block">
                  @if (teamProfile.recordDisplay()) {
                    <div class="team-info-block__row">
                      <nxt1-icon name="trophy" [size]="16" />
                      <span class="team-info-block__label">Record</span>
                      <span class="team-info-block__value">{{ teamProfile.recordDisplay() }}</span>
                    </div>
                  }
                  <div class="team-info-block__row">
                    <nxt1-icon name="people" [size]="16" />
                    <span class="team-info-block__label">Athletes</span>
                    <span class="team-info-block__value">{{ teamProfile.rosterCount() }}</span>
                  </div>
                  @if (teamProfile.followStats()) {
                    <div class="team-info-block__row">
                      <nxt1-icon name="heart" [size]="16" />
                      <span class="team-info-block__label">Followers</span>
                      <span class="team-info-block__value">{{
                        teamProfile.followStats()!.followersCount | number
                      }}</span>
                    </div>
                  }
                  @if (teamProfile.team()?.homeVenue) {
                    <div class="team-info-block__row">
                      <nxt1-icon name="business" [size]="16" />
                      <span class="team-info-block__label">Home</span>
                      <span class="team-info-block__value">{{
                        teamProfile.team()!.homeVenue
                      }}</span>
                    </div>
                  }
                </div>

                <!-- Head Coach Compact -->
                @if (teamProfile.headCoach(); as coach) {
                  <div class="team-coach-compact">
                    <div class="team-coach-compact__avatar">
                      <nxt1-icon name="person" [size]="20" />
                    </div>
                    <div class="team-coach-compact__info">
                      <span class="team-coach-compact__title">Head Coach</span>
                      <span class="team-coach-compact__name"
                        >{{ coach.firstName }} {{ coach.lastName }}</span
                      >
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      }
    </main>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════════════════
         TEAM PROFILE — MADDEN FRANCHISE MODE LAYOUT
         Shell-level layout only. Tab content styles live in
         their respective extracted components.
         ═══════════════════════════════════════════════════════════ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
        overflow: hidden;
        --m-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --m-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --m-surface-2: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --m-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --m-text: var(--nxt1-color-text-primary, #ffffff);
        --m-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --m-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --m-accent: var(--team-accent, var(--nxt1-color-primary, #d4ff00));
      }

      .team-profile-main {
        background: var(--m-bg);
        height: 100%;
        overflow: hidden;
        padding-top: 0;
        display: flex;
        flex-direction: column;
      }

      /* ─── SKELETON ─── */
      .madden-skeleton {
        padding: 24px;
      }
      .madden-skeleton-stage {
        max-width: 1400px;
      }
      .skeleton-split {
        display: flex;
        gap: 24px;
      }
      .skeleton-left {
        flex: 1;
        min-width: 0;
      }
      .skeleton-right {
        width: 340px;
        flex-shrink: 0;
      }
      .skeleton-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 24px;
      }
      .skeleton-logo {
        width: 56px;
        height: 56px;
        border-radius: 12px;
        background: var(--m-surface);
      }
      .skeleton-text-group {
        flex: 1;
      }
      .skeleton-title {
        height: 24px;
        width: 240px;
        border-radius: 6px;
        background: var(--m-surface);
        margin-bottom: 8px;
      }
      .skeleton-subtitle {
        height: 16px;
        width: 180px;
        border-radius: 6px;
        background: var(--m-surface);
      }
      .skeleton-tabs {
        display: flex;
        gap: 12px;
        margin-bottom: 24px;
      }
      .skeleton-tab {
        height: 36px;
        width: 80px;
        border-radius: 999px;
        background: var(--m-surface);
      }
      .skeleton-content {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .skeleton-card {
        height: 80px;
        border-radius: 12px;
        background: var(--m-surface);
      }
      .skeleton-team-image {
        height: 320px;
        border-radius: 16px;
        background: var(--m-surface);
        margin-bottom: 16px;
      }
      .skeleton-info-block {
        height: 120px;
        border-radius: 12px;
        background: var(--m-surface);
        margin-bottom: 12px;
      }
      .skeleton-info-block-sm {
        height: 60px;
        border-radius: 12px;
        background: var(--m-surface);
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      /* ─── ERROR STATE ─── */
      .madden-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 64px 24px;
        text-align: center;
      }
      .madden-error-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }
      .madden-error-title {
        font-size: 18px;
        font-weight: 700;
        color: var(--m-text);
        margin: 0 0 8px;
      }
      .madden-error-msg {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
      }
      .madden-error-btn {
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        color: var(--m-text);
        border-radius: 999px;
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .madden-error-btn:hover {
        background: var(--m-surface-2);
      }

      /* ─── FULL-SCREEN BANNER STAGE ─── */
      .madden-stage {
        position: relative;
        height: calc(100vh - 64px);
        overflow: hidden;
        flex-shrink: 0;
      }

      /* ─── HALFTONE BACKGROUND ─── */
      .stage-halftone-bg {
        position: absolute;
        inset: 0;
        z-index: 1;
        pointer-events: none;
        overflow: hidden;
      }
      .stage-halftone-dots {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(
          circle,
          color-mix(in srgb, var(--m-accent) 28%, transparent) 1.2px,
          transparent 1.2px
        );
        background-size: 11px 11px;
        mask-image: radial-gradient(
          ellipse 130% 110% at 85% 50%,
          black 0%,
          rgba(0, 0, 0, 0.7) 20%,
          rgba(0, 0, 0, 0.35) 45%,
          transparent 68%
        );
        -webkit-mask-image: radial-gradient(
          ellipse 130% 110% at 85% 50%,
          black 0%,
          rgba(0, 0, 0, 0.7) 20%,
          rgba(0, 0, 0, 0.35) 45%,
          transparent 68%
        );
      }
      .stage-halftone-fade {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 75% 100% at 88% 50%,
          color-mix(in srgb, var(--m-accent) 16%, transparent) 0%,
          color-mix(in srgb, var(--m-accent) 8%, transparent) 30%,
          transparent 62%
        );
      }
      @media (prefers-reduced-motion: reduce) {
        .stage-halftone-dots,
        .stage-halftone-fade {
          opacity: 0.5;
        }
      }

      /* ─── SPLIT LAYOUT ─── */
      .madden-split {
        position: relative;
        z-index: 5;
        display: flex;
        height: 100%;
      }
      .madden-split-left {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        max-width: calc(100% - 380px);
        overflow: hidden;
        padding-left: 4px;
      }
      .madden-split-right {
        flex-shrink: 0;
        width: 380px;
        position: relative;
        overflow-x: hidden;
        overflow-y: auto;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        min-height: 0;
        padding: 0 16px 12px 0;
      }
      .madden-header-top-pad {
        padding-top: 20px;
      }
      .madden-right-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        width: 300px;
        padding-top: 20px;
        padding-bottom: 12px;
      }

      /* ─── TOP TAB BAR ─── */
      .madden-top-tabs {
        padding: 0 8px;
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
        margin-top: -6px;
        border-bottom: none;
        background: transparent;
        flex-shrink: 0;
      }
      .madden-top-tabs ::ng-deep .option-scroller {
        background: transparent !important;
      }
      .madden-top-tabs ::ng-deep .option-scroller__container {
        min-height: 0;
      }
      .madden-top-tabs ::ng-deep .option-scroller__option {
        height: 36px;
      }
      .madden-top-tabs ::ng-deep .option-scroller__badge {
        display: none !important;
      }

      /* ─── CONTENT LAYER ─── */
      .madden-content-layer {
        position: relative;
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        gap: var(--nxt1-spacing-6, 24px);
        align-items: stretch;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding-top: var(--nxt1-spacing-2, 8px);
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
      }
      .madden-side-nav-column {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-4);
        align-self: stretch;
        overflow-y: auto;
        scrollbar-width: none;
        padding-bottom: 120px;
      }
      .madden-side-nav-column::-webkit-scrollbar {
        display: none;
      }
      .madden-side-nav-column nxt1-section-nav-web {
        width: 100%;
      }
      .madden-side-nav-column ::ng-deep .nav-group-header {
        text-transform: none;
        letter-spacing: normal;
      }

      /* ─── CONTENT SCROLL AREA ─── */
      .madden-content-scroll {
        height: 100%;
        min-height: 0;
        min-width: 0;
        overflow-y: auto;
        overflow-x: hidden;
        scrollbar-gutter: stable both-edges;
        padding: 0 12px 120px;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .madden-content-scroll > * {
        width: 100%;
        max-width: 660px;
      }
      .madden-content-scroll::-webkit-scrollbar {
        width: 6px;
      }
      .madden-content-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .madden-content-scroll::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
      }

      /* ─── RIGHT PANEL ACTION GRID ─── */
      .right-action-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--nxt1-spacing-2);
        width: 100%;
      }
      .right-action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-1-5);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-2);
        border: 1px solid var(--m-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        background: var(--m-surface);
        color: var(--m-text-2);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        cursor: pointer;
        text-align: center;
        transition:
          background 100ms ease-out,
          color 100ms ease-out,
          border-color 100ms ease-out;
      }
      .right-action-btn:hover {
        background: var(--m-surface-2);
        color: var(--m-text);
        border-color: var(--m-accent);
      }
      .right-action-btn:active {
        transform: scale(0.97);
      }

      /* ─── CAROUSEL GLOW ─── */
      @property --glow-angle {
        syntax: '<angle>';
        initial-value: 0deg;
        inherits: false;
      }
      @keyframes glow-spin {
        0% {
          --glow-angle: 0deg;
          opacity: 1;
        }
        80% {
          --glow-angle: 288deg;
          opacity: 1;
        }
        100% {
          --glow-angle: 360deg;
          opacity: 0;
        }
      }
      @keyframes glow-swell {
        0% {
          opacity: 0;
          transform: scale(0.96);
        }
        40% {
          opacity: 0.65;
          transform: scale(1.02);
        }
        100% {
          opacity: 0.25;
          transform: scale(1);
        }
      }
      .carousel-glow-wrap {
        position: relative;
        width: 100%;
        height: 56vh;
        border-radius: 18px;
        isolation: isolate;
        contain: layout style;
      }
      .carousel-verified-badge {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 4;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px 4px 6px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(8px);
        color: var(--m-accent);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.03em;
        pointer-events: none;
      }
      .carousel-glow-border {
        position: absolute;
        inset: -2px;
        border-radius: 20px;
        z-index: 0;
        background: conic-gradient(
          from var(--glow-angle, 0deg),
          var(--m-accent) 0%,
          transparent 12%,
          transparent 33%,
          var(--m-accent) 45%,
          transparent 57%,
          transparent 78%,
          var(--m-accent) 90%,
          transparent 100%
        );
        animation: glow-spin 2.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        will-change: --glow-angle, opacity;
        border: 2px solid transparent;
        pointer-events: none;
      }
      .carousel-glow-ambient {
        position: absolute;
        inset: -6px;
        border-radius: 24px;
        z-index: -1;
        background: radial-gradient(
          ellipse at 50% 30%,
          color-mix(in srgb, var(--m-accent) 25%, transparent) 0%,
          transparent 70%
        );
        filter: blur(18px);
        opacity: 0;
        animation: glow-swell 2.4s ease-out forwards;
        will-change: opacity, transform;
        pointer-events: none;
      }
      @media (prefers-reduced-motion: reduce) {
        .carousel-glow-border {
          animation: none;
          background: none;
          border: 2px solid color-mix(in srgb, var(--m-accent) 30%, transparent);
          opacity: 1;
        }
        .carousel-glow-ambient {
          animation: none;
          opacity: 0.2;
        }
      }
      .madden-team-carousel {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        border-radius: 16px;
        overflow: hidden;
      }
      .madden-team-carousel ::ng-deep .carousel {
        position: relative;
        height: 100%;
        border-radius: 16px;
      }
      .madden-team-carousel ::ng-deep .carousel-track {
        height: 100%;
      }
      .madden-team-carousel ::ng-deep .carousel-slide {
        height: 100%;
      }
      .madden-team-carousel ::ng-deep .carousel-img {
        height: 100%;
        object-position: center top;
      }

      /* ─── TEAM LOGO DISPLAY (fallback for no gallery) ─── */
      .team-logo-display {
        width: 100%;
        display: flex;
        justify-content: center;
        padding: 32px 0;
      }

      /* ─── TEAM INFO BLOCK (right panel) ─── */
      .team-info-block {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .team-info-block__row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 0;
      }
      .team-info-block__label {
        font-size: 12px;
        color: var(--m-text-3);
        flex: 1;
      }
      .team-info-block__value {
        font-size: 13px;
        font-weight: 700;
        color: var(--m-text);
      }

      /* ─── HEAD COACH COMPACT (right panel) ─── */
      .team-coach-compact {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .team-coach-compact__avatar {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: var(--m-surface-2);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3);
        flex-shrink: 0;
      }
      .team-coach-compact__info {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .team-coach-compact__title {
        font-size: 10px;
        color: var(--m-text-3);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 600;
      }
      .team-coach-compact__name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
      }

      /* ═══ RESPONSIVE ═══ */
      @media (max-width: 1024px) {
        .madden-split-left {
          max-width: calc(100% - 280px);
        }
        .madden-split-right {
          width: 280px;
        }
        .madden-right-stack {
          width: 240px;
        }
        .madden-side-nav-column {
          width: 160px;
        }
      }
      @media (max-width: 768px) {
        .madden-top-tabs {
          padding-left: 8px;
        }
        :host {
          height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          max-width: 100vw;
        }
        .stage-halftone-dots {
          background-image: radial-gradient(
            circle,
            color-mix(in srgb, var(--m-accent) 34%, transparent) 1.05px,
            transparent 0.9px
          );
          background-size: 14px 14px;
          mask-image: radial-gradient(
            ellipse 122% 78% at 50% 10%,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.68) 30%,
            rgba(0, 0, 0, 0.36) 56%,
            transparent 80%
          );
          -webkit-mask-image: radial-gradient(
            ellipse 122% 78% at 50% 10%,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.68) 30%,
            rgba(0, 0, 0, 0.36) 56%,
            transparent 80%
          );
        }
        .stage-halftone-fade {
          background: radial-gradient(
            ellipse 86% 72% at 50% 8%,
            color-mix(in srgb, var(--m-accent) 26%, transparent) 0%,
            color-mix(in srgb, var(--m-accent) 13%, transparent) 42%,
            transparent 78%
          );
        }
        .team-profile-main {
          height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          display: block;
          max-width: 100%;
        }
        .madden-stage {
          height: auto;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: visible;
          flex-shrink: 1;
        }
        .stage-halftone-bg {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          z-index: 0;
        }
        .madden-split {
          height: auto;
          align-items: flex-start;
        }
        .madden-split-left {
          flex: 1;
          min-width: 0;
          max-width: 100%;
          overflow-x: hidden;
          overflow-y: visible;
        }
        .madden-content-layer {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--nxt1-spacing-4, 16px);
          padding-top: 12px;
          padding-left: 0;
          min-height: auto;
          overflow-x: hidden;
          overflow-y: visible;
          max-width: 100%;
          width: 100%;
        }
        .madden-side-nav-column {
          display: contents;
          order: 0;
          width: 100%;
          position: static;
          max-height: none;
          padding-bottom: 0;
        }
        .madden-side-nav-column > nxt1-section-nav-web {
          order: 0;
          width: calc(100% - 24px);
          margin-inline: 12px;
        }
        .madden-content-scroll {
          order: 1;
          height: auto;
          min-height: 0;
          width: 100%;
          max-width: 100%;
          max-height: none;
          overflow-y: visible;
          overflow-x: hidden;
          padding: 0 12px 24px;
          align-items: stretch;
          scrollbar-gutter: auto;
          box-sizing: border-box;
        }
        .madden-content-scroll > * {
          max-width: none;
        }
        .madden-split-right {
          display: none;
        }
        .madden-side-nav-column ::ng-deep .section-nav {
          gap: 4px;
          padding-inline: 2px;
          padding-bottom: 10px;
          border-bottom: none;
        }
        .madden-side-nav-column ::ng-deep .nav-item {
          width: auto;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 600;
          font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
          letter-spacing: 0.02em;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          color: var(--m-text-2, rgba(255, 255, 255, 0.55));
        }
        .madden-side-nav-column ::ng-deep .nav-item--active {
          background: color-mix(in srgb, var(--m-accent) 12%, transparent);
          border-color: color-mix(in srgb, var(--m-accent) 35%, transparent);
          color: var(--m-text, #fff);
        }
        .madden-side-nav-column ::ng-deep .nav-group-header {
          display: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamProfileShellWebComponent implements OnInit {
  protected readonly teamProfile = inject(TeamProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('TeamProfileShellWeb');
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // ============================================
  // INPUTS
  // ============================================

  /** Team slug to load */
  readonly teamSlug = input<string>('');

  /** Whether the current user is an admin of this team */
  readonly isTeamAdmin = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly backClick = output<void>();
  readonly tabChange = output<TeamProfileTabId>();
  readonly shareClick = output<void>();
  readonly followClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly manageTeamClick = output<void>();
  readonly rosterMemberClick = output<TeamProfileRosterMember>();
  readonly postClick = output<TeamProfilePost>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Header subtitle: sport · location · conference · record */
  protected readonly headerSubtitle = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';
    const parts: string[] = [];
    if (team.sport) parts.push(team.sport);
    if (team.location) parts.push(team.location);
    if (team.conference) parts.push(team.conference);
    const record = this.teamProfile.recordDisplay();
    if (record) parts.push(record);
    return parts.join(' · ');
  });

  /** Team accent color from branding */
  protected readonly teamAccentColor = computed(() => {
    const branding = this.teamProfile.team()?.branding;
    return branding?.primaryColor ?? 'var(--nxt1-color-primary, #d4ff00)';
  });

  /** Tab options for the top bar scroller */
  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.teamProfile.tabBadges();

    return TEAM_PROFILE_TABS.map((tab: TeamProfileTab) => ({
      id: tab.id,
      label: tab.label,
      badge: badges[tab.id as keyof typeof badges] || undefined,
    }));
  });

  /** Empty state for current tab */
  protected readonly emptyState = computed(() => {
    const tab = this.teamProfile.activeTab();
    return TEAM_PROFILE_EMPTY_STATES[tab] || TEAM_PROFILE_EMPTY_STATES['overview'];
  });

  /** Section nav items — contextual to active top tab */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.teamProfile.activeTab();

    const sections: Record<string, SectionNavItem[]> = {
      overview: [
        { id: 'about', label: 'About' },
        { id: 'staff', label: 'Staff' },
        { id: 'team-history', label: 'Team History' },
        { id: 'quick-stats', label: 'Quick Stats' },
        { id: 'sponsors', label: 'Sponsors' },
      ],
      timeline: [
        {
          id: 'pinned',
          label: 'Pinned',
          badge: this.teamProfile.pinnedPosts().length || undefined,
        },
        {
          id: 'all-posts',
          label: 'All Posts',
          badge: this.teamProfile.allPosts().length || undefined,
        },
      ],
      videos: [
        { id: 'highlights', label: 'Highlights' },
        {
          id: 'all-videos',
          label: 'All Videos',
          badge: this.teamProfile.videoPosts().length || undefined,
        },
      ],
      roster: [
        { id: 'all', label: 'All', badge: this.teamProfile.rosterCount() || undefined },
        ...this.teamProfile.rosterClassYears().map((year) => ({
          id: `class-${year}`,
          label: `Class of ${year}`,
        })),
      ],
      schedule: [
        {
          id: 'upcoming',
          label: 'Upcoming',
          badge: this.teamProfile.upcomingSchedule().length || undefined,
        },
        {
          id: 'completed',
          label: 'Completed',
          badge: this.teamProfile.completedSchedule().length || undefined,
        },
      ],
      stats:
        this.teamProfile.stats().length > 0
          ? this.teamProfile.stats().map((cat) => ({
              id: cat.name.toLowerCase().replace(/\s+/g, '-'),
              label: cat.name,
            }))
          : [{ id: 'all', label: 'All Stats' }],
      news: [
        {
          id: 'all-news',
          label: 'All News',
          badge: this.teamProfile.newsPosts().length || undefined,
        },
      ],
      recruiting: [
        {
          id: 'all-activity',
          label: 'All Activity',
          badge: this.teamProfile.recruitingActivity().length || undefined,
        },
        { id: 'commitments', label: 'Commitments' },
        { id: 'offers', label: 'Offers' },
        { id: 'visits', label: 'Visits' },
      ],
      photos: [
        {
          id: 'all-photos',
          label: 'All Photos',
          badge: this.teamProfile.galleryImages().length || undefined,
        },
      ],
    };

    return sections[tab] ?? sections['overview'];
  });

  /** Active side tab */
  private readonly _activeSideTab = signal<string>('');
  protected readonly activeSideTab = computed(() => {
    const current = this._activeSideTab();
    const items = this.sideTabItems();
    if (current && items.some((i) => i.id === current)) return current;
    return items[0]?.id ?? '';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    this.teamProfile.startLoading();

    if (!this.isBrowser) return;

    const slug = this.teamSlug();
    const isAdmin = this.isTeamAdmin();

    if (slug) {
      this.teamProfile.loadTeam(slug, isAdmin);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as TeamProfileTabId;
    this.teamProfile.setActiveTab(tabId);
    this._activeSideTab.set('');
    this.tabChange.emit(tabId);
  }

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSideTab.set(event.id);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.teamProfile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    const slug = this.teamSlug();
    if (slug) {
      this.teamProfile.loadTeam(slug, this.isTeamAdmin());
    }
  }

  protected onRosterMemberClick(member: TeamProfileRosterMember): void {
    this.rosterMemberClick.emit(member);
    this.logger.debug('Roster member click', { memberId: member.id, name: member.displayName });
  }

  protected onPostClick(post: TeamProfilePost): void {
    this.postClick.emit(post);
    this.logger.debug('Post click', { postId: post.id });
  }
}
