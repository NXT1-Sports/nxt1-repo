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
  type NewsArticle,
  getSeasonForDate,
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
import { type ScheduleRow } from '@nxt1/core';
import { ScheduleBoardComponent } from '../../components/schedule-board';
import { StatsDashboardComponent } from '../../components/stats-dashboard/stats-dashboard.component';
import { mapTeamStatsToGameLogs, formatSeasonLabel, buildSeasonRecordMap } from '@nxt1/core';
import { NewsBoardComponent } from '../../components/news-board/news-board.component';
import { MOCK_NEWS_ARTICLES } from '../../news/news.mock-data';
import { TeamRecruitingWebComponent } from './team-recruiting-web.component';
import { TeamTimelineWebComponent } from './team-timeline-web.component';
import { TeamVideosWebComponent } from './team-videos-web.component';
import { TeamPhotosWebComponent } from './team-photos-web.component';
import { TeamContactWebComponent } from './team-contact-web.component';
import { ProfileVerificationBannerComponent } from '../../profile/components/profile-verification-banner.component';
import { TeamProfileSkeletonComponent } from './team-profile-skeleton.component';

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
    ScheduleBoardComponent,
    StatsDashboardComponent,
    TeamTimelineWebComponent,
    TeamVideosWebComponent,
    NewsBoardComponent,
    TeamRecruitingWebComponent,
    TeamPhotosWebComponent,
    TeamContactWebComponent,
    ProfileVerificationBannerComponent,
    TeamProfileSkeletonComponent,
  ],
  template: `
    <main class="team-profile-main">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <!-- Loading Skeleton -->
      @if (teamProfile.isLoading()) {
        <nxt1-team-profile-skeleton />
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
                  <nxt1-profile-verification-banner
                    [activeTab]="teamProfile.activeTab()"
                    [activeSideTab]="activeSideTab()"
                  />

                  @switch (teamProfile.activeTab()) {
                    @case ('overview') {
                      @if (activeSideTab() === 'contact') {
                        <nxt1-team-contact-web />
                      } @else {
                        <nxt1-team-overview-web [activeSideTab]="activeSideTab()" />
                      }
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
                      <nxt1-schedule-board
                        [rows]="teamScheduleRows()"
                        [emptyMessage]="'Games, practices, and events will appear here.'"
                      />
                    }

                    @case ('stats') {
                      <nxt1-stats-dashboard
                        [gameLogs]="teamStatsAsGameLogs()"
                        [entityName]="teamProfile.team()?.teamName ?? 'Team'"
                        [activeSideTab]="activeSideTab()"
                        [emptyMessage]="'Team statistics will appear here once games are played.'"
                      />
                    }

                    @case ('news') {
                      <nxt1-news-board
                        [items]="teamNewsBoardItems()"
                        [activeSection]="activeSideTab()"
                        [entityName]="teamProfile.team()?.teamName ?? 'Team'"
                        (itemClick)="onNewsBoardItemClick($event)"
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

                <!-- Organization card (matches /profile team affiliation style) -->
                @if (organizationName()) {
                  <div class="madden-team-stack">
                    <div class="madden-team-block">
                      @if (teamProfile.team()?.logoUrl) {
                        <nxt1-image
                          class="madden-team-logo"
                          [src]="teamProfile.team()!.logoUrl!"
                          [alt]="organizationName()"
                          [width]="44"
                          [height]="44"
                          variant="avatar"
                          fit="contain"
                          [priority]="true"
                          [showPlaceholder]="false"
                        />
                      } @else {
                        <div class="madden-team-logo-placeholder">
                          <nxt1-icon name="business" [size]="22" />
                        </div>
                      }
                      <div class="madden-team-info">
                        <div class="madden-team-headline">
                          <span class="madden-team-name">{{ organizationName() }}</span>
                        </div>
                        @if (teamProfile.team()?.location) {
                          <span class="madden-team-location">{{
                            teamProfile.team()!.location
                          }}</span>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Projected content (e.g. CTA banner for logged-out users) -->
        <ng-content />
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
        overflow-x: hidden;
        overflow-y: auto;
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
        overflow-x: hidden;
        overflow-y: auto;
        padding-top: 0;
        display: flex;
        flex-direction: column;
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
        min-height: calc(100vh - 64px);
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
        margin-top: 12px;
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

      /* Organization block below team image (matches profile style) */
      .madden-team-stack {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .madden-team-block {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 12px;
        width: 100%;
        padding: 12px 14px;
        border-radius: 12px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
      }
      .madden-team-logo {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .madden-team-logo-placeholder {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        background: var(--m-surface-2);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--m-text-3);
        flex-shrink: 0;
      }
      .madden-team-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 2px;
      }
      .madden-team-headline {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .madden-team-name {
        font-size: 14px;
        font-weight: 700;
        color: var(--m-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .madden-team-location {
        font-size: 12px;
        color: var(--m-text-3);
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

  /**
   * Maps TeamProfileScheduleEvent[] → ScheduleRow[] for the shared schedule board.
   * Filters by active season side tab (season-YYYY-YYYY).
   */
  protected readonly teamScheduleRows = computed<ScheduleRow[]>(() => {
    const sideTab = this.activeSideTab();
    const seasonLabel = sideTab.startsWith('season-') ? sideTab.replace('season-', '') : undefined;
    const teamName = this.teamProfile.team()?.teamName ?? 'Team';
    const teamLogo = this.teamProfile.team()?.logoUrl;
    const now = Date.now();

    const events = this.teamProfile.schedule().filter((event) => {
      if (!seasonLabel) return true;
      return getSeasonForDate(event.date) === seasonLabel;
    });

    return events.map((event) => {
      const eventDate = new Date(event.date);
      const isPast = event.status === 'final' || eventDate.getTime() <= now;
      const homeTeam = event.isHome ? teamName : (event.opponent ?? 'Opponent');
      const awayTeam = event.isHome ? (event.opponent ?? 'Opponent') : teamName;
      const homeLogo = event.isHome ? teamLogo : event.opponentLogoUrl;
      const awayLogo = event.isHome ? event.opponentLogoUrl : teamLogo;

      let statusLabel: string;
      let statusValue: string;
      if (event.status === 'final' && event.result) {
        statusLabel =
          event.result.outcome === 'win' ? 'Win' : event.result.outcome === 'loss' ? 'Loss' : 'Tie';
        statusValue = `${event.result.teamScore}-${event.result.opponentScore}`;
      } else if (event.status === 'live') {
        statusLabel = 'Live';
        statusValue = 'In Progress';
      } else if (event.status === 'postponed') {
        statusLabel = 'Postponed';
        statusValue = '';
      } else if (event.status === 'cancelled') {
        statusLabel = 'Cancelled';
        statusValue = '';
      } else {
        statusLabel = isPast ? 'Completed' : 'Upcoming';
        statusValue = isPast ? 'No score reported' : 'Scheduled';
      }

      return {
        id: event.id,
        isPast,
        month: eventDate.toLocaleDateString('en-US', { month: 'short' }),
        day: eventDate.getDate().toString(),
        homeTeam,
        awayTeam,
        homeLogo,
        awayLogo,
        location: event.location ?? 'Location TBA',
        time: event.time ?? 'Time TBA',
        statusLabel,
        statusValue,
      } satisfies ScheduleRow;
    });
  });

  /**
   * Per-season record map built from current record + season history.
   * Used by the mapper and sidebar to display the correct W-L for each season.
   */
  private readonly seasonRecordMap = computed(() => {
    const team = this.teamProfile.team();
    return buildSeasonRecordMap(team?.record, team?.seasonHistory);
  });

  /**
   * Maps TeamProfileStatsCategory[] → ProfileSeasonGameLog[] for the shared stats dashboard.
   */
  protected readonly teamStatsAsGameLogs = computed(() =>
    mapTeamStatsToGameLogs(this.teamProfile.stats(), this.seasonRecordMap())
  );

  /** Mock news articles for the shared NewsBoardComponent (UI setup — will be replaced with real API data). */
  protected readonly teamNewsBoardItems = computed(() => MOCK_NEWS_ARTICLES);

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

  /** Organization name for the team (school/club/program) shown in right panel. */
  protected readonly organizationName = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';

    const rawName = team.teamName?.trim() ?? '';
    if (!rawName) return '';

    const sport = team.sport?.trim();
    const mascot = team.branding?.mascot?.trim();

    let orgName = rawName;
    if (sport) {
      orgName = orgName
        .replace(new RegExp(`\\b${sport.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi'), '')
        .trim();
    }
    if (mascot) {
      orgName = orgName
        .replace(new RegExp(`\\b${mascot.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi'), '')
        .trim();
    }

    orgName = orgName.replace(/\s{2,}/g, ' ').trim();
    return orgName || rawName;
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

  /** Stats sidebar items — per-season entries grouped under team name. */
  private readonly statsSidebarItems = computed((): SectionNavItem[] => {
    const allStats = this.teamProfile.stats();
    if (allStats.length === 0) return [{ id: 'all', label: 'All Stats' }];

    const rawSeasons = [...new Set(allStats.map((c) => c.season).filter(Boolean))] as string[];
    rawSeasons.sort((a, b) => b.localeCompare(a));

    if (rawSeasons.length === 0) return [{ id: 'all', label: 'All Stats' }];

    const seasonItems: SectionNavItem[] = rawSeasons.map((s) => {
      const label = formatSeasonLabel(s);
      return { id: `school-season-${label}`, label };
    });

    return seasonItems;
  });

  /** Unique season labels derived from team schedule events (most recent first). */
  protected readonly scheduleSeasons = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    const seasons: string[] = [];

    for (const event of this.teamProfile.schedule()) {
      const season = getSeasonForDate(event.date);
      if (!seen.has(season)) {
        seen.add(season);
        seasons.push(season);
      }
    }

    seasons.sort((a, b) => b.localeCompare(a));
    return seasons;
  });

  /** Section nav items — contextual to active top tab */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.teamProfile.activeTab();

    const sections: Record<string, SectionNavItem[]> = {
      overview: [
        { id: 'about', label: 'About' },
        { id: 'staff', label: 'Staff' },
        { id: 'team-history', label: 'Team History' },
        { id: 'sponsors', label: 'Sponsors' },
        { id: 'contact', label: 'Contact' },
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
        {
          id: 'media',
          label: 'Media',
          badge:
            this.teamProfile
              .allPosts()
              .filter(
                (post) =>
                  post.type === 'image' ||
                  post.type === 'video' ||
                  post.type === 'highlight' ||
                  !!post.thumbnailUrl ||
                  !!post.mediaUrl
              ).length || undefined,
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
        ...this.scheduleSeasons().map((s) => ({
          id: `season-${s}`,
          label: s,
        })),
      ],
      stats: this.statsSidebarItems(),
      news: [
        {
          id: 'all-news',
          label: 'All News',
          badge: this.teamNewsBoardItems().length || undefined,
        },
        {
          id: 'announcements',
          label: 'Announcements',
          badge:
            this.teamNewsBoardItems().filter((i) => (i.category as string) === 'announcement')
              .length || undefined,
        },
        {
          id: 'media-mentions',
          label: 'Media Mentions',
          badge:
            this.teamNewsBoardItems().filter((i) => (i.category as string) === 'media-mention')
              .length || undefined,
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

  protected onNewsBoardItemClick(item: NewsArticle): void {
    this.logger.debug('News board item click', { itemId: item.id, title: item.title });
  }
}
