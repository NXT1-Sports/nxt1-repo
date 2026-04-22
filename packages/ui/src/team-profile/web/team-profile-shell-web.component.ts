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
  effect,
  signal,
  OnInit,
  AfterViewInit,
  OnDestroy,
  PLATFORM_ID,
  viewChild,
  untracked,
  type TemplateRef,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  type TeamProfileTabId,
  type TeamProfileTab,
  type ProfilePost,
  type ProfileTimelineFilterId,
  type TeamProfilePost,
  type TeamProfileRosterMember,
  type TeamTimelineFilterId,
  TEAM_PROFILE_TABS,
  TEAM_PROFILE_EMPTY_STATES,
  type NewsArticle,
  getSeasonForDate,
} from '@nxt1/core';
import { NxtIconComponent } from '../../components/icon';
// NxtPageHeaderComponent not used — web team profile uses shell top nav on mobile and page header in wide layouts
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
import { NxtStateViewComponent } from '../../components/state-view';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { NxtHeaderPortalService } from '../../services/header-portal';
import { NxtBottomSheetService, SHEET_PRESETS } from '../../components/bottom-sheet';
import type { BottomSheetAction } from '../../components/bottom-sheet/bottom-sheet.types';
import { AgentXService } from '../../agent-x/agent-x.service';
import { AgentXOperationChatComponent } from '../../agent-x';
import { NxtPlatformService } from '../../services/platform/platform.service';
import { Router } from '@angular/router';
import { TeamProfileService } from '../team-profile.service';

// ─── Extracted Section Components ───
import { TeamMobileHeroComponent } from './team-mobile-hero.component';
import { TeamIntelComponent } from '../../intel/team-intel.component';
import { IntelService } from '../../intel/intel.service';
import { TeamRosterWebComponent } from './team-roster-web.component';
import { type ScheduleRow } from '@nxt1/core';
import { mapTeamStatsToGameLogs, buildSeasonRecordMap } from '@nxt1/core';
import { TeamContactWebComponent } from './team-contact-web.component';
import { ProfileVerificationBannerComponent } from '../../profile/components/profile-verification-banner.component';
import { TeamProfileSkeletonComponent } from './team-profile-skeleton.component';
import { ProfileScheduleComponent } from '../../profile/components/profile-schedule.component';
import { ProfileTimelineComponent } from '../../profile/profile-timeline.component';

const TEAM_INTEL_NAV_ITEMS: readonly SectionNavItem[] = [
  { id: 'agent_overview', label: 'Overview' },
  { id: 'team', label: 'Team' },
  { id: 'stats', label: 'Stats' },
  { id: 'recruiting', label: 'Recruiting' },
  { id: 'schedule', label: 'Schedule' },
] as const;

const TEAM_TIMELINE_EMPTY_STATE_BY_SECTION: Readonly<
  Record<string, { icon: string; title: string; message: string }>
> = {
  'all-posts': {
    icon: 'newspaper',
    title: 'No updates yet',
    message: 'Team updates and announcements will appear here.',
  },
  pinned: {
    icon: 'pin',
    title: 'No pinned updates yet',
    message: 'Pin a team update to keep it at the top of the timeline.',
  },
  media: {
    icon: 'image',
    title: 'No media yet',
    message: 'Photos and videos posted by the team will appear here.',
  },
  stats: {
    icon: 'stats-chart-outline',
    title: 'No stats yet',
    message: 'Team stat updates will appear here once they are posted or synced.',
  },
  games: {
    icon: 'trophy-outline',
    title: 'No game updates yet',
    message: 'Completed game results and recaps will appear here.',
  },
  schedule: {
    icon: 'calendar-outline',
    title: 'No schedule updates yet',
    message: 'Upcoming games and schedule changes will appear here.',
  },
  recruiting: {
    icon: 'trophy',
    title: 'No recruiting activity yet',
    message: 'Recruiting activity will appear here when the team posts or syncs it.',
  },
  news: {
    icon: 'newspaper-outline',
    title: 'No news yet',
    message: 'Team news and announcements will appear here.',
  },
};

@Component({
  selector: 'nxt1-team-profile-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtIconComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    NxtImageCarouselComponent,
    NxtStateViewComponent,
    // Extracted section components
    TeamMobileHeroComponent,
    TeamIntelComponent,
    TeamRosterWebComponent,
    TeamContactWebComponent,
    ProfileVerificationBannerComponent,
    TeamProfileSkeletonComponent,
    ProfileScheduleComponent,
    ProfileTimelineComponent,
  ],
  template: `
    <!-- Portal: center — Team name + subtitle teleported into top nav -->
    <ng-template #teamPortalContent>
      <div class="nxt1-header-portal header-portal-team">
        <button
          type="button"
          class="header-portal-back-btn"
          aria-label="Go back"
          (click)="backClick.emit()"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div class="header-portal-name-block">
          <span class="header-portal-title">{{ portalTeamName() }}</span>
          @if (portalTeamSubtitle()) {
            <span class="header-portal-subtitle">{{ portalTeamSubtitle() }}</span>
          }
        </div>
        @if (teamProfile.canEdit()) {
          <div class="nxt1-header-portal__center">
            <button
              type="button"
              class="header-nav-pill"
              (click)="manageTeamClick.emit()"
              aria-label="Manage team"
            >
              <nxt1-icon name="settings" [size]="13" />
              Manage Team
            </button>
          </div>
        }
      </div>
    </ng-template>

    <!-- Portal: right — Share + QR icon buttons in top nav (before bell) -->
    <ng-template #teamRightPortalContent>
      <button
        type="button"
        class="nav-action-btn"
        aria-label="Share team"
        (click)="shareClick.emit()"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
      </button>
      <button
        type="button"
        class="nav-action-btn"
        aria-label="QR code"
        (click)="qrCodeClick.emit()"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M3 3h7v7H3V3z" />
          <path d="M14 3h7v7h-7V3z" />
          <path d="M3 14h7v7H3v-7z" />
          <path d="M14 14h3v3h-3v-3z" />
          <path d="M20 14v3h-3" />
          <path d="M14 20h3v1" />
          <path d="M20 20h1v1" />
        </svg>
      </button>
    </ng-template>

    <main class="team-profile-main">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <!-- Loading Skeleton -->
      @if (teamProfile.isLoading()) {
        <nxt1-team-profile-skeleton />
      }
      <!-- Error State -->
      @else if (teamProfile.error()) {
        <nxt1-state-view
          variant="error"
          title="Failed to load team profile"
          [message]="teamProfile.error() || 'We could not load this team profile right now.'"
          actionLabel="Try Again"
          actionIcon="refresh"
          (action)="onRetry()"
        />
      }
      <!-- Content State -->
      @else if (isContentReady()) {
        <!-- Org brand colors injected via TeamProfileService → NxtThemeService.applyOrgTheme() -->
        <div class="madden-stage">
          <!-- ═══ SPLIT: LEFT CONTENT | RIGHT TEAM BRANDING ═══ -->
          <div class="madden-split">
            <!-- LEFT SIDE: Header + Tabs + Content -->
            <div class="madden-split-left">
              <!-- Mobile Hero (extracted component) -->
              @if (teamProfile.team()) {
                <div class="md:hidden">
                  <nxt1-team-mobile-hero (back)="backClick.emit()" />
                </div>
              }

              <!-- TOP TAB BAR -->
              <nav class="madden-top-tabs" aria-label="Team profile sections">
                <nxt1-option-scroller
                  [options]="tabOptions()"
                  [selectedId]="teamProfile.activeTab()"
                  [config]="{ scrollable: false, stretchToFill: true, showDivider: false }"
                  (selectionChange)="onTabChange($event)"
                />
              </nav>

              <!-- Content Area: Side tabs + scrollable content -->
              <div
                class="madden-content-layer"
                [class.madden-content-layer--no-side-nav]="!showSideNav()"
              >
                <!-- LEFT SIDE NAV COLUMN -->
                @if (showSideNav()) {
                  <div class="madden-side-nav-column">
                    <nxt1-section-nav-web
                      [items]="sideTabItems()"
                      [activeId]="activeSideTab()"
                      ariaLabel="Section navigation"
                      (selectionChange)="onSectionNavChange($event)"
                    />
                  </div>
                }

                <!-- MAIN CONTENT AREA — Each tab renders its own extracted component -->
                <section
                  class="madden-content-scroll"
                  [class.madden-content-scroll--wide]="useFullWidthIntelLayout()"
                  aria-live="polite"
                >
                  <nxt1-profile-verification-banner
                    [activeTab]="teamProfile.activeTab()"
                    [activeSideTab]="activeSideTab()"
                  />

                  @switch (teamProfile.activeTab()) {
                    @case ('intel') {
                      @if (activeSideTab() === 'contact') {
                        <nxt1-team-contact-web (manageTeam)="manageTeamClick.emit()" />
                      } @else {
                        <nxt1-team-intel
                          [teamId]="teamProfile.team()!.id"
                          [activeSection]="activeIntelSection()"
                          [canGenerate]="teamProfile.canEdit()"
                          (generateClick)="onGenerateTeamIntel()"
                          (resyncClick)="onResyncTeamIntel()"
                          (missingDataAction)="manageTeamClick.emit()"
                        />
                      }
                    }

                    @case ('timeline') {
                      @if (isTeamAdmin() && !platform.isMobile()) {
                        <div class="desktop-intel-action-bar">
                          <button
                            type="button"
                            class="desktop-intel-action-bar__btn"
                            (click)="onAddUpdate()"
                          >
                            <nxt1-icon name="plus" [size]="16" />
                            Add Update
                          </button>
                        </div>
                      }

                      <nxt1-profile-timeline
                        [polymorphicFeed]="teamProfile.timeline()"
                        [isLoading]="teamProfile.timelineLoading()"
                        [isLoadingMore]="teamProfile.isLoadingMore()"
                        [isEmpty]="teamProfile.timeline().length === 0"
                        [hasMore]="teamProfile.timelineHasMore()"
                        [isOwnProfile]="isTeamAdmin()"
                        [showMenu]="false"
                        [showFilters]="false"
                        [filter]="timelineSidebarFilter()"
                        [emptyIcon]="teamTimelineEmptyState().icon"
                        [emptyTitle]="teamTimelineEmptyState().title"
                        [emptyMessage]="teamTimelineEmptyState().message"
                        [emptyCta]="null"
                        (postClick)="onTimelinePostClick($event)"
                        (loadMore)="onLoadMore()"
                      />
                    }

                    @case ('roster') {
                      <nxt1-team-roster-web
                        [activeSideTab]="activeSideTab()"
                        (memberClick)="onRosterMemberClick($event)"
                        (invite)="inviteRosterClick.emit()"
                        (manageTeam)="manageTeamClick.emit()"
                      />
                    }

                    @case ('connect') {
                      <nxt1-team-contact-web
                        [activeSection]="activeSideTab()"
                        (manageTeam)="manageTeamClick.emit()"
                        (connectedAccountsClick)="connectedAccountsClick.emit()"
                      />
                    }

                    @case ('schedule') {
                      <nxt1-profile-schedule
                        [rows]="teamScheduleRows()"
                        [activeSideTab]="activeSideTab()"
                        emptyMessage="No games scheduled yet."
                      />
                    }
                  }
                </section>
              </div>
            </div>

            <div class="madden-split-right">
              <div class="madden-right-stack">
                @if (teamDesktopImages().length > 0) {
                  <div class="madden-team-media-card madden-team-media-card--gallery">
                    <nxt1-image-carousel
                      [images]="teamDesktopImages()"
                      [alt]="portalTeamName()"
                      [autoPlay]="true"
                      [autoPlayInterval]="4200"
                      [overlayTitle]="portalTeamName()"
                      [overlaySubtitle]="teamCarouselSubtitle()"
                      class="madden-team-carousel"
                    />
                  </div>
                } @else if (teamProfile.team()?.logoUrl) {
                  <div class="madden-team-media-card madden-team-media-card--logo">
                    <img
                      class="madden-team-media-card__logo"
                      [src]="teamProfile.team()!.logoUrl!"
                      [alt]="portalTeamName()"
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                } @else {
                  <div class="madden-team-media-card madden-team-media-card--placeholder">
                    <div class="madden-team-carousel-placeholder" aria-hidden="true">
                      <div class="madden-team-carousel-placeholder__icon">
                        <nxt1-icon name="business" [size]="40" />
                      </div>
                      <div class="madden-team-carousel-placeholder__text">
                        <span class="madden-team-carousel-placeholder__title">{{
                          portalTeamName()
                        }}</span>
                        @if (teamCarouselSubtitle()) {
                          <span class="madden-team-carousel-placeholder__subtitle">{{
                            teamCarouselSubtitle()
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

        @if (isTeamAdmin() && teamProfile.activeTab() === 'timeline' && platform.isMobile()) {
          <div class="mobile-intel-footer">
            <button
              type="button"
              class="mobile-intel-footer__btn mobile-intel-footer__btn--primary"
              (click)="onAddUpdate()"
            >
              Add Update
            </button>
          </div>
        }
      }
      <!-- Fallback: Show skeleton if no state matches (safety net for SSR hydration) -->
      @else {
        <nxt1-team-profile-skeleton />
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
        --m-accent: var(--nxt1-color-primary, #d4ff00);
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .header-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        padding: 0;
        margin: 0;
        border: none;
        background: transparent;
        border-radius: var(--nxt1-radius-full, 50%);
        color: var(--m-text);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color 0.15s ease,
          transform 0.1s ease;
      }

      .header-action-btn:active {
        background: var(--m-surface-2);
        transform: scale(0.92);
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
      /* ─── HEADER PORTAL — Perplexity-style team identity in top nav ─── */
      .header-portal-team {
        gap: 10px;
      }
      .header-portal-back-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-full, 9999px);
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        color: var(--nxt1-color-text-primary, #ffffff);
        cursor: pointer;
        transition: all 0.15s ease;
        flex-shrink: 0;
        padding: 0;
      }
      .header-portal-back-btn:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        border-color: rgba(255, 255, 255, 0.14);
      }
      .header-portal-back-btn:active {
        transform: scale(0.95);
      }
      .header-portal-logo {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }
      .header-portal-logo-fallback {
        width: 32px;
        height: 32px;
        border-radius: var(--nxt1-radius-md, 8px);
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--nxt1-color-text-tertiary);
        flex-shrink: 0;
      }
      .header-portal-name-block {
        display: flex;
        flex-direction: column;
        min-width: 0;
        gap: 1px;
      }
      .header-portal-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-portal-subtitle {
        font-size: 12px;
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .header-nav-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        flex-shrink: 0;
        margin-left: auto;
        padding: 6px 16px;
        appearance: none;
        -webkit-appearance: none;
        border-radius: var(--nxt1-borderRadius-lg, 0.5rem);
        font-size: 13px;
        font-weight: 600;
        line-height: 1;
        white-space: nowrap;
        color: var(--nxt1-color-text-primary, #ffffff);
        background: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.06));
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .header-nav-pill:hover {
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }
      .header-nav-pill:active {
        transform: scale(0.98);
      }
      .madden-right-stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-2);
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
        padding-top: var(--nxt1-spacing-4, 16px);
        padding-left: calc(var(--shell-content-padding-x, 32px) - 4px);
      }
      .madden-content-layer--no-side-nav {
        grid-template-columns: minmax(0, 1fr);
        gap: 0;
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
      .madden-content-scroll--wide {
        align-items: stretch;
      }
      .madden-content-scroll--wide > * {
        max-width: none;
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

      .madden-team-media-card {
        position: relative;
        width: 100%;
        border-radius: 16px;
        border: 1px solid var(--m-border);
        background:
          radial-gradient(circle at top, rgba(255, 255, 255, 0.06), transparent 52%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02));
        overflow: hidden;
      }
      .madden-team-media-card--gallery {
        height: 56vh;
      }
      .madden-team-media-card--logo,
      .madden-team-media-card--placeholder {
        min-height: 248px;
      }
      .madden-team-carousel {
        position: relative;
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
      .madden-team-carousel-placeholder {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        min-height: 248px;
        width: 100%;
        padding: 24px;
        overflow: hidden;
        text-align: center;
      }
      .madden-team-media-card__logo {
        display: block;
        width: 100%;
        height: 248px;
        object-fit: cover;
        object-position: center;
      }
      .madden-team-carousel-placeholder__icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 88px;
        height: 88px;
        border-radius: 50%;
        background: color-mix(in srgb, var(--m-accent) 10%, transparent);
        border: 1px solid color-mix(in srgb, var(--m-accent) 22%, var(--m-border));
        color: var(--m-accent);
      }
      .madden-team-carousel-placeholder__text {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: 220px;
      }
      .madden-team-carousel-placeholder__title {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--m-text);
      }
      .madden-team-carousel-placeholder__subtitle {
        font-size: 0.875rem;
        color: var(--m-text-2);
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
          padding-top: 18px;
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
          padding: 0 12px 120px;
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

      /* ─── Desktop Intel Action Bar ─── */
      .desktop-intel-action-bar {
        display: flex;
        justify-content: flex-end;
        padding: 0 0 12px;
      }
      .desktop-intel-action-bar__btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 18px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 700;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
        background: var(--m-accent);
        color: var(--nxt1-color-text-onPrimary, #000);
        transition:
          filter 150ms ease,
          transform 150ms ease;
      }
      .desktop-intel-action-bar__btn:hover {
        filter: brightness(1.08);
        transform: translateY(-1px);
      }

      /* ─── Mobile VP Intel Footer ─── */
      .mobile-intel-footer {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 100;
        display: flex;
        gap: 8px;
        padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
        background: var(--nxt1-color-bg-primary, #0a0a0a);
        border-top: 1px solid var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
      }
      .mobile-intel-footer__btn {
        flex: 1;
        padding: 11px 12px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 700;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
        transition:
          filter 150ms ease,
          transform 150ms ease;
      }
      .mobile-intel-footer__btn:active {
        transform: scale(0.97);
      }
      .mobile-intel-footer__btn--primary {
        background: var(--m-accent);
        color: var(--nxt1-color-text-onPrimary, #000);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamProfileShellWebComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly teamProfile = inject(TeamProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('TeamProfileShellWeb');
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly intel = inject(IntelService);
  private readonly agentX = inject(AgentXService);
  protected readonly platform = inject(NxtPlatformService);
  private readonly router = inject(Router);
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  // Template refs for portal content
  private readonly teamPortalContent = viewChild<TemplateRef<unknown>>('teamPortalContent');
  private readonly teamRightPortalContent =
    viewChild<TemplateRef<unknown>>('teamRightPortalContent');

  // ============================================
  // INPUTS
  // ============================================

  /** Team slug to load */
  readonly teamSlug = input<string>('');

  /**
   * Firestore document ID of the team.
   * When provided, takes priority over teamSlug to avoid ambiguity
   * when multiple teams share the same name/slug.
   */
  readonly teamId = input<string>('');

  /** Whether the current user is an admin of this team */
  readonly isTeamAdmin = input(false);

  /**
   * When true, skip the internal ngOnInit data fetch.
   * Used by platform wrappers (mobile) that manage their own API calls
   * and push data via TeamProfileService.loadFromExternalData().
   */
  readonly skipInternalLoad = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly backClick = output<void>();
  readonly tabChange = output<TeamProfileTabId>();
  readonly shareClick = output<void>();
  readonly copyLinkClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly manageTeamClick = output<void>();
  readonly connectedAccountsClick = output<void>();
  readonly inviteRosterClick = output<void>();
  readonly rosterMemberClick = output<TeamProfileRosterMember>();
  readonly postClick = output<TeamProfilePost>();
  readonly refreshRequest = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  /** Check if content is ready to render (prevents SSR hydration mismatch) */
  protected readonly isContentReady = computed(() => {
    return (
      !this.teamProfile.isLoading() &&
      !this.teamProfile.error() &&
      !!this.teamProfile.team()?.teamName
    );
  });

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

  /**
   * News board items sourced from the News collection (type==='team' documents).
   * Sorted newest-first. The news-board component accepts NewsArticle[] directly.
   */
  protected readonly teamNewsBoardItems = computed((): readonly NewsArticle[] =>
    [...this.teamProfile.newsArticles()].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
  );

  protected readonly teamDesktopImages = computed<readonly string[]>(() => {
    const team = this.teamProfile.team();
    if (!team) return [];

    const seen = new Set<string>();
    const images: string[] = [];

    for (const image of team.galleryImages ?? []) {
      const normalized = image?.trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      images.push(normalized);
    }

    return images;
  });

  protected readonly teamCarouselSubtitle = computed(
    () => this.headerSubtitle() || this.portalTeamSubtitle()
  );

  /** Portal: top nav header title */
  protected readonly portalTeamName = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return 'Team';

    const organization = this.organizationName().trim();
    const mascot = team.branding?.mascot?.trim();

    if (organization && mascot) {
      return organization.toLowerCase().endsWith(mascot.toLowerCase())
        ? organization
        : `${organization} ${mascot}`;
    }

    return organization || team.teamName?.trim() || 'Team';
  });

  /** Portal: team type + sport subtitle for top nav header */
  protected readonly portalTeamSubtitle = computed(() => {
    const team = this.teamProfile.team();
    if (!team) return '';
    const typeLabel = team.teamType
      ? team.teamType
          .split('-')
          .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(' ')
      : '';
    const sportLabel = team.sport?.trim() ?? '';
    return `${typeLabel} ${sportLabel}`.trim();
  });

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

  /**
   * Background variant toggle.
   * - 'modern'   — clean team-color gradient (current default)
   * - 'halftone' — legacy recruiting-card halftone dots
   */

  // Org brand colors are injected page-wide via TeamProfileService → NxtThemeService.applyOrgTheme().
  // No per-component inline style needed — the CSS cascade via --team-primary / --team-accent handles it.

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
    return TEAM_PROFILE_EMPTY_STATES[tab] || TEAM_PROFILE_EMPTY_STATES['intel'];
  });

  protected readonly useFullWidthIntelLayout = computed(
    () => this.teamProfile.activeTab() === 'intel'
  );

  protected readonly timelineSidebarFilter = computed<ProfileTimelineFilterId>(() => {
    const filterMap: Readonly<Record<string, ProfileTimelineFilterId>> = {
      'all-posts': 'all',
      pinned: 'pinned',
      media: 'media',
      stats: 'stats',
      games: 'events',
      schedule: 'all',
      recruiting: 'recruiting',
      news: 'news',
    };

    return filterMap[this.activeSideTab()] ?? 'all';
  });

  protected readonly teamTimelineEmptyState = computed(() => {
    return (
      TEAM_TIMELINE_EMPTY_STATE_BY_SECTION[this.activeSideTab()] ??
      TEAM_TIMELINE_EMPTY_STATE_BY_SECTION['all-posts']
    );
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
      intel: [...TEAM_INTEL_NAV_ITEMS],
      timeline: [
        {
          id: 'all-posts',
          label: 'All Posts',
          badge: this.teamProfile.allPosts().length || undefined,
        },
        {
          id: 'pinned',
          label: 'Pinned',
          badge: this.teamProfile.pinnedPosts().length || undefined,
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
                  !!post.thumbnailUrl ||
                  !!post.mediaUrl
              ).length || undefined,
        },
        { id: 'stats', label: 'Stats' },
        { id: 'games', label: 'Games' },
        { id: 'schedule', label: 'Schedule' },
        { id: 'recruiting', label: 'Recruiting' },
        { id: 'news', label: 'News' },
      ],
      roster: [
        { id: 'all', label: 'All', badge: this.teamProfile.rosterCount() || undefined },
        ...this.teamProfile.rosterClassYears().map((year) => ({
          id: `class-${year}`,
          label: `Class of ${year}`,
        })),
      ],
      connect: [
        { id: 'connected', label: 'Accounts' },
        { id: 'contact', label: 'Contact' },
      ],
      schedule: [
        {
          id: 'all-games',
          label: 'All Games',
          badge: this.teamProfile.schedule().length || undefined,
        },
        ...this.scheduleSeasons().map((season) => ({
          id: `season-${season}`,
          label: season,
        })),
      ],
    };

    return sections[tab] ?? sections['intel'];
  });

  protected readonly showSideNav = computed(() => this.sideTabItems().length > 0);

  protected readonly activeIntelSection = computed<string>(() => {
    const current = this.activeSideTab();
    if (TEAM_INTEL_NAV_ITEMS.some((item) => item.id === current)) return current;
    return TEAM_INTEL_NAV_ITEMS[0]?.id ?? 'agent_overview';
  });

  /** Active side tab */
  private readonly _activeSideTab = signal<string>('');
  protected readonly activeSideTab = computed(() => {
    const current = this._activeSideTab();
    const items = this.sideTabItems();
    if (current && items.some((i) => i.id === current)) return current;
    return items[0]?.id ?? '';
  });

  constructor() {
    effect(() => {
      const activeTab = this.teamProfile.activeTab();
      const teamId = this.teamProfile.team()?.id;
      const teamCode = this.teamProfile.team()?.slug ?? this.teamSlug();

      if (activeTab === 'intel' && teamId) {
        void this.intel.loadTeamIntel(teamId);
      }

      if (activeTab === 'timeline' && teamCode) {
        untracked(() => {
          if (this.teamProfile.timeline().length === 0 && !this.teamProfile.timelineLoading()) {
            void this.teamProfile.loadTimeline(teamCode, 'all');
          }
        });
      }
    });
  }

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    if (this.skipInternalLoad()) {
      return; // Parent component handles data loading via loadFromExternalData()
    }

    if (!this.isBrowser) return;

    const teamId = this.teamId();
    const slug = this.teamSlug();
    const isAdmin = this.isTeamAdmin();

    if (teamId) {
      // Prefer ID lookup — exact match, avoids slug ambiguity across same-name teams
      this.teamProfile.startLoading();
      this.teamProfile.loadTeamById(teamId, isAdmin);
    } else if (slug) {
      this.teamProfile.startLoading();
      this.teamProfile.loadTeam(slug, isAdmin);
    }
  }

  private mapTimelineSectionToFilter(sectionId: string): TeamTimelineFilterId {
    const sectionToFilter: Readonly<Record<string, TeamTimelineFilterId>> = {
      'all-posts': 'all',
      pinned: 'all',
      media: 'media',
      stats: 'stats',
      games: 'games',
      schedule: 'schedule',
      recruiting: 'recruiting',
      news: 'news',
    };

    return sectionToFilter[sectionId] ?? 'all';
  }

  private syncTimelineFilter(sectionId: string): void {
    const teamCode = this.teamProfile.team()?.slug ?? this.teamSlug();
    if (!teamCode) return;
    const filter = this.mapTimelineSectionToFilter(sectionId);

    if (this.teamProfile.activeTimelineFilter() !== filter) {
      void this.teamProfile.setTimelineFilter(teamCode, filter);
    }
  }

  ngAfterViewInit(): void {
    const centerTpl = this.teamPortalContent();
    if (centerTpl) this.headerPortal.setCenterContent(centerTpl);
    const rightTpl = this.teamRightPortalContent();
    if (rightTpl) this.headerPortal.setRightContent(rightTpl);
  }

  ngOnDestroy(): void {
    this.teamProfile.reset();
    this.headerPortal.clearAll();
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as TeamProfileTabId;
    this.teamProfile.setActiveTab(tabId);
    this._activeSideTab.set('');
    this.tabChange.emit(tabId);

    // Load timeline on first switch — data is lazy-fetched, not pre-loaded
    if (tabId === 'timeline') {
      this.syncTimelineFilter(this.activeSideTab());
    }
  }

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSideTab.set(event.id);

    if (this.teamProfile.activeTab() === 'timeline') {
      this.syncTimelineFilter(event.id);
    }
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      if (this.skipInternalLoad()) {
        this.refreshRequest.emit();
        return;
      }
      await this.teamProfile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    const teamId = this.teamId();
    const slug = this.teamSlug();
    if (teamId) {
      this.teamProfile.loadTeamById(teamId, this.isTeamAdmin());
    } else if (slug) {
      this.teamProfile.loadTeam(slug, this.isTeamAdmin());
    }
  }

  /**
   * Opens team quick actions bottom sheet.
   * Mirrors ProfileShell mobile header menu behavior.
   */
  protected async onMenuClick(): Promise<void> {
    this.menuClick.emit();

    const isAdmin = this.isTeamAdmin();
    const actions: BottomSheetAction[] = isAdmin
      ? [
          { label: 'Manage Team', role: 'secondary', icon: 'settings' },
          { label: 'Share Team', role: 'secondary', icon: 'share' },
          { label: 'QR Code', role: 'secondary', icon: 'qrCode' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
        ]
      : [
          { label: 'Share Team', role: 'secondary', icon: 'share' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
          { label: 'Report', role: 'destructive', icon: 'flag' },
        ];

    const result = await this.bottomSheet.show<BottomSheetAction>({
      actions,
      showClose: false,
      backdropDismiss: true,
      ...SHEET_PRESETS.COMPACT,
    });

    const selected = result?.data as BottomSheetAction | undefined;
    if (!selected) return;

    switch (selected.label) {
      case 'Manage Team':
        this.manageTeamClick.emit();
        break;
      case 'Share Team':
        this.shareClick.emit();
        break;
      case 'QR Code':
        this.qrCodeClick.emit();
        break;
      case 'Copy Link':
        this.copyLinkClick.emit();
        break;
      case 'Report':
        this.logger.info('Report team requested');
        break;
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

  protected onTimelinePostClick(post: ProfilePost): void {
    const teamPost = this.teamProfile.allPosts().find((item) => item.id === post.id);
    if (!teamPost) return;
    this.onPostClick(teamPost);
  }

  protected onLoadMore(): void {
    const teamCode = this.teamProfile.team()?.slug ?? this.teamSlug();
    if (!teamCode) return;
    void this.teamProfile.loadMoreTimeline(teamCode);
  }

  protected onAddUpdate(): void {
    void this.onCreatePostWithAgent();
  }

  private async onCreatePostWithAgent(): Promise<void> {
    const hasReport = !!this.intel.teamReport();
    const message = hasReport
      ? 'I want to create a post for our team timeline. After creating the post, automatically review it and update any relevant sections of our Agent X Intel report with new stats, results, recruiting activity, or program updates from the post.'
      : 'I want to create a post for our team timeline.';

    if (this.platform.isMobile()) {
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: 'team-timeline-post',
          contextTitle: 'Create a Post',
          contextIcon: 'create-outline',
          contextType: 'command',
          initialMessage: message,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
    } else {
      this.agentX.queueStartupMessage(message);
      void this.router.navigate(['/agent']);
    }
  }

  protected async onGenerateTeamIntel(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;
    const hasReport = !!this.intel.teamReport();
    const activeSection = this.activeIntelSection();
    const activeSectionLabel =
      TEAM_INTEL_NAV_ITEMS.find((item) => item.id === activeSection)?.label ?? 'Intel';
    const initialMessage = hasReport
      ? `Update the ${activeSectionLabel} section of our Agent X Intel report.`
      : `Generate an Agent X Intel report for our team.`;
    if (this.platform.isMobile()) {
      this.intel.startPendingGeneration();
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: 'team-intel-generate',
          contextTitle: hasReport ? 'Update Intel' : 'Generate Intel',
          contextIcon: 'flash-outline',
          contextType: 'command',
          initialMessage,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
      if (!this.intel.isAnythingGenerating()) {
        await this.intel.generateTeamIntel(team.id);
      }
    } else {
      this.agentX.queueStartupMessage(initialMessage);
      void this.router.navigate(['/agent']);
    }
  }

  protected async onResyncTeamIntel(): Promise<void> {
    const team = this.teamProfile.team();
    if (!team) return;
    const message = `Do a full resync of our Agent X Intel report. Gather all current data and regenerate the entire report from scratch.`;
    if (this.platform.isMobile()) {
      this.intel.startPendingGeneration();
      await this.bottomSheet.openSheet({
        component: AgentXOperationChatComponent,
        componentProps: {
          contextId: 'team-intel-resync',
          contextTitle: 'Resync Intel',
          contextIcon: 'refresh-outline',
          contextType: 'command',
          initialMessage: message,
        },
        ...SHEET_PRESETS.FULL,
        showHandle: true,
        handleBehavior: 'cycle',
        backdropDismiss: true,
        cssClass: 'agent-x-operation-sheet',
      });
      if (!this.intel.isAnythingGenerating()) {
        await this.intel.generateTeamIntel(team.id);
      }
    } else {
      this.agentX.queueStartupMessage(message);
      void this.router.navigate(['/agent']);
    }
  }

  protected onNewsBoardItemClick(item: NewsArticle): void {
    this.logger.debug('News board item click', { itemId: item.id, title: item.title });
  }
}
