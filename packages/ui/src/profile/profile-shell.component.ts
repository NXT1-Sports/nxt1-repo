/**
 * @fileoverview Profile Shell Component — Mobile (Ionic)
 * @module @nxt1/ui/profile
 * @version 2.0.0
 *
 * Root-level mobile shell for the Profile feature.
 * Uses the same sub-components as the web's ≤768 px responsive layout
 * to guarantee 100 % visual parity across platforms.
 *
 * ⭐ MOBILE (IONIC) — For web SSR use ProfileShellWebComponent ⭐
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  NxtPageHeaderComponent (back, Agent X, edit, menu)        │
 * ├─────────────────────────────────────────────────────────────┤
 * │  IonContent (native scroll, pull-to-refresh, safe areas)   │
 * │  ├── ProfileMobileHeroComponent (carousel + identity)      │
 * │  ├── NxtOptionScrollerComponent (top tab bar)              │
 * │  ├── NxtSectionNavWebComponent (section nav pills)         │
 * │  ├── ProfileVerificationBannerComponent                    │
 * │  └── Tab content (overview, timeline, offers, metrics …)   │
 * └─────────────────────────────────────────────────────────────┘
 *
 * @example
 * ```html
 * <nxt1-profile-shell
 *   [currentUser]="currentUser()"
 *   [profileUnicode]="unicode()"
 *   [isOwnProfile]="isOwn()"
 *   [skipInternalLoad]="true"
 *   (backClick)="navController.back()"
 *   (editProfileClick)="openEditSheet()"
 * />
 * ```
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_EMPTY_STATES,
  getProfileTabsForUser,
  getOverviewSectionLabels,
  type ProfileRecruitingActivity,
  type ProfileEvent,
  type ProfilePost,
  type NewsArticle,
  type ProfileTimelineFilterId,
  type ProfileSeasonGameLog,
  type ScoutReport,
  type ScheduleRow,
  filterScheduleEvents,
  mapProfileEventsToScheduleRows,
  getScheduleSeasons,
} from '@nxt1/core';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NxtIconComponent } from '../components/icon';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import {
  NxtSectionNavWebComponent,
  type SectionNavItem,
  type SectionNavChangeEvent,
} from '../components/section-nav-web';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBottomSheetService, SHEET_PRESETS } from '../components/bottom-sheet';
import type { BottomSheetAction } from '../components/bottom-sheet/bottom-sheet.types';
import { ProfileService } from './profile.service';
import { ProfileTimelineComponent } from './profile-timeline.component';
import { ProfileOffersComponent } from './profile-offers.component';
import { ProfileEventsComponent } from './profile-events.component';
import { ProfileSkeletonComponent } from './profile-skeleton.component';
import { ProfileRankingsComponent } from './rankings/profile-rankings.component';
import {
  ProfileMobileHeroComponent,
  ProfileOverviewComponent,
  ProfileScoutingComponent,
  ProfileMetricsComponent,
  ProfileAcademicComponent,
  ProfileContactComponent,
  ProfileVerificationBannerComponent,
} from './components';
import { ScheduleBoardComponent } from '../components/schedule-board';
import { StatsDashboardComponent } from '../components/stats-dashboard/stats-dashboard.component';
import { NewsBoardComponent } from '../components/news-board/news-board.component';

/**
 * User info passed from parent (web / mobile wrapper).
 */
export interface ProfileShellUser {
  readonly profileImg?: string | null;
  readonly displayName?: string | null;
}

@Component({
  selector: 'nxt1-profile-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    NxtPageHeaderComponent,
    NxtIconComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    ProfileMobileHeroComponent,
    ProfileOverviewComponent,
    ProfileTimelineComponent,
    ProfileOffersComponent,
    ProfileEventsComponent,
    ProfileSkeletonComponent,
    NewsBoardComponent,
    ProfileScoutingComponent,
    ProfileRankingsComponent,
    ProfileMetricsComponent,
    ProfileAcademicComponent,
    ScheduleBoardComponent,
    StatsDashboardComponent,
    ProfileContactComponent,
    ProfileVerificationBannerComponent,
  ],
  template: `
    <!-- ═══ TOP NAVIGATION HEADER ═══ -->
    <nxt1-page-header
      [showBack]="shouldShowBack()"
      (backClick)="backClick.emit()"
      (menuClick)="menuClick.emit()"
    >
      <div pageHeaderSlot="title" class="header-logo">
        <span class="header-title-text">Profile</span>
        <svg
          class="header-brand-logo"
          viewBox="0 0 612 792"
          width="40"
          height="40"
          fill="currentColor"
          stroke="currentColor"
          stroke-width="10"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M505.93,251.93c5.52-5.52,1.61-14.96-6.2-14.96h-94.96c-2.32,0-4.55.92-6.2,2.57l-67.22,67.22c-4.2,4.2-11.28,3.09-13.99-2.2l-32.23-62.85c-1.49-2.91-4.49-4.75-7.76-4.76l-83.93-.34c-6.58-.03-10.84,6.94-7.82,12.78l66.24,128.23c1.75,3.39,1.11,7.52-1.59,10.22l-137.13,137.13c-11.58,11.58-3.36,31.38,13.02,31.35l71.89-.13c2.32,0,4.54-.93,6.18-2.57l82.89-82.89c4.19-4.19,11.26-3.1,13.98,2.17l40.68,78.74c1.5,2.91,4.51,4.74,7.78,4.74h82.61c6.55,0,10.79-6.93,7.8-12.76l-73.61-143.55c-1.74-3.38-1.09-7.5,1.6-10.19l137.98-137.98ZM346.75,396.42l69.48,134.68c1.77,3.43-.72,7.51-4.58,7.51h-51.85c-2.61,0-5.01-1.45-6.23-3.76l-48.11-91.22c-2.21-4.19-7.85-5.05-11.21-1.7l-94.71,94.62c-1.32,1.32-3.11,2.06-4.98,2.06h-62.66c-4.1,0-6.15-4.96-3.25-7.85l137.28-137.14c5.12-5.12,6.31-12.98,2.93-19.38l-61.51-116.63c-1.48-2.8.55-6.17,3.72-6.17h56.6c2.64,0,5.05,1.47,6.26,3.81l39.96,77.46c2.19,4.24,7.86,5.12,11.24,1.75l81.05-80.97c1.32-1.32,3.11-2.06,4.98-2.06h63.61c3.75,0,5.63,4.54,2.97,7.19l-129.7,129.58c-2.17,2.17-2.69,5.49-1.28,8.21Z"
          />
          <polygon
            points="390.96 303.68 268.3 411.05 283.72 409.62 205.66 489.34 336.63 377.83 321.21 379.73 390.96 303.68"
          />
        </svg>
      </div>

      <div pageHeaderSlot="end" class="header-actions">
        <button
          type="button"
          class="header-action-btn"
          aria-label="More options"
          (click)="onMenuClick()"
        >
          <nxt1-icon name="moreHorizontal" [size]="22" />
        </button>
        @if (profile.isOwnProfile()) {
          <button
            type="button"
            class="header-action-btn"
            aria-label="Edit profile"
            (click)="editProfileClick.emit()"
          >
            <nxt1-icon name="pencil" [size]="22" />
          </button>
        }
      </div>
    </nxt1-page-header>

    <!-- ═══ SCROLLABLE CONTENT ═══ -->
    <ion-content [fullscreen]="true" class="profile-content">
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="profile-container">
        <!-- Loading State -->
        @if (profile.isLoading()) {
          <nxt1-profile-skeleton variant="full" />
        }

        <!-- Error State -->
        @else if (profile.error()) {
          <div class="profile-error">
            <div class="error-icon" aria-hidden="true">⚠️</div>
            <h3>Failed to load profile</h3>
            <p>{{ profile.error() }}</p>
            <button type="button" class="retry-btn" (click)="onRetry()">Try Again</button>
          </div>
        }

        <!-- ═══ PROFILE CONTENT ═══ -->
        @else if (profile.user()) {
          <!-- Halftone accent background (same as web profile) -->
          <div class="halftone-bg" aria-hidden="true">
            <div class="halftone-dots"></div>
            <div class="halftone-fade"></div>
          </div>

          <!-- Mobile Hero: Carousel + Identity + Stats -->
          <nxt1-profile-mobile-hero
            [isOwnProfile]="profile.isOwnProfile()"
            (followClick)="onFollowToggle()"
          />

          <!-- Tab Bar (Overview, Timeline, Videos, News, Recruit …) -->
          <nav class="top-tabs" aria-label="Profile sections">
            <nxt1-option-scroller
              [options]="tabOptions()"
              [selectedId]="profile.activeTab()"
              [config]="{ scrollable: true, stretchToFill: false, showDivider: false }"
              (selectionChange)="onTabChange($event)"
            />
          </nav>

          <!-- Section Nav Pills (Player Info / History / Awards …) -->
          <div class="section-nav-row">
            <nxt1-section-nav-web
              [items]="sideTabItems()"
              [activeId]="activeSideTab()"
              ariaLabel="Section navigation"
              (selectionChange)="onSectionNavChange($event)"
            />
          </div>

          <!-- Verification Banner -->
          <nxt1-profile-verification-banner
            [activeTab]="profile.activeTab()"
            [activeSideTab]="activeSideTab()"
            [profileUser]="profile.user()"
          />

          <!-- ═══ TAB CONTENT ═══ -->
          <section class="tab-content" aria-live="polite">
            @switch (profile.activeTab()) {
              @case ('overview') {
                <nxt1-profile-overview
                  [activeSideTab]="activeSideTab()"
                  (editProfileClick)="editProfileClick.emit()"
                  (editTeamClick)="editTeamClick.emit()"
                />
              }

              @case ('timeline') {
                <nxt1-profile-timeline
                  [posts]="profile.filteredPosts()"
                  [unifiedFeed]="profile.unifiedTimeline()"
                  [profileUser]="profile.user()"
                  [isLoading]="false"
                  [isLoadingMore]="profile.isLoadingMore()"
                  [isEmpty]="profile.isEmpty()"
                  [hasMore]="profile.hasMore()"
                  [isOwnProfile]="profile.isOwnProfile()"
                  [showMenu]="profile.isOwnProfile()"
                  [showFilters]="false"
                  [filter]="timelineFilter()"
                  [emptyIcon]="emptyState().icon"
                  [emptyTitle]="emptyState().title"
                  [emptyMessage]="emptyState().message"
                  [emptyCta]="profile.isOwnProfile() ? (emptyState().ctaLabel ?? null) : null"
                  (postClick)="onPostClick($event)"
                  (reactClick)="onLikePost($event)"
                  (repostClick)="onCommentPost($event)"
                  (shareClick)="onSharePost($event)"
                  (menuClick)="onPostMenu($event)"
                  (loadMore)="onLoadMore()"
                  (emptyCtaClick)="onCreatePost()"
                />
              }

              @case ('news') {
                <nxt1-news-board
                  [items]="newsBoardItems()"
                  [isLoading]="profile.isLoading()"
                  [activeSection]="activeSideTab()"
                  [entityName]="profile.user()?.firstName ?? 'Athlete'"
                  [emptyCta]="profile.isOwnProfile() ? 'Share News' : null"
                  (itemClick)="onNewsBoardItemClick($event)"
                  (emptyCtaClick)="onAddNews()"
                />
              }

              @case ('videos') {
                <nxt1-profile-timeline
                  [posts]="profile.videoPosts()"
                  [profileUser]="profile.user()"
                  [isLoading]="false"
                  [isEmpty]="profile.videoPosts().length === 0"
                  [isOwnProfile]="profile.isOwnProfile()"
                  [showFilters]="false"
                  [emptyIcon]="emptyState().icon"
                  [emptyTitle]="emptyState().title"
                  [emptyMessage]="emptyState().message"
                  [emptyCta]="profile.isOwnProfile() ? (emptyState().ctaLabel ?? null) : null"
                  (postClick)="onPostClick($event)"
                  (reactClick)="onLikePost($event)"
                  (shareClick)="onSharePost($event)"
                  (emptyCtaClick)="onUploadVideo()"
                />
              }

              @case ('offers') {
                @if (activeSideTab() === 'rankings') {
                  <nxt1-profile-rankings />
                } @else if (activeSideTab() === 'scouting') {
                  <nxt1-profile-scouting
                    [isLoading]="profile.isLoading()"
                    [emptyCta]="profile.isOwnProfile() ? 'Add Scout Report' : null"
                    (reportClick)="onScoutReportClick($event)"
                    (emptyCtaClick)="onAddScoutReport()"
                  />
                } @else {
                  <nxt1-profile-offers
                    [offers]="profile.offers()"
                    [committedOffers]="profile.committedOffers()"
                    [activeOffers]="profile.activeOffers()"
                    [interestOffers]="profile.interestOffers()"
                    [isEmpty]="!profile.hasRecruitingActivity()"
                    [isOwnProfile]="profile.isOwnProfile()"
                    [activeSection]="activeSideTab()"
                    cardLayout="horizontal"
                    (offerClick)="onOfferClick($event)"
                    (addOfferClick)="onAddOffer()"
                    (addCommitmentClick)="onAddOffer()"
                  />
                }
              }

              @case ('metrics') {
                <nxt1-profile-metrics [activeSideTab]="activeSideTab()" />
              }

              @case ('stats') {
                <nxt1-stats-dashboard
                  [gameLogs]="profile.gameLog()"
                  [athleticStats]="profile.athleticStats()"
                  [entityName]="profile.user()?.firstName ?? 'Athlete'"
                  [showAddButton]="profile.isOwnProfile()"
                  [activeSideTab]="activeSideTab()"
                  [emptyMessage]="
                    profile.isOwnProfile()
                      ? 'Add your season stats to showcase your performance.'
                      : 'No stats have been recorded yet.'
                  "
                  (addStats)="editProfileClick.emit()"
                />
              }

              @case ('academic') {
                <nxt1-profile-academic (editProfileClick)="editProfileClick.emit()" />
              }

              @case ('events') {
                <nxt1-profile-events
                  [events]="profile.events()"
                  [visitEvents]="profile.visitEvents()"
                  [campEvents]="profile.campEvents()"
                  [generalEvents]="profile.generalEvents()"
                  [isLoading]="profile.isLoading()"
                  [isOwnProfile]="profile.isOwnProfile()"
                  [activeSection]="activeSideTab()"
                  [emptyCta]="profile.isOwnProfile() ? 'Add Event' : null"
                  cardLayout="horizontal"
                  (eventClick)="onEventClick($event)"
                  (addEventClick)="onAddEvent()"
                  (emptyCtaClick)="onAddEvent()"
                />
              }

              @case ('schedule') {
                <nxt1-schedule-board
                  [rows]="profileScheduleRows()"
                  [showAddButton]="profile.isOwnProfile()"
                  [emptyMessage]="
                    profile.isOwnProfile()
                      ? 'Add games and practices to show your full season schedule.'
                      : 'No schedule items have been added yet.'
                  "
                />
              }

              @case ('contact') {
                <nxt1-profile-contact />
              }
            }
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
         PROFILE SHELL — Mobile (Ionic)
         Madden Franchise Mode — Native-Grade 2026
         ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;
        --m-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --m-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --m-surface-2: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        --m-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --m-text: var(--nxt1-color-text-primary, #ffffff);
        --m-text-2: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --m-text-3: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.45));
        --m-accent: var(--nxt1-color-primary, #d4ff00);
      }

      .profile-content {
        --background: var(--m-bg);
      }

      .header-logo {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 100%;
        margin-top: -8px;
        margin-left: -18px;
      }

      .header-title-text {
        display: inline-flex;
        align-items: center;
        font-family: var(--nxt1-font-family-brand, var(--ion-font-family));
        font-size: var(--nxt1-font-size-xl, 20px);
        font-weight: var(--nxt1-font-weight-semibold, 600);
        letter-spacing: var(--nxt1-letter-spacing-tight, -0.01em);
        color: var(--nxt1-color-text-primary, #ffffff);
        line-height: 1;
        transform: translateY(1px);
      }

      .header-brand-logo {
        display: block;
        flex-shrink: 0;
        color: var(--nxt1-color-text-primary, #ffffff);
        transform: translateY(1px);
      }

      /* ─── HEADER ACTION BUTTONS ─── */

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

      /* ─── MAIN CONTAINER ─── */

      .profile-container {
        position: relative;
        min-height: 100%;
        padding-bottom: calc(120px + env(safe-area-inset-bottom, 0px));
      }

      /* ─── HALFTONE ACCENT BACKGROUND ─── */

      .halftone-bg {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .halftone-dots {
        position: absolute;
        inset: 0;
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
        opacity: 0.95;
      }

      .halftone-fade {
        position: absolute;
        inset: 0;
        background: radial-gradient(
          ellipse 86% 72% at 50% 8%,
          color-mix(in srgb, var(--m-accent) 26%, transparent) 0%,
          color-mix(in srgb, var(--m-accent) 13%, transparent) 42%,
          transparent 78%
        );
        opacity: 0.98;
      }

      @media (prefers-reduced-motion: reduce) {
        .halftone-dots,
        .halftone-fade {
          opacity: 0.5;
        }
      }

      /* ─── ERROR STATE ─── */

      .profile-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 24px;
        text-align: center;
        position: relative;
        z-index: 1;
      }

      .error-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }

      .profile-error h3 {
        font-size: 18px;
        font-weight: 600;
        color: var(--m-text);
        margin: 0 0 8px;
      }

      .profile-error p {
        font-size: 14px;
        color: var(--m-text-2);
        margin: 0 0 20px;
      }

      .retry-btn {
        padding: 10px 24px;
        background: var(--m-surface);
        border: 1px solid var(--m-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--m-text);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }

      .retry-btn:active {
        background: var(--m-surface-2);
      }

      /* ─── TAB BAR ─── */

      .top-tabs {
        position: relative;
        z-index: 1;
        padding: 8px 8px 12px;
        background: transparent;
      }

      .top-tabs ::ng-deep .option-scroller {
        background: transparent !important;
      }

      .top-tabs ::ng-deep .option-scroller__container {
        min-height: 0;
      }

      .top-tabs ::ng-deep .option-scroller__option {
        height: 36px;
      }

      .top-tabs ::ng-deep .option-scroller__badge {
        display: none !important;
      }

      /* ─── SECTION NAV PILLS ─── */

      .section-nav-row {
        position: relative;
        z-index: 1;
        width: calc(100% - 24px);
        margin-inline: 12px;
        margin-top: 24px;
        margin-bottom: 8px;
        margin-bottom: 8px;
      }

      .section-nav-row ::ng-deep .section-nav {
        gap: 4px;
        padding-inline: 2px;
        padding-bottom: 14px;
        border-bottom: none;
        box-sizing: border-box;
      }

      .section-nav-row ::ng-deep .nav-item {
        width: auto;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        font-family: var(--nxt1-fontFamily-brand, 'Rajdhani', sans-serif);
        letter-spacing: 0.02em;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        color: var(--m-text-2);
      }

      .section-nav-row ::ng-deep .nav-item--active {
        background: color-mix(in srgb, var(--m-accent) 12%, transparent);
        border-color: color-mix(in srgb, var(--m-accent) 35%, transparent);
        color: var(--m-text);
      }

      .section-nav-row ::ng-deep .nav-group-header {
        display: none;
      }

      /* ─── TAB CONTENT ─── */

      .tab-content {
        position: relative;
        z-index: 1;
        min-height: 300px;
        padding: 24px 12px 48px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellComponent implements OnInit {
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShell');
  private readonly bottomSheet = inject(NxtBottomSheetService);

  // ============================================
  // INPUTS
  // ============================================

  /** Current logged-in user info for header avatar */
  readonly currentUser = input<ProfileShellUser | null>(null);

  /** Profile unicode to load (unique identifier for profiles) */
  readonly profileUnicode = input<string>('');

  /** Whether viewing own profile */
  readonly isOwnProfile = input(false);

  /**
   * When true, the shell skips its internal profile.loadProfile() call in ngOnInit.
   * Use when parent component fetches real data and calls loadFromExternalData().
   */
  readonly skipInternalLoad = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly avatarClick = output<void>();
  readonly backClick = output<void>();
  readonly tabChange = output<ProfileTabId>();
  readonly editProfileClick = output<void>();
  readonly editTeamClick = output<void>();
  readonly shareClick = output<void>();
  readonly copyLinkClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly aiSummaryClick = output<void>();
  readonly agentXClick = output<void>();
  readonly createPostClick = output<void>();
  readonly retryClick = output<void>();
  readonly refreshRequest = output<void>();

  // ============================================
  // COMPUTED — Tab Options
  // ============================================

  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.profile.tabBadges();
    const user = this.profile.user();

    return getProfileTabsForUser(user).map((tab: ProfileTab) => ({
      id: tab.id,
      label: tab.label,
      badge: badges[tab.id as keyof typeof badges] || undefined,
    }));
  });

  protected readonly emptyState = computed(() => {
    const tab = this.profile.activeTab();
    return PROFILE_EMPTY_STATES[tab] || PROFILE_EMPTY_STATES['timeline'];
  });

  /** Root /profile (own) uses hamburger; nested /profile/:unicode (others) keeps back arrow */
  protected readonly shouldShowBack = computed(() => {
    return this.profileUnicode().trim().length > 0 && !this.profile.isOwnProfile();
  });

  // ============================================
  // COMPUTED — Section Nav Items
  // ============================================

  /** Section nav items — contextual to active top tab (mirrors web shell exactly) */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.profile.activeTab();
    const user = this.profile.user();
    const labels = getOverviewSectionLabels(user);
    const sections: Record<string, SectionNavItem[]> = {
      overview: [
        { id: 'player-profile', label: labels.profile },
        { id: 'player-history', label: labels.history },
        {
          id: 'awards',
          label: 'Awards',
          badge: this.profile.awards().length || undefined,
        },
        { id: 'academic', label: 'Academic' },
        { id: 'contact', label: 'Contact' },
      ],
      timeline: [
        {
          id: 'pinned',
          label: 'Pinned',
          badge: this.profile.pinnedPosts().length || undefined,
        },
        {
          id: 'all-posts',
          label: 'All Posts',
          badge: this.profile.allPosts().length || undefined,
        },
        {
          id: 'media',
          label: 'Media',
          badge:
            this.profile
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
        {
          id: 'highlights',
          label: 'Highlights',
          badge: this.profile.videoPosts().length || undefined,
        },
        { id: 'game-film', label: 'Game Film' },
        { id: 'training', label: 'Training' },
      ],
      offers: [
        { id: 'timeline', label: 'Timeline' },
        {
          id: 'committed',
          label: 'Commitment',
          badge: this.profile.committedOffers().length || undefined,
        },
        {
          id: 'all-offers',
          label: 'Offers',
          badge: this.profile.activeOffers().length || undefined,
        },
        {
          id: 'interests',
          label: 'Interests',
          badge: this.profile.interestOffers().length || undefined,
        },
        {
          id: 'rankings',
          label: 'Rankings',
          badge: this.profile.rankings().length || undefined,
        },
        {
          id: 'scouting',
          label: 'Scouting',
          badge: this.profile.scoutReports().length || undefined,
        },
      ],
      metrics:
        this.profile.metrics().length > 0
          ? this.profile.metrics().map((cat) => ({
              id: cat.name.toLowerCase().replace(/\s+/g, '-'),
              label: cat.name,
            }))
          : [
              { id: 'combine', label: 'Combine Results' },
              { id: 'measurables', label: 'Measurables' },
            ],
      stats: [
        ...(this.hasSchoolGameLogs()
          ? [
              {
                id: 'school-career',
                label: 'Career',
                group: this.schoolStatsTeamName(),
              },
              ...this.schoolSeasons().map((s) => ({
                id: `school-season-${s}`,
                label: s,
                group: this.schoolStatsTeamName(),
              })),
            ]
          : []),
        ...(this.hasClubGameLogs()
          ? [
              {
                id: 'club-career',
                label: 'Career',
                group: this.clubStatsTeamName(),
              },
              ...this.clubSeasons().map((s) => ({
                id: `club-season-${s}`,
                label: s,
                group: this.clubStatsTeamName(),
              })),
            ]
          : []),
      ],
      schedule: [
        ...this.scheduleSeasons().map((s) => ({
          id: `season-${s}`,
          label: s,
          group: this.scheduleTeamName(),
        })),
      ],
      news: [
        {
          id: 'all-news',
          label: 'All News',
          badge: this.newsBoardItems().length || undefined,
        },
        {
          id: 'announcements',
          label: 'Announcements',
          badge:
            this.newsBoardItems().filter((i) => (i.category as string) === 'announcement').length ||
            undefined,
        },
        {
          id: 'media-mentions',
          label: 'Media Mentions',
          badge:
            this.newsBoardItems().filter((i) => (i.category as string) === 'media-mention')
              .length || undefined,
        },
      ],
      events: [
        { id: 'timeline', label: 'Timeline' },
        {
          id: 'visits',
          label: 'Visits',
          badge: this.profile.visitEvents().length || undefined,
        },
        {
          id: 'camps',
          label: 'Camps',
          badge: this.profile.campEvents().length || undefined,
        },
        {
          id: 'events',
          label: 'Events',
          badge: this.profile.generalEvents().length || undefined,
        },
      ],
      contact: [
        { id: 'info', label: 'Contact Info' },
        { id: 'social', label: 'Social Media' },
      ],
    };
    return sections[tab] ?? sections['timeline'];
  });

  /** Active side tab (first item by default) */
  private readonly _activeSideTab = signal<string>('');

  protected readonly activeSideTab = computed(() => {
    const current = this._activeSideTab();
    const items = this.sideTabItems();
    if (current && items.some((i) => i.id === current)) return current;
    return items[0]?.id ?? '';
  });

  /** Map sidebar tab ID → ProfileTimelineFilterId for the timeline component */
  protected readonly timelineFilter = computed<ProfileTimelineFilterId>(() => {
    const sideTab = this.activeSideTab();
    const map: Record<string, ProfileTimelineFilterId> = {
      pinned: 'pinned',
      'all-posts': 'all',
      media: 'media',
    };
    return map[sideTab] ?? 'all';
  });

  // ============================================
  // COMPUTED — Game Log / Season Helpers
  // ============================================

  protected readonly hasSchoolGameLogs = computed(() =>
    this.profile.gameLog().some((gl: ProfileSeasonGameLog) => gl.teamType === 'school')
  );

  protected readonly hasClubGameLogs = computed(() =>
    this.profile.gameLog().some((gl: ProfileSeasonGameLog) => gl.teamType === 'club')
  );

  private getUniqueSeasons(logs: readonly ProfileSeasonGameLog[]): readonly string[] {
    const seen = new Set<string>();
    const seasons: string[] = [];
    for (const log of logs) {
      const label = log.season?.trim();
      if (label && !seen.has(label)) {
        seen.add(label);
        seasons.push(label);
      }
    }
    return seasons;
  }

  private readonly schoolSeasons = computed<readonly string[]>(() => {
    const schoolLogs = this.profile
      .gameLog()
      .filter((gl: ProfileSeasonGameLog) => gl.teamType === 'school');
    return this.getUniqueSeasons(schoolLogs);
  });

  private readonly schoolStatsTeamName = computed(() => {
    const user = this.profile.user();
    const schoolName = user?.school?.name?.trim();
    if (schoolName) return schoolName;
    const firstTeam = user?.teamAffiliations?.find((a) => a.name?.trim())?.name?.trim();
    return firstTeam ?? user?.displayName?.trim() ?? 'School';
  });

  private readonly clubSeasons = computed<readonly string[]>(() => {
    const clubLogs = this.profile
      .gameLog()
      .filter((gl: ProfileSeasonGameLog) => gl.teamType === 'club');
    return this.getUniqueSeasons(clubLogs);
  });

  private readonly clubStatsTeamName = computed(() => {
    const user = this.profile.user();
    const clubTeam = user?.teamAffiliations?.find(
      (a) => a.type?.toLowerCase() === 'club' && a.name?.trim()
    );
    return clubTeam?.name?.trim() ?? 'Club';
  });

  protected readonly scheduleSeasons = computed<readonly string[]>(() =>
    getScheduleSeasons(this.profile.events())
  );

  /**
   * Maps ProfileEvent[] → ScheduleRow[] for the ScheduleBoardComponent.
   * Filters by active season tab and delegates mapping to @nxt1/core helpers.
   */
  protected readonly profileScheduleRows = computed<readonly ScheduleRow[]>(() => {
    const sideTab = this.activeSideTab();
    const seasonLabel = sideTab.startsWith('season-') ? sideTab.replace('season-', '') : undefined;
    const events = filterScheduleEvents(this.profile.events(), seasonLabel);

    const user = this.profile.user();
    return mapProfileEventsToScheduleRows(events, {
      teamName: user?.school?.name?.trim() || user?.displayName?.trim() || 'Team',
      teamLogo: user?.school?.logoUrl || user?.teamAffiliations?.[0]?.logoUrl,
    });
  });

  // ── News board items ──

  /** News articles from the dedicated news sub-collection (real API data). */
  protected readonly newsBoardItems = computed(() => this.profile.newsArticles());

  private readonly scheduleTeamName = computed(() => {
    const user = this.profile.user();
    const schoolName = user?.school?.name?.trim();
    if (schoolName) return schoolName;
    const firstTeamName = user?.teamAffiliations
      ?.find((affiliation) => affiliation.name?.trim())
      ?.name?.trim();
    if (firstTeamName) return firstTeamName;
    return user?.displayName?.trim() || 'Team';
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    if (this.skipInternalLoad()) {
      return; // Parent component handles data loading via loadFromExternalData()
    }
    // Internal data loading is no longer supported.
    // Platform shells must provide data via loadFromExternalData() and set [skipInternalLoad]="true".
    this.logger.warn(
      'ProfileShell: skipInternalLoad is false — use loadFromExternalData() from the platform component.'
    );
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as ProfileTabId;
    this.profile.setActiveTab(tabId);
    this._activeSideTab.set(''); // reset sub-tab when top tab changes
    this.tabChange.emit(tabId);
  }

  protected onSectionNavChange(event: SectionNavChangeEvent): void {
    this._activeSideTab.set(event.id);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      if (this.skipInternalLoad()) {
        // Parent handles data loading — emit event so it can re-fetch
        this.refreshRequest.emit();
        return;
      }
      await this.profile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    // Emit retry event so parent component can re-fetch from API
    // Don't call loadProfile() here - it uses mock data
    this.retryClick.emit();
  }

  protected onFollowToggle(): void {
    this.profile.toggleFollow();
  }

  // Post actions
  protected onPostClick(post: ProfilePost): void {
    this.logger.debug('Post click', { postId: post.id });
  }

  protected onNewsBoardItemClick(item: NewsArticle): void {
    this.logger.debug('News board item click', {
      itemId: item.id,
      title: item.title,
    });
  }

  protected onLikePost(post: ProfilePost): void {
    this.logger.debug('Like post', { postId: post.id });
  }

  protected onCommentPost(post: ProfilePost): void {
    this.logger.debug('Comment post', { postId: post.id });
  }

  protected onSharePost(post: ProfilePost): void {
    this.logger.debug('Share post', { postId: post.id });
  }

  protected onPostMenu(post: ProfilePost): void {
    this.logger.debug('Post menu', { postId: post.id });
  }

  protected onLoadMore(): void {
    this.profile.loadMorePosts();
  }

  protected onCreatePost(): void {
    this.createPostClick.emit();
  }

  protected onUploadVideo(): void {
    this.logger.debug('Upload video');
  }

  protected onOfferClick(offer: ProfileRecruitingActivity): void {
    this.logger.debug('Offer click', {
      offerId: offer.id,
      category: offer.category,
    });
  }

  protected onAddOffer(): void {
    this.logger.debug('Add offer');
  }

  protected onScoutReportClick(report: ScoutReport): void {
    this.logger.debug('Scout report click', {
      reportId: report.id,
      athlete: report.athlete.name,
    });
  }

  protected onAddScoutReport(): void {
    this.logger.debug('Add scout report');
  }

  protected onEventClick(event: ProfileEvent): void {
    this.logger.debug('Event click', { eventId: event.id, type: event.type });
  }

  protected onAddEvent(): void {
    this.logger.debug('Add event');
  }

  protected onAddNews(): void {
    this.logger.debug('Add news');
  }

  /**
   * Opens the profile quick-actions bottom sheet.
   * Uses shared sheet header and a taller breakpoint so all actions stay visible.
   */
  protected async onMenuClick(): Promise<void> {
    const isOwn = this.profile.isOwnProfile();

    const actions: BottomSheetAction[] = isOwn
      ? [
          { label: 'Share Profile', role: 'primary', icon: 'share' },
          { label: 'QR Code', role: 'secondary', icon: 'qrCode' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
        ]
      : [
          { label: 'Share Profile', role: 'primary', icon: 'share' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
          { label: 'Report', role: 'destructive', icon: 'flag' },
        ];

    const result = await this.bottomSheet.show<BottomSheetAction>({
      title: 'Profile Actions',
      actions,
      backdropDismiss: true,
      ...SHEET_PRESETS.HALF,
    });

    const selected = result?.data as BottomSheetAction | undefined;
    if (!selected) return;

    switch (selected.label) {
      case 'Share Profile':
        this.shareClick.emit();
        break;
      case 'QR Code':
        this.qrCodeClick.emit();
        break;
      case 'Copy Link':
        this.copyLinkClick.emit();
        break;
      case 'Report':
        this.logger.info('Report profile requested');
        break;
    }
  }

  // ============================================
  // HELPERS
  // ============================================
}
