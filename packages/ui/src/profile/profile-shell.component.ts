/**
 * @fileoverview Profile Shell Component - Main Container
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * Top-level container component for Profile feature.
 * Orchestrates header, stats, tabs, and content sections.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * Features:
 * - Collapsing header on scroll
 * - Tab-based content filtering
 * - Pull-to-refresh support
 * - Edit mode integration
 *
 * @example
 * ```html
 * <nxt1-profile-shell
 *   [user]="currentUser()"
 *   (avatarClick)="openSidenav()"
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
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  statsChartOutline,
  calendarOutline,
  mailOutline,
  callOutline,
  logoTwitter,
  logoInstagram,
  linkOutline,
} from 'ionicons/icons';
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_TABS,
  PROFILE_EMPTY_STATES,
  type ProfileOffer,
  type ProfileEvent,
} from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { ProfileService } from './profile.service';
import { ProfileHeaderComponent } from './profile-header.component';
import { ProfileStatsBarComponent } from './profile-stats-bar.component';
import { ProfileTimelineComponent } from './profile-timeline.component';
import { ProfileOffersComponent } from './profile-offers.component';
import { ProfileSkeletonComponent } from './profile-skeleton.component';

// Register icons used in template
addIcons({
  statsChartOutline,
  calendarOutline,
  mailOutline,
  callOutline,
  logoTwitter,
  logoInstagram,
  linkOutline,
});

/**
 * User info passed from parent (web/mobile wrapper).
 */
export interface ProfileShellUser {
  readonly photoURL?: string | null;
  readonly displayName?: string | null;
}

@Component({
  selector: 'nxt1-profile-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonIcon,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    ProfileHeaderComponent,
    ProfileStatsBarComponent,
    ProfileTimelineComponent,
    ProfileOffersComponent,
    ProfileSkeletonComponent,
  ],
  template: `
    <!-- Top Navigation Header (Twitter/X style) -->
    <nxt1-page-header
      [title]="headerTitle()"
      [avatarSrc]="currentUser()?.photoURL"
      [avatarName]="currentUser()?.displayName"
      [showBack]="true"
      [actions]="headerActions()"
      (avatarClick)="avatarClick.emit()"
      (backClick)="backClick.emit()"
      (actionClick)="onHeaderAction($event.id)"
    />

    <ion-content [fullscreen]="true" class="profile-content">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="profile-container">
        <!-- Loading State -->
        @if (profile.isLoading()) {
          <nxt1-profile-skeleton variant="full" />
        }

        <!-- Error State -->
        @else if (profile.error()) {
          <div class="profile-error">
            <div class="error-icon">⚠️</div>
            <h3>Failed to load profile</h3>
            <p>{{ profile.error() }}</p>
            <button class="retry-btn" (click)="onRetry()">Try Again</button>
          </div>
        }

        <!-- Profile Content -->
        @else if (profile.user()) {
          <!-- Profile Header Section -->
          <nxt1-profile-header
            [user]="profile.user()"
            [followStats]="profile.followStats()"
            [pinnedVideo]="profile.pinnedVideo()"
            [isOwnProfile]="profile.isOwnProfile()"
            [canEdit]="profile.canEdit()"
            (followToggle)="onFollowToggle()"
            (followersClick)="onFollowersClick()"
            (followingClick)="onFollowingClick()"
            (editProfile)="onEditProfile()"
            (editBanner)="onEditBanner()"
            (editAvatar)="onEditAvatar()"
            (messageClick)="onMessageClick()"
            (pinnedVideoClick)="onPinnedVideoClick()"
            (pinVideoClick)="onPinVideoClick()"
          />

          <!-- Quick Stats Bar -->
          <nxt1-profile-stats-bar
            [stats]="profile.quickStatsDisplay()"
            [isLoading]="false"
            [clickable]="profile.isOwnProfile()"
            (statClick)="onStatClick($event)"
          />

          <!-- Tab Navigation (Options Scroller) -->
          <nxt1-option-scroller
            [options]="tabOptions()"
            [selectedId]="profile.activeTab()"
            [config]="{ scrollable: true, stretchToFill: false, showDivider: true }"
            (selectionChange)="onTabChange($event)"
          />

          <!-- Tab Content -->
          <div class="profile-tab-content">
            @switch (profile.activeTab()) {
              @case ('timeline') {
                <nxt1-profile-timeline
                  [posts]="profile.filteredPosts()"
                  [isLoading]="false"
                  [isLoadingMore]="profile.isLoadingMore()"
                  [isEmpty]="profile.isEmpty()"
                  [hasMore]="profile.hasMore()"
                  [isOwnProfile]="profile.isOwnProfile()"
                  [showMenu]="profile.isOwnProfile()"
                  [emptyIcon]="emptyState().icon"
                  [emptyTitle]="emptyState().title"
                  [emptyMessage]="emptyState().message"
                  [emptyCta]="profile.isOwnProfile() ? (emptyState().ctaLabel ?? null) : null"
                  (postClick)="onPostClick($event)"
                  (likeClick)="onLikePost($event)"
                  (commentClick)="onCommentPost($event)"
                  (shareClick)="onSharePost($event)"
                  (menuClick)="onPostMenu($event)"
                  (loadMore)="onLoadMore()"
                  (emptyCtaClick)="onCreatePost()"
                />
              }

              @case ('videos') {
                <nxt1-profile-timeline
                  [posts]="profile.videoPosts()"
                  [isLoading]="false"
                  [isEmpty]="profile.videoPosts().length === 0"
                  [isOwnProfile]="profile.isOwnProfile()"
                  emptyIcon="videocam-outline"
                  emptyTitle="No videos yet"
                  emptyMessage="Upload highlights and game footage to showcase your skills."
                  [emptyCta]="profile.isOwnProfile() ? 'Upload Video' : null"
                  (postClick)="onPostClick($event)"
                  (likeClick)="onLikePost($event)"
                  (shareClick)="onSharePost($event)"
                  (emptyCtaClick)="onUploadVideo()"
                />
              }

              @case ('offers') {
                <nxt1-profile-offers
                  [offers]="profile.offers()"
                  [isEmpty]="profile.offers().length === 0"
                  [isOwnProfile]="profile.isOwnProfile()"
                  (offerClick)="onOfferClick($event)"
                  (addOfferClick)="onAddOffer()"
                />
              }

              @case ('stats') {
                <div class="stats-section">
                  @if (profile.athleticStats().length === 0) {
                    <div class="section-empty">
                      <ion-icon name="stats-chart-outline"></ion-icon>
                      <h3>No stats recorded</h3>
                      <p>Add your athletic and academic stats to complete your profile.</p>
                      @if (profile.isOwnProfile()) {
                        <button class="empty-cta" (click)="onAddStats()">Add Stats</button>
                      }
                    </div>
                  } @else {
                    @for (category of profile.athleticStats(); track category.name) {
                      <div class="stats-category">
                        <h4 class="category-title">{{ category.name }}</h4>
                        <div class="stats-grid">
                          @for (stat of category.stats; track stat.label) {
                            <div class="stat-item">
                              <span class="stat-value">{{ stat.value }}{{ stat.unit ?? '' }}</span>
                              <span class="stat-label">{{ stat.label }}</span>
                              @if (stat.verified) {
                                <span class="verified-badge">✓</span>
                              }
                            </div>
                          }
                        </div>
                      </div>
                    }
                  }
                </div>
              }

              @case ('events') {
                <div class="events-section">
                  @if (profile.events().length === 0) {
                    <div class="section-empty">
                      <ion-icon name="calendar-outline"></ion-icon>
                      <h3>No events scheduled</h3>
                      <p>Add upcoming games, camps, and showcases to your calendar.</p>
                      @if (profile.isOwnProfile()) {
                        <button class="empty-cta" (click)="onAddEvent()">Add Event</button>
                      }
                    </div>
                  } @else {
                    @if (profile.upcomingEvents().length > 0) {
                      <h4 class="events-section-title">Upcoming Events</h4>
                      @for (event of profile.upcomingEvents(); track event.id) {
                        <div class="event-card" (click)="onEventClick(event)">
                          <div class="event-date">
                            <span class="date-month">{{ formatEventMonth(event.startDate) }}</span>
                            <span class="date-day">{{ formatEventDay(event.startDate) }}</span>
                          </div>
                          <div class="event-info">
                            <span class="event-name">{{ event.name }}</span>
                            <span class="event-location">{{ event.location }}</span>
                          </div>
                          <span class="event-type-badge">{{ event.type }}</span>
                        </div>
                      }
                    }

                    @if (profile.pastEvents().length > 0) {
                      <h4 class="events-section-title past">Past Events</h4>
                      @for (event of profile.pastEvents(); track event.id) {
                        <div class="event-card event-card--past" (click)="onEventClick(event)">
                          <div class="event-date">
                            <span class="date-month">{{ formatEventMonth(event.startDate) }}</span>
                            <span class="date-day">{{ formatEventDay(event.startDate) }}</span>
                          </div>
                          <div class="event-info">
                            <span class="event-name">{{ event.name }}</span>
                            @if (event.result) {
                              <span class="event-result">{{ event.result }}</span>
                            } @else {
                              <span class="event-location">{{ event.location }}</span>
                            }
                          </div>
                        </div>
                      }
                    }
                  }
                </div>
              }

              @case ('contact') {
                <div class="contact-section">
                  @if (!profile.user()?.contact?.email && !profile.user()?.contact?.phone) {
                    <div class="section-empty">
                      <ion-icon name="mail-outline"></ion-icon>
                      <h3>Contact info not set</h3>
                      <p>Add your contact information so coaches can reach you.</p>
                      @if (profile.isOwnProfile()) {
                        <button class="empty-cta" (click)="onEditContact()">
                          Add Contact Info
                        </button>
                      }
                    </div>
                  } @else {
                    <div class="contact-card">
                      @if (profile.user()?.contact?.email) {
                        <div class="contact-item">
                          <ion-icon name="mail-outline"></ion-icon>
                          <span>{{ profile.user()?.contact?.email }}</span>
                        </div>
                      }
                      @if (profile.user()?.contact?.phone) {
                        <div class="contact-item">
                          <ion-icon name="call-outline"></ion-icon>
                          <span>{{ profile.user()?.contact?.phone }}</span>
                        </div>
                      }
                    </div>

                    @if (profile.user()?.social) {
                      <h4 class="social-title">Social Media</h4>
                      <div class="social-links">
                        @if (profile.user()?.social?.twitter) {
                          <a
                            class="social-link"
                            [href]="'https://twitter.com/' + profile.user()?.social?.twitter"
                            target="_blank"
                          >
                            <ion-icon name="logo-twitter"></ion-icon>
                            <span>{{ '@' + profile.user()?.social?.twitter }}</span>
                          </a>
                        }
                        @if (profile.user()?.social?.instagram) {
                          <a
                            class="social-link"
                            [href]="'https://instagram.com/' + profile.user()?.social?.instagram"
                            target="_blank"
                          >
                            <ion-icon name="logo-instagram"></ion-icon>
                            <span>{{ '@' + profile.user()?.social?.instagram }}</span>
                          </a>
                        }
                        @if (profile.user()?.social?.hudl) {
                          <a
                            class="social-link"
                            [href]="'https://hudl.com/profile/' + profile.user()?.social?.hudl"
                            target="_blank"
                          >
                            <ion-icon name="link-outline"></ion-icon>
                            <span>Hudl Profile</span>
                          </a>
                        }
                      </div>
                    }
                  }
                </div>
              }
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       PROFILE SHELL - Main Container
       2026 iOS/Android Native-Style Design
       ============================================ */

      :host {
        display: block;
        height: 100%;
        width: 100%;

        --profile-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --profile-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --profile-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --profile-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --profile-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --profile-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --profile-primary: var(--nxt1-color-primary, #d4ff00);
      }

      .profile-content {
        --background: var(--profile-bg);
      }

      .profile-container {
        min-height: 100%;
        padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
      }

      /* ============================================
         ERROR STATE
         ============================================ */

      .profile-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 24px;
        text-align: center;
      }

      .error-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }

      .profile-error h3 {
        font-size: 18px;
        font-weight: 600;
        color: var(--profile-text-primary);
        margin: 0 0 8px;
      }

      .profile-error p {
        font-size: 14px;
        color: var(--profile-text-secondary);
        margin: 0 0 20px;
      }

      .retry-btn {
        padding: 10px 24px;
        background: var(--profile-surface);
        border: 1px solid var(--profile-border);
        border-radius: var(--nxt1-radius-full, 9999px);
        color: var(--profile-text-primary);
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
        }
      }

      /* ============================================
         TAB CONTENT
         ============================================ */

      .profile-tab-content {
        min-height: 300px;
      }

      /* ============================================
         SECTION EMPTY STATE
         ============================================ */

      .section-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 60px 24px;
        text-align: center;

        ion-icon {
          font-size: 48px;
          color: var(--profile-text-tertiary);
          margin-bottom: 16px;
        }

        h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--profile-text-primary);
          margin: 0 0 8px;
        }

        p {
          font-size: 14px;
          color: var(--profile-text-secondary);
          margin: 0 0 20px;
          max-width: 280px;
        }
      }

      .empty-cta {
        padding: 10px 24px;
        background: var(--profile-primary);
        border: none;
        border-radius: var(--nxt1-radius-full, 9999px);
        color: #000;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          filter: brightness(1.1);
        }
      }

      /* ============================================
         STATS SECTION
         ============================================ */

      .stats-section {
        padding: 16px 24px;

        @media (max-width: 768px) {
          padding: 12px 16px;
        }
      }

      .stats-category {
        margin-bottom: 24px;
      }

      .category-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--profile-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0 0 12px;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 12px;
      }

      .stat-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px;
        background: var(--profile-surface);
        border: 1px solid var(--profile-border);
        border-radius: var(--nxt1-radius-md, 8px);
        position: relative;
      }

      .stat-value {
        font-size: 20px;
        font-weight: 700;
        color: var(--profile-text-primary);
      }

      .stat-label {
        font-size: 12px;
        color: var(--profile-text-secondary);
      }

      .verified-badge {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 16px;
        height: 16px;
        background: var(--profile-primary);
        color: #000;
        border-radius: 50%;
        font-size: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* ============================================
         EVENTS SECTION
         ============================================ */

      .events-section {
        padding: 16px 24px;

        @media (max-width: 768px) {
          padding: 12px 16px;
        }
      }

      .events-section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--profile-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 0 0 12px;

        &.past {
          margin-top: 24px;
          color: var(--profile-text-tertiary);
        }
      }

      .event-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 14px;
        background: var(--profile-surface);
        border: 1px solid var(--profile-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin-bottom: 10px;
        cursor: pointer;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--profile-primary);
        }
      }

      .event-card--past {
        opacity: 0.6;
      }

      .event-date {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 50px;
        height: 50px;
        background: var(--profile-primary);
        color: #000;
        border-radius: var(--nxt1-radius-md, 8px);
        flex-shrink: 0;
      }

      .date-month {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
      }

      .date-day {
        font-size: 18px;
        font-weight: 700;
      }

      .event-info {
        flex: 1;
        min-width: 0;
      }

      .event-name {
        display: block;
        font-size: 15px;
        font-weight: 600;
        color: var(--profile-text-primary);
        margin-bottom: 2px;
      }

      .event-location,
      .event-result {
        font-size: 13px;
        color: var(--profile-text-secondary);
      }

      .event-result {
        color: var(--profile-primary);
        font-weight: 600;
      }

      .event-type-badge {
        padding: 4px 10px;
        background: rgba(212, 255, 0, 0.1);
        color: var(--profile-primary);
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 11px;
        font-weight: 500;
        text-transform: capitalize;
      }

      /* ============================================
         CONTACT SECTION
         ============================================ */

      .contact-section {
        padding: 16px 24px;

        @media (max-width: 768px) {
          padding: 12px 16px;
        }
      }

      .contact-card {
        background: var(--profile-surface);
        border: 1px solid var(--profile-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        padding: 16px;
      }

      .contact-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-bottom: 1px solid var(--profile-border);
        font-size: 15px;
        color: var(--profile-text-primary);

        &:last-child {
          border-bottom: none;
        }

        ion-icon {
          font-size: 20px;
          color: var(--profile-primary);
        }
      }

      .social-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--profile-text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin: 24px 0 12px;
      }

      .social-links {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .social-link {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: var(--profile-surface);
        border: 1px solid var(--profile-border);
        border-radius: var(--nxt1-radius-md, 8px);
        text-decoration: none;
        color: var(--profile-text-primary);
        font-size: 14px;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
          border-color: var(--profile-primary);
        }

        ion-icon {
          font-size: 20px;
          color: var(--profile-text-secondary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellComponent implements OnInit {
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShell');

  // ============================================
  // INPUTS
  // ============================================

  /** Current logged-in user info for header avatar */
  readonly currentUser = input<ProfileShellUser | null>(null);

  /** Profile unicode to load (unique identifier for profiles) */
  readonly profileUnicode = input<string>('');

  /** Whether viewing own profile */
  readonly isOwnProfile = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly avatarClick = output<void>();
  readonly backClick = output<void>();
  readonly tabChange = output<ProfileTabId>();
  readonly editProfileClick = output<void>();
  readonly shareClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly aiSummaryClick = output<void>();
  readonly createPostClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  protected readonly headerTitle = computed(() => {
    const user = this.profile.user();
    return (
      user?.displayName ?? (`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Profile')
    );
  });

  protected readonly headerActions = computed((): PageHeaderAction[] => {
    if (this.profile.isOwnProfile()) {
      return [
        { id: 'qr-code', label: 'QR Code', icon: 'qr-code-outline' },
        { id: 'share', label: 'Share', icon: 'share-social-outline' },
      ];
    }
    return [
      { id: 'ai-summary', label: 'AI Summary', icon: 'sparkles-outline' },
      { id: 'share', label: 'Share', icon: 'share-social-outline' },
    ];
  });

  protected readonly tabOptions = computed((): OptionScrollerItem[] => {
    const badges = this.profile.tabBadges();

    return PROFILE_TABS.map((tab: ProfileTab) => ({
      id: tab.id,
      label: tab.label,
      icon: tab.icon,
      badge: badges[tab.id as keyof typeof badges] || undefined,
    }));
  });

  protected readonly emptyState = computed(() => {
    const tab = this.profile.activeTab();
    return PROFILE_EMPTY_STATES[tab] || PROFILE_EMPTY_STATES['timeline'];
  });

  // ============================================
  // LIFECYCLE
  // ============================================

  ngOnInit(): void {
    const unicode = this.profileUnicode();
    const isOwn = this.isOwnProfile();

    // If unicode is provided, load that profile
    // If no unicode but marked as own profile, load current user's profile with mock data
    if (unicode) {
      this.profile.loadProfile(unicode, isOwn);
    } else {
      // No unicode provided - load own profile (default behavior)
      this.profile.loadProfile('me', true);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  protected onHeaderAction(actionId: string): void {
    switch (actionId) {
      case 'share':
        this.shareClick.emit();
        break;
      case 'qr-code':
        this.qrCodeClick.emit();
        break;
      case 'ai-summary':
        this.aiSummaryClick.emit();
        break;
    }
  }

  protected onTabChange(event: OptionScrollerChangeEvent): void {
    const tabId = event.option.id as ProfileTabId;
    this.profile.setActiveTab(tabId);
    this.tabChange.emit(tabId);
  }

  protected async handleRefresh(event: RefreshEvent): Promise<void> {
    try {
      await this.profile.refresh();
    } finally {
      event.complete();
    }
  }

  protected handleRefreshTimeout(): void {
    this.toast.error('Refresh timed out. Please try again.');
  }

  protected onRetry(): void {
    const unicode = this.profileUnicode();
    if (unicode) {
      this.profile.loadProfile(unicode, this.isOwnProfile());
    } else {
      // No unicode - retry loading own profile
      this.profile.loadProfile('me', true);
    }
  }

  // Header actions
  protected onFollowToggle(): void {
    this.profile.toggleFollow();
  }

  protected onFollowersClick(): void {
    this.logger.debug('Followers click');
    // TODO: Open followers dialog
  }

  protected onFollowingClick(): void {
    this.logger.debug('Following click');
    // TODO: Open following dialog
  }

  protected onEditProfile(): void {
    this.editProfileClick.emit();
  }

  protected onEditBanner(): void {
    this.logger.debug('Edit banner');
    // TODO: Open banner editor
  }

  protected onEditAvatar(): void {
    this.logger.debug('Edit avatar');
    // TODO: Open avatar editor
  }

  protected onMessageClick(): void {
    this.logger.debug('Message click');
    // TODO: Open message composer
  }

  protected onPinnedVideoClick(): void {
    this.logger.debug('Pinned video click');
    // TODO: Play pinned video
  }

  protected onPinVideoClick(): void {
    this.logger.debug('Pin video click');
    // TODO: Open video picker
  }

  protected onStatClick(key: string): void {
    this.logger.debug('Stat click', { key });
    // TODO: Navigate to stats detail
  }

  // Post actions - using minimal interface since we only need id
  protected onPostClick(post: { id: string }): void {
    this.logger.debug('Post click', { postId: post.id });
    // TODO: Open post detail
  }

  protected onLikePost(post: { id: string }): void {
    this.logger.debug('Like post', { postId: post.id });
    // TODO: Toggle like
  }

  protected onCommentPost(post: { id: string }): void {
    this.logger.debug('Comment post', { postId: post.id });
    // TODO: Open comments
  }

  protected onSharePost(post: { id: string }): void {
    this.logger.debug('Share post', { postId: post.id });
    // TODO: Open share sheet
  }

  protected onPostMenu(post: { id: string }): void {
    this.logger.debug('Post menu', { postId: post.id });
    // TODO: Open post menu
  }

  protected onLoadMore(): void {
    this.profile.loadMorePosts();
  }

  protected onCreatePost(): void {
    this.createPostClick.emit();
  }

  protected onUploadVideo(): void {
    this.logger.debug('Upload video');
    // TODO: Open video uploader
  }

  // Offers - using ProfileOffer type from @nxt1/core
  protected onOfferClick(offer: ProfileOffer): void {
    this.logger.debug('Offer click', { offerId: offer.id });
    // TODO: Open offer detail
  }

  protected onAddOffer(): void {
    this.logger.debug('Add offer');
    // TODO: Open add offer dialog
  }

  // Stats
  protected onAddStats(): void {
    this.logger.debug('Add stats');
    // TODO: Open stats editor
  }

  // Events - using ProfileEvent type from @nxt1/core
  protected onEventClick(event: ProfileEvent): void {
    this.logger.debug('Event click', { eventId: event.id });
    // TODO: Open event detail
  }

  protected onAddEvent(): void {
    this.logger.debug('Add event');
    // TODO: Open add event dialog
  }

  // Contact
  protected onEditContact(): void {
    this.logger.debug('Edit contact');
    // TODO: Open contact editor
  }

  // ============================================
  // HELPERS
  // ============================================

  protected formatEventMonth(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short' });
  }

  protected formatEventDay(dateString: string): string {
    return new Date(dateString).getDate().toString();
  }
}
