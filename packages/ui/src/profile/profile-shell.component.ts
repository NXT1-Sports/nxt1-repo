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
  type ProfileTeamAffiliation,
  PROFILE_EMPTY_STATES,
  getProfileTabsForUser,
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
import { NxtStateViewComponent } from '../components/state-view';
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
import { AgentXOperationChatComponent } from '../agent-x';
import { ProfileService } from './profile.service';
import { ProfileTimelineComponent } from './profile-timeline.component';
import { ProfileSkeletonComponent } from './profile-skeleton.component';
import {
  ProfileMobileHeroComponent,
  ProfileContactComponent,
  ProfileVerificationBannerComponent,
} from './components';
import { AthleteIntelComponent } from '../intel/athlete-intel.component';
import { IntelService } from '../intel/intel.service';
import { ProfileGenerationBannerComponent } from './profile-generation-banner.component';
import { ProfileGenerationStateService } from './profile-generation-state.service';
import { ProfileScheduleComponent } from './components/profile-schedule.component';
import { AGENT_X_LOGO_PATH, AGENT_X_LOGO_POLYGON } from '@nxt1/design-tokens/assets';

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
    NxtStateViewComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    NxtSectionNavWebComponent,
    ProfileMobileHeroComponent,
    AthleteIntelComponent,
    ProfileTimelineComponent,
    ProfileSkeletonComponent,
    ProfileContactComponent,
    ProfileVerificationBannerComponent,
    ProfileGenerationBannerComponent,
    ProfileScheduleComponent,
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
          <path [attr.d]="agentXLogoPath" />
          <polygon [attr.points]="agentXLogoPolygon" />
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
          <nxt1-state-view
            variant="error"
            title="Failed to load profile"
            [message]="profile.error() || 'We could not load this profile right now.'"
            actionLabel="Try Again"
            actionIcon="refresh"
            (action)="onRetry()"
          />
        }

        <!-- ═══ PROFILE CONTENT ═══ -->
        @else if (profile.user()) {
          <!-- Mobile Hero: Carousel + Identity + Stats -->
          <nxt1-profile-mobile-hero
            [isOwnProfile]="profile.isOwnProfile()"
            (messageClick)="menuClick.emit()"
          />

          <!-- Tab Bar (Overview, Timeline, Videos, News, Recruit …) -->
          <nav class="top-tabs" aria-label="Profile sections">
            <nxt1-option-scroller
              [options]="tabOptions()"
              [selectedId]="profile.activeTab()"
              [config]="{ scrollable: false, stretchToFill: true, showDivider: false }"
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
            <!-- Inline generation banner — shown while Agent X builds the profile -->
            @if (generation.isGenerating()) {
              <nxt1-profile-generation-banner (dismissed)="generationDismissed.emit($event)" />
            }

            @switch (profile.activeTab()) {
              @case ('intel') {
                <nxt1-athlete-intel
                  [userId]="profile.user()!.uid"
                  [isOwnProfile]="profile.isOwnProfile()"
                  [activeSection]="activeSideTab()"
                  (generateClick)="onGenerateIntel()"
                  (resyncClick)="onResyncIntel()"
                  (missingDataAction)="editProfileClick.emit()"
                />
              }

              @case ('timeline') {
                @if (activeSideTab() === 'schedule') {
                  <!-- Schedule Board: rich game/practice grid view -->
                  <nxt1-profile-schedule [activeSideTab]="activeSideTab()" />
                } @else {
                  <nxt1-profile-timeline
                    [posts]="profile.filteredPosts()"
                    [polymorphicFeed]="profile.polymorphicTimeline()"
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
                    [emptyCta]="null"
                    (postClick)="onPostClick($event)"
                    (shareClick)="onSharePost($event)"
                    (menuClick)="onPostMenu($event)"
                    (loadMore)="onLoadMore()"
                  />
                }
              }

              @case ('connect') {
                <nxt1-profile-contact
                  [activeSection]="activeSideTab()"
                  [hideInlineCta]="hideContactInlineCta()"
                />
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
        --m-accent: var(--team-accent, var(--nxt1-color-primary, #d4ff00));
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

      .profile-container__bg {
        position: absolute;
        inset: 0;
        pointer-events: none;
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
        padding: 4px 8px 12px;
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
        margin-top: 0;
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

      /* ─── Intel Action Footer ─── */
      .profile-footer {
        --background: var(--m-bg);
        border-top: 1px solid var(--m-border);
      }
      .profile-action-footer {
        display: flex;
        gap: 8px;
        padding: 10px 16px;
      }
      .profile-action-footer__btn {
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
      .profile-action-footer__btn:active {
        transform: scale(0.97);
      }
      .profile-action-footer__btn--full {
        flex: 1 1 100%;
      }
      .profile-action-footer__btn--secondary {
        background: var(--m-surface-2);
        color: var(--m-text-2);
        border: 1px solid var(--m-border);
      }
      .profile-action-footer__btn--primary {
        background: var(--m-accent);
        color: var(--nxt1-color-text-onPrimary, #000);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellComponent implements OnInit {
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShell');
  private readonly bottomSheet = inject(NxtBottomSheetService);
  private readonly intel = inject(IntelService);
  protected readonly generation = inject(ProfileGenerationStateService);

  protected readonly teamAccentColor = computed(() => {
    const user = this.profile.user();
    return user?.school?.primaryColor ?? 'var(--nxt1-color-primary, #d4ff00)';
  });

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
   * Explicit override for the back-arrow visibility in the page header.
   * When provided, takes precedence over the data-derived `shouldShowBack` computed
   * so the back arrow is shown immediately (before the API resolves) when the parent
   * already knows from the route whether this is another user's profile.
   * Pass `true` for other-user profiles (non-empty route param),
   * `false` for own profile (empty/absent route param).
   * Omit to fall back to the API-driven signal logic.
   */
  readonly showBack = input<boolean | undefined>(undefined);

  /**
   * When true, the shell skips its internal profile.loadProfile() call in ngOnInit.
   * Use when parent component fetches real data and calls loadFromExternalData().
   */
  readonly skipInternalLoad = input(false);

  /**
   * When true, hides the inline CTA buttons (Connect Accounts / Edit Contact) inside
   * the contact tab. Use on mobile where a footer action bar replaces them.
   */
  readonly hideContactInlineCta = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly avatarClick = output<void>();
  readonly backClick = output<void>();
  readonly tabChange = output<ProfileTabId>();
  readonly editProfileClick = output<void>();
  readonly teamClick = output<ProfileTeamAffiliation>();
  readonly shareClick = output<void>();
  readonly copyLinkClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly aiSummaryClick = output<void>();
  readonly agentXClick = output<void>();
  readonly retryClick = output<void>();
  readonly refreshRequest = output<void>();
  readonly generationDismissed = output<'completed' | 'skipped'>();

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

  protected readonly showActionFooter = computed(
    () => this.profile.isOwnProfile() && this.profile.activeTab() === 'timeline'
  );

  /**
   * Whether to show the back arrow in the page header.
   * Prefers the explicit `showBack` input (available immediately from route param)
   * over the data-derived check, eliminating the hamburger → back-arrow flash
   * during skeleton loading on other users' profiles.
   * Falls back to: non-empty profileUnicode AND service says not own profile.
   */
  protected readonly shouldShowBack = computed(() => {
    const explicit = this.showBack();
    if (explicit !== undefined) return explicit;
    // Fallback: data-driven (may flip after API resolves)
    return this.profileUnicode().trim().length > 0 && !this.profile.isOwnProfile();
  });

  // ============================================
  // COMPUTED — Section Nav Items
  // ============================================

  /** Section nav items — contextual to active top tab (mirrors web shell exactly) */
  protected readonly sideTabItems = computed((): SectionNavItem[] => {
    const tab = this.profile.activeTab();
    const sections: Record<string, SectionNavItem[]> = {
      intel: this.intel.athleteSections().map((s) => ({ id: s.id, label: s.title })),
      timeline: [
        {
          id: 'all-posts',
          label: 'All Posts',
          badge: this.profile.allPosts().length || undefined,
        },
        {
          id: 'pinned',
          label: 'Pinned',
          badge: this.profile.pinnedPosts().length || undefined,
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
                  !!post.thumbnailUrl ||
                  !!post.mediaUrl
              ).length || undefined,
        },
        {
          id: 'metrics',
          label: 'Metrics',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'METRIC').length ||
            undefined,
        },
        {
          id: 'stats',
          label: 'Stats',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'STAT').length ||
            undefined,
        },
        {
          id: 'awards',
          label: 'Awards',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'AWARD').length ||
            undefined,
        },
        {
          id: 'recruiting',
          label: 'Recruiting',
          badge:
            this.profile
              .polymorphicTimeline()
              .filter((i) => i.feedType === 'OFFER' || i.feedType === 'COMMITMENT').length ||
            undefined,
        },
        {
          id: 'schedule',
          label: 'Schedule',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'SCHEDULE').length ||
            undefined,
        },
        {
          id: 'events',
          label: 'Events',
          badge:
            this.profile
              .polymorphicTimeline()
              .filter(
                (i) => i.feedType === 'EVENT' || i.feedType === 'VISIT' || i.feedType === 'CAMP'
              ).length || undefined,
        },
        {
          id: 'news',
          label: 'News',
          badge:
            this.profile.polymorphicTimeline().filter((i) => i.feedType === 'NEWS').length ||
            undefined,
        },
      ],
      connect: [
        { id: 'connected', label: 'Accounts' },
        { id: 'contact', label: 'Contact' },
      ],
    };
    return sections[tab] ?? sections['intel'];
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
      'all-posts': 'all',
      pinned: 'pinned',
      media: 'media',
      metrics: 'metrics',
      stats: 'stats',
      awards: 'awards',
      news: 'news',
      recruiting: 'recruiting',
      // 'schedule' is handled by nxt1-profile-schedule board, timeline shows 'all' as fallback
      schedule: 'all',
      events: 'events',
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

  protected onSharePost(post: ProfilePost): void {
    this.logger.debug('Share post', { postId: post.id });
  }

  protected onPostMenu(post: ProfilePost): void {
    this.logger.debug('Post menu', { postId: post.id });
  }

  protected onLoadMore(): void {
    this.profile.loadMorePosts();
  }

  protected async onCreatePostWithAgent(): Promise<void> {
    const hasReport = !!this.intel.athleteReport();
    const message = hasReport
      ? 'I want to create a post for my timeline. After creating the post, automatically review it and update any relevant sections of my Agent X Intel report with new stats, achievements, or information from the post.'
      : 'I want to create a post for my timeline.';
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'profile-timeline-post',
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
  }

  protected onAddUpdate(): void {
    void this.onCreatePostWithAgent();
  }

  protected async onResyncIntel(): Promise<void> {
    const userId = this.profile.user()?.uid ?? '';
    const message = `Do a full resync of my Agent X Intel report for athlete ${userId}. Gather all current data and regenerate the entire report from scratch.`;
    this.intel.startPendingGeneration();
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'profile-intel-resync',
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
    // AgentXOperationChatComponent handles generation internally via the stream.
    // Do NOT call generateAthleteIntel() here — it would double-fire the OpenRouter request.
  }

  protected async onGenerateIntel(): Promise<void> {
    const hasReport = !!this.intel.athleteReport();
    const userId = this.profile.user()?.uid ?? '';
    const activeSection = this.activeSideTab();

    const isAthleteSection = [
      'agent_x_brief',
      'athletic_measurements',
      'season_stats',
      'recruiting_activity',
      'academic_profile',
      'awards_honors',
    ].includes(activeSection);

    const initialMessage =
      hasReport && isAthleteSection
        ? `Update the ${activeSection} section of my Agent X Intel report for athlete ${userId}.`
        : hasReport
          ? `Update my Agent X Intel report for athlete ${userId}.`
          : `Generate an Agent X Intel report for athlete ${userId}.`;

    this.intel.startPendingGeneration();
    await this.bottomSheet.openSheet({
      component: AgentXOperationChatComponent,
      componentProps: {
        contextId: 'profile-intel-generate',
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
    // AgentXOperationChatComponent handles generation internally via the stream.
    // Do NOT call generateAthleteIntel() here — it would double-fire the OpenRouter request
    // (especially after a 429 dismissal when _isGenerating resets to false).
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
