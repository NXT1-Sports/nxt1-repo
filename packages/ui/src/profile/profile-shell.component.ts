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
import { IonContent } from '@ionic/angular/standalone';
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_TABS,
  PROFILE_EMPTY_STATES,
  type ProfileOffer,
  type ProfileEvent,
  type ProfilePost,
} from '@nxt1/core';
import { NxtPageHeaderComponent } from '../components/page-header';
import { NxtIconComponent } from '../components/icon';
import { NxtRefresherComponent, type RefreshEvent } from '../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../components/option-scroller';
import { NxtToastService } from '../services/toast/toast.service';
import { NxtLoggingService } from '../services/logging/logging.service';
import { NxtBottomSheetService } from '../components/bottom-sheet/bottom-sheet.service';
import type { BottomSheetAction } from '../components/bottom-sheet/bottom-sheet.types';
import { ProfileService } from './profile.service';
import { ProfileHeaderComponent } from './profile-header.component';
import { ProfileTimelineComponent } from './profile-timeline.component';
import { ProfileOffersComponent } from './profile-offers.component';
import { ProfileSkeletonComponent } from './profile-skeleton.component';

// Register icons used in template
/**
 * User info passed from parent (web/mobile wrapper).
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
    ProfileHeaderComponent,
    ProfileTimelineComponent,
    ProfileOffersComponent,
    ProfileSkeletonComponent,
  ],
  template: `
    <!-- Top Navigation Header (YouTube/Professional style - no title, just icons) -->
    <nxt1-page-header [showBack]="true" (backClick)="backClick.emit()">
      <!-- Right side: Design token icons only -->
      <div pageHeaderSlot="end" class="profile-header-actions">
        @if (profile.isOwnProfile()) {
          <button
            type="button"
            class="profile-header-action-btn"
            aria-label="Agent X"
            (click)="agentXClick.emit()"
          >
            <svg
              class="agent-x-header-icon"
              viewBox="0 0 612 792"
              width="40"
              height="40"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="12"
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
          </button>
          <button
            type="button"
            class="profile-header-action-btn"
            aria-label="Edit profile"
            (click)="editProfileClick.emit()"
          >
            <nxt1-icon name="pencil" [size]="22" />
          </button>
        }
        <button
          type="button"
          class="profile-header-action-btn"
          aria-label="Menu"
          (click)="onMenuClick()"
        >
          <nxt1-icon name="menu" [size]="22" />
        </button>
      </div>
    </nxt1-page-header>

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
            [quickStats]="profile.quickStats()"
            [pinnedVideo]="profile.pinnedVideo()"
            [isOwnProfile]="profile.isOwnProfile()"
            [canEdit]="profile.canEdit()"
            [hasTeam]="profile.hasTeam()"
            (followToggle)="onFollowToggle()"
            (followersClick)="onFollowersClick()"
            (followingClick)="onFollowingClick()"
            (editProfile)="onEditProfile()"
            (editTeam)="onEditTeam()"
            (editBanner)="onEditBanner()"
            (editAvatar)="onEditAvatar()"
            (messageClick)="onMessageClick()"
            (pinnedVideoClick)="onPinnedVideoClick()"
            (pinVideoClick)="onPinVideoClick()"
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
                  [unifiedFeed]="profile.unifiedTimeline()"
                  [profileUser]="profile.user()"
                  [isLoading]="false"
                  [isLoadingMore]="profile.isLoadingMore()"
                  [isEmpty]="profile.isEmpty()"
                  [hasMore]="profile.hasMore()"
                  [isOwnProfile]="profile.isOwnProfile()"
                  [showMenu]="profile.isOwnProfile()"
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
                <nxt1-profile-timeline
                  [posts]="profile.newsPosts()"
                  [profileUser]="profile.user()"
                  [isLoading]="false"
                  [isEmpty]="profile.newsPosts().length === 0"
                  [isOwnProfile]="profile.isOwnProfile()"
                  [showFilters]="false"
                  emptyIcon="newspaper"
                  emptyTitle="No news yet"
                  emptyMessage="News updates, announcements, and media mentions will appear here."
                  [emptyCta]="profile.isOwnProfile() ? 'Create News Post' : null"
                  (postClick)="onPostClick($event)"
                  (reactClick)="onLikePost($event)"
                  (shareClick)="onSharePost($event)"
                  (emptyCtaClick)="onCreatePost()"
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
                  emptyIcon="videocam"
                  emptyTitle="No videos yet"
                  emptyMessage="Upload highlights and game footage to showcase your skills."
                  [emptyCta]="profile.isOwnProfile() ? 'Upload Video' : null"
                  (postClick)="onPostClick($event)"
                  (reactClick)="onLikePost($event)"
                  (shareClick)="onSharePost($event)"
                  (emptyCtaClick)="onUploadVideo()"
                />
              }

              @case ('offers') {
                <nxt1-profile-offers
                  [offers]="profile.offers()"
                  [committedOffers]="profile.committedOffers()"
                  [activeOffers]="profile.activeOffers()"
                  [interestOffers]="profile.interestOffers()"
                  [isEmpty]="!profile.hasRecruitingActivity()"
                  [isOwnProfile]="profile.isOwnProfile()"
                  (offerClick)="onOfferClick($event)"
                  (addOfferClick)="onAddOffer()"
                  (addCommitmentClick)="onAddOffer()"
                />
              }

              @case ('metrics') {
                <div class="stats-section">
                  @if (profile.metrics().length === 0) {
                    <div class="section-empty">
                      <nxt1-icon name="barbell" [size]="48" />
                      <h3>No metrics recorded</h3>
                      <p>Add your combine results and measurables to complete your profile.</p>
                      @if (profile.isOwnProfile()) {
                        <button class="empty-cta" (click)="onAddStats()">Add Metrics</button>
                      }
                    </div>
                  } @else {
                    @for (category of profile.metrics(); track category.name) {
                      <div class="stats-category">
                        <h4 class="category-title">{{ category.name }}</h4>
                        @if (category.measuredAt || category.source) {
                          <p class="category-meta">
                            @if (category.measuredAt) {
                              <time [attr.datetime]="category.measuredAt"
                                >Measured {{ category.measuredAt | date: 'MMM d, yyyy' }}</time
                              >
                            }
                            @if (category.measuredAt && category.source) {
                              <span aria-hidden="true"> · </span>
                            }
                            @if (category.source) {
                              <span>{{ category.source }}</span>
                            }
                          </p>
                        }
                        <div class="stats-grid">
                          @for (stat of category.stats; track stat.label) {
                            <div class="stat-item">
                              <span class="stat-value"
                                >{{ stat.value }}{{ stat.unit ? ' ' + stat.unit : '' }}</span
                              >
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

              @case ('stats') {
                <div class="stats-section">
                  @if (profile.athleticStats().length === 0) {
                    <div class="section-empty">
                      <nxt1-icon name="barChart" [size]="48" />
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

              @case ('academic') {
                <div class="stats-section">
                  @if (
                    !profile.user()?.gpa &&
                    !profile.user()?.sat &&
                    !profile.user()?.act &&
                    !profile.user()?.classYear &&
                    !profile.user()?.school?.name
                  ) {
                    <div class="section-empty">
                      <nxt1-icon name="school" [size]="48" />
                      <h3>No academic info yet</h3>
                      <p>Add GPA, test scores, and school details to strengthen your profile.</p>
                      @if (profile.isOwnProfile()) {
                        <button class="empty-cta" (click)="onEditProfile()">
                          Add Academic Info
                        </button>
                      }
                    </div>
                  } @else {
                    <div class="stats-category">
                      <h4 class="category-title">Academic Profile</h4>
                      <div class="stats-grid">
                        @if (profile.user()?.gpa) {
                          <div class="stat-item">
                            <span class="stat-value">{{ profile.user()?.gpa }}</span>
                            <span class="stat-label">GPA</span>
                          </div>
                        }
                        @if (profile.user()?.sat) {
                          <div class="stat-item">
                            <span class="stat-value">{{ profile.user()?.sat }}</span>
                            <span class="stat-label">SAT</span>
                          </div>
                        }
                        @if (profile.user()?.act) {
                          <div class="stat-item">
                            <span class="stat-value">{{ profile.user()?.act }}</span>
                            <span class="stat-label">ACT</span>
                          </div>
                        }
                        @if (profile.user()?.classYear) {
                          <div class="stat-item">
                            <span class="stat-value">{{ profile.user()?.classYear }}</span>
                            <span class="stat-label">Class Year</span>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              }

              @case ('events') {
                <div class="events-section">
                  @if (profile.events().length === 0) {
                    <div class="section-empty">
                      <nxt1-icon name="calendar" [size]="48" />
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

              @case ('schedule') {
                <div class="events-section">
                  @if (profile.events().length === 0) {
                    <div class="section-empty">
                      <nxt1-icon name="calendar" [size]="48" />
                      <h3>No schedule yet</h3>
                      <p>Add upcoming games, camps, and showcases to your schedule.</p>
                      @if (profile.isOwnProfile()) {
                        <button class="empty-cta" (click)="onAddEvent()">Add Schedule Item</button>
                      }
                    </div>
                  } @else {
                    @if (profile.upcomingEvents().length > 0) {
                      <h4 class="events-section-title">Upcoming Schedule</h4>
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
                      <h4 class="events-section-title past">Past Schedule</h4>
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
                      <nxt1-icon name="mail" [size]="48" />
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
                          <nxt1-icon name="mail" [size]="20" />
                          <span>{{ profile.user()?.contact?.email }}</span>
                        </div>
                      }
                      @if (profile.user()?.contact?.phone) {
                        <div class="contact-item">
                          <nxt1-icon name="call" [size]="20" />
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
                            <nxt1-icon name="link" [size]="20" />
                            <span>{{ '@' + profile.user()?.social?.twitter }}</span>
                          </a>
                        }
                        @if (profile.user()?.social?.instagram) {
                          <a
                            class="social-link"
                            [href]="'https://instagram.com/' + profile.user()?.social?.instagram"
                            target="_blank"
                          >
                            <nxt1-icon name="link" [size]="20" />
                            <span>{{ '@' + profile.user()?.social?.instagram }}</span>
                          </a>
                        }
                        @if (profile.user()?.social?.hudl) {
                          <a
                            class="social-link"
                            [href]="'https://hudl.com/profile/' + profile.user()?.social?.hudl"
                            target="_blank"
                          >
                            <nxt1-icon name="link" [size]="20" />
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

      /* ============================================
         HEADER ACTION BUTTONS (Design Token Icons)
         ============================================ */

      .profile-header-actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1, 4px);
      }

      .profile-header-action-btn {
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
        color: var(--nxt1-color-text-primary, #ffffff);
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition:
          background-color 0.15s ease,
          transform 0.1s ease;

        &:hover {
          background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        }

        &:active {
          background: var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.12));
          transform: scale(0.92);
        }
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

        nxt1-icon {
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
        margin: 0 0 4px;
      }

      .category-meta {
        font-size: 12px;
        color: var(--profile-text-tertiary, #888);
        margin: 0 0 12px;
        line-height: 1.4;
      }

      .category-meta time {
        font-weight: 500;
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

        nxt1-icon {
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

        nxt1-icon {
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

  // ============================================
  // OUTPUTS
  // ============================================

  readonly avatarClick = output<void>();
  readonly backClick = output<void>();
  readonly tabChange = output<ProfileTabId>();
  readonly editProfileClick = output<void>();
  readonly editTeamClick = output<void>();
  readonly shareClick = output<void>();
  readonly menuClick = output<void>();
  readonly qrCodeClick = output<void>();
  readonly aiSummaryClick = output<void>();
  readonly agentXClick = output<void>();
  readonly createPostClick = output<void>();

  // ============================================
  // COMPUTED
  // ============================================

  // No title in header — name is displayed in the profile header section below the banner
  // Icons use design token system exclusively (NxtIconComponent)

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

  protected onEditTeam(): void {
    this.editTeamClick.emit();
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
  protected onPostClick(post: ProfilePost): void {
    this.logger.debug('Post click', { postId: post.id });
    // TODO: Open post detail
  }

  protected onLikePost(post: ProfilePost): void {
    this.logger.debug('Like post', { postId: post.id });
    // TODO: Toggle like
  }

  protected onCommentPost(post: ProfilePost): void {
    this.logger.debug('Comment post', { postId: post.id });
    // TODO: Open comments
  }

  protected onSharePost(post: ProfilePost): void {
    this.logger.debug('Share post', { postId: post.id });
    // TODO: Open share sheet
  }

  protected onPostMenu(post: ProfilePost): void {
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
  }

  /**
   * Opens the profile quick-actions bottom sheet.
   * Quarter-height presentation for easy thumb access.
   */
  protected async onMenuClick(): Promise<void> {
    const isOwn = this.profile.isOwnProfile();

    const actions: BottomSheetAction[] = isOwn
      ? [
          { label: 'Share Profile', role: 'secondary', icon: 'share' },
          { label: 'QR Code', role: 'secondary', icon: 'qrCode' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
        ]
      : [
          { label: 'Share Profile', role: 'secondary', icon: 'share' },
          { label: 'Copy Link', role: 'secondary', icon: 'link' },
          { label: 'Report', role: 'destructive', icon: 'flag' },
        ];

    const result = await this.bottomSheet.show<BottomSheetAction>({
      actions,
      showClose: false,
      backdropDismiss: true,
      breakpoints: [0, 0.35],
      initialBreakpoint: 0.35,
    });

    // result.data contains the tapped BottomSheetAction; undefined on backdrop/close dismiss
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
        this.shareClick.emit();
        break;
      case 'Report':
        this.logger.info('Report profile requested');
        break;
    }
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
