/**
 * @fileoverview Profile Header Component - Hero Section
 * @module @nxt1/ui/profile
 * @version 1.0.0
 *
 * Profile hero section with banner, avatar, name, bio, follow stats,
 * and action buttons. Supports edit mode for seamless UX.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileUser, ProfileFollowStats, ProfilePinnedVideo } from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';
import { NxtIconComponent } from '../components/icon';

@Component({
  selector: 'nxt1-profile-header',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent, NxtIconComponent],
  template: `
    <header class="profile-header">
      <!-- Banner Section -->
      <div class="profile-banner" [style.backgroundImage]="bannerStyle()">
        @if (!user()?.bannerImg) {
          <div class="banner-gradient"></div>
        }

        <!-- Edit Banner Button (Own Profile) -->
        @if (canEdit() && isOwnProfile()) {
          <button class="banner-edit-btn" (click)="editBanner.emit()" aria-label="Edit banner">
            <nxt1-icon name="image" [size]="18" />
          </button>
        }
      </div>

      <!-- Profile Content (YouTube-style: no overlap with banner) -->
      <div class="profile-header-content">
        <!-- Top Row: Avatar + Name/Followers (side by side) -->
        <div class="profile-top-row">
          <!-- Avatar Section -->
          <div class="profile-avatar-container">
            <nxt1-avatar
              [src]="user()?.profileImg"
              [name]="displayName()"
              [size]="avatarSize()"
              shape="circle"
            />

            <!-- Edit Avatar Button (Own Profile) -->
            @if (canEdit() && isOwnProfile()) {
              <button
                class="avatar-edit-btn"
                (click)="editAvatar.emit()"
                aria-label="Edit profile picture"
              >
                <nxt1-icon name="image" [size]="14" />
              </button>
            }

            <!-- Verified Badge -->
            @if (user()?.verificationStatus === 'verified') {
              <div class="verification-badge" title="Verified">
                <nxt1-icon name="verified" [size]="14" />
              </div>
            }
          </div>

          <!-- Name & Follow Stats (right of avatar) -->
          <div class="profile-name-section">
            <h1 class="profile-name">
              {{ displayName() }}
              @if (user()?.verificationStatus === 'verified') {
                <nxt1-icon name="verified" className="verified-icon" [size]="18" />
              }
            </h1>

            <!-- Follow Stats (YouTube-style inline) -->
            @if (followStats()) {
              <div class="follow-stats-inline">
                <button class="follow-stat" (click)="followersClick.emit()">
                  <span class="stat-count">{{ formatCount(followStats()!.followersCount) }}</span>
                  <span class="stat-label">Followers</span>
                </button>
                <span class="stat-separator">&#8226;</span>
                <button class="follow-stat" (click)="followingClick.emit()">
                  <span class="stat-count">{{ formatCount(followStats()!.followingCount) }}</span>
                  <span class="stat-label">Following</span>
                </button>
              </div>
            }

            <!-- Sport & Position (below followers) -->
            @if (user()?.primarySport) {
              <p class="profile-meta">
                <span class="sport-position">
                  {{ user()?.primarySport?.position }} • {{ user()?.primarySport?.name }}
                </span>
                @if (user()?.primarySport?.jerseyNumber) {
                  <span class="jersey-number">#{{ user()?.primarySport?.jerseyNumber }}</span>
                }
              </p>
            }
          </div>
        </div>

        <!-- Details Section (full width, under avatar) -->
        <div class="profile-details">
          <!-- School & Location -->
          @if (user()?.school || user()?.location) {
            <div class="profile-location-school">
              @if (user()?.school) {
                <span class="school-info">
                  @if (user()?.school?.logoUrl) {
                    <img
                      [src]="user()?.school?.logoUrl"
                      [alt]="user()?.school?.name"
                      class="school-logo"
                    />
                  }
                  {{ user()?.school?.name }}
                </span>
              }
              @if (user()?.location) {
                <span class="location-info">
                  <nxt1-icon name="location" [size]="14" />
                  {{ user()?.location }}
                </span>
              }
            </div>
          }

          <!-- Class Year & Physical Info -->
          @if (user()?.isRecruit) {
            <div class="profile-physical-info">
              @if (user()?.classYear) {
                <span class="info-badge">Class of {{ user()?.classYear }}</span>
              }
              @if (user()?.height) {
                <span class="info-badge">{{ user()?.height }}</span>
              }
              @if (user()?.weight) {
                <span class="info-badge">{{ user()?.weight }} lbs</span>
              }
            </div>
          }

          <!-- About/Bio -->
          @if (user()?.aboutMe) {
            <p class="profile-bio">{{ user()?.aboutMe }}</p>
          }

          <!-- Action Buttons -->
          <div class="profile-actions">
            @if (isOwnProfile()) {
              <!-- Own Profile Actions -->
              <button class="action-btn action-btn--primary" (click)="editProfile.emit()">
                <nxt1-icon name="pencil" [size]="18" />
                <span>Edit Profile</span>
              </button>
              <!-- TODO: Re-enable hasTeam() check when backend provides team data -->
              <button class="action-btn action-btn--secondary" (click)="editTeam.emit()">
                <nxt1-icon name="school" [size]="18" />
                <span>Edit Team</span>
              </button>
            } @else {
              <!-- Other Profile Actions -->
              <button
                class="action-btn"
                [class.action-btn--primary]="!followStats()?.isFollowing"
                [class.action-btn--following]="followStats()?.isFollowing"
                [disabled]="isFollowLoading()"
                (click)="followToggle.emit()"
              >
                @if (isFollowLoading()) {
                  <span class="nxt1-spinner" aria-hidden="true"></span>
                } @else {
                  <nxt1-icon
                    [name]="followStats()?.isFollowing ? 'checkmark' : 'plus'"
                    [size]="18"
                  />
                  <span>{{ followStats()?.isFollowing ? 'Following' : 'Follow' }}</span>
                }
              </button>
              <button class="action-btn action-btn--secondary" (click)="messageClick.emit()">
                <span>Message</span>
              </button>
            }
          </div>
        </div>
      </div>

      <!-- Pinned Video Section -->
      @if (pinnedVideo() || (isOwnProfile() && canEdit())) {
        <div class="pinned-video-section">
          @if (pinnedVideo()) {
            <button class="pinned-video-card" (click)="pinnedVideoClick.emit()">
              <div class="video-thumbnail">
                @if (pinnedVideo()?.previewImage) {
                  <img [src]="pinnedVideo()?.previewImage" [alt]="pinnedVideo()?.name" />
                }
                <div class="play-overlay">
                  <nxt1-icon name="playCircle" [size]="32" />
                </div>
                @if (pinnedVideo()?.duration) {
                  <span class="video-duration">{{ formatDuration(pinnedVideo()!.duration!) }}</span>
                }
              </div>
              <div class="video-info">
                <span class="video-title">{{ pinnedVideo()?.name || 'Pinned Video' }}</span>
                @if (pinnedVideo()?.viewCount) {
                  <span class="video-views"
                    >{{ formatCount(pinnedVideo()!.viewCount!) }} views</span
                  >
                }
              </div>
            </button>
          } @else if (isOwnProfile()) {
            <button class="pinned-video-placeholder" (click)="pinVideoClick.emit()">
              <nxt1-icon name="plusCircle" [size]="24" />
              <span>Pin a Video</span>
            </button>
          }

          @if (isOwnProfile() && pinnedVideo()) {
            <button class="pinned-video-edit" (click)="pinVideoClick.emit()">
              <nxt1-icon name="pencil" [size]="14" />
            </button>
          }
        </div>
      }
    </header>
  `,
  styles: [
    `
      /* ============================================
       PROFILE HEADER - Hero Section
       2026 Professional Native-Style Design
       ============================================ */

      :host {
        display: block;

        /* Theme-aware CSS Variables */
        --header-bg: var(--nxt1-color-bg-primary, #0a0a0a);
        --header-surface: var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.04));
        --header-border: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        --header-text-primary: var(--nxt1-color-text-primary, #ffffff);
        --header-text-secondary: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
        --header-text-tertiary: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        --header-primary: var(--nxt1-color-primary, #d4ff00);
        --header-verified: var(--nxt1-color-info, #4da6ff);
      }

      .profile-header {
        position: relative;
        background: var(--header-bg);
      }

      /* ============================================
         BANNER
         ============================================ */

      .profile-banner {
        position: relative;
        height: 200px;
        background-size: cover;
        background-position: center;
        background-color: var(--header-surface);
        border-radius: var(--nxt1-radius-lg, 12px);
        margin: 12px 16px 0;
        overflow: hidden;

        @media (max-width: 768px) {
          height: 150px;
          margin: 8px 12px 0;
          border-radius: var(--nxt1-radius-md, 10px);
        }
      }

      .banner-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-surface-300, rgba(255, 255, 255, 0.1)) 0%,
          var(--nxt1-color-surface-100, rgba(255, 255, 255, 0.02)) 100%
        );
      }

      .banner-edit-btn {
        position: absolute;
        bottom: 16px;
        right: 16px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(8px);
        border: none;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        transition: all 0.2s ease;

        &:hover {
          background: rgba(0, 0, 0, 0.8);
          transform: scale(1.05);
        }

        &:active {
          transform: scale(0.95);
        }
      }

      /* ============================================
         HEADER CONTENT (YouTube-style: no overlap)
         ============================================ */

      .profile-header-content {
        display: flex;
        flex-direction: column;
        padding: 16px 24px 24px;

        @media (max-width: 768px) {
          padding: 12px 16px 20px;
        }
      }

      /* Top Row: Avatar + Name/Followers side by side */
      .profile-top-row {
        display: flex;
        align-items: flex-start;
        gap: 16px;

        @media (max-width: 768px) {
          gap: 12px;
        }
      }

      /* ============================================
         AVATAR
         ============================================ */

      .profile-avatar-container {
        position: relative;
        flex-shrink: 0;
      }

      :host ::ng-deep nxt1-avatar {
        --avatar-border-color: var(--header-primary);
        --avatar-border-width: 3px;
      }

      /* Name Section (right of avatar) */
      .profile-name-section {
        flex: 1;
        min-width: 0;
        padding-top: 8px;
      }

      /* Details Section (full width, under avatar) */
      .profile-details {
        padding-top: 12px;

        @media (max-width: 768px) {
          padding-top: 10px;
        }
      }

      .avatar-edit-btn {
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--header-primary);
        border: 2px solid var(--header-bg);
        color: #000;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.2s ease;
        z-index: 2;

        &:hover {
          transform: scale(1.1);
        }
      }

      .verification-badge {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: var(--header-verified);
        border: 2px solid var(--header-bg);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        z-index: 2;
      }

      /* ============================================
         NAME SECTION (part of top row)
         ============================================ */

      .profile-name {
        font-size: 28px;
        font-weight: 700;
        color: var(--header-text-primary);
        margin: 0 0 4px;
        display: flex;
        align-items: center;
        gap: 8px;

        @media (max-width: 768px) {
          font-size: 22px;
        }
      }

      .verified-icon {
        color: var(--header-verified);
        font-size: 18px;
      }

      /* ============================================
         DETAILS SECTION (under avatar)
         ============================================ */

      .profile-meta {
        font-size: 16px;
        color: var(--header-text-secondary);
        margin: 0 0 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .jersey-number {
        background: var(--header-surface);
        padding: 2px 8px;
        border-radius: var(--nxt1-radius-sm, 4px);
        font-weight: 600;
        font-size: 14px;
      }

      .profile-location-school {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 8px;
        font-size: 14px;
        color: var(--header-text-secondary);
        flex-wrap: wrap;
        gap: 12px;
      }

      .school-info,
      .location-info {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .school-logo {
        width: 20px;
        height: 20px;
        border-radius: 4px;
        object-fit: cover;
      }

      .profile-physical-info {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }

      .info-badge {
        background: var(--header-surface);
        padding: 4px 10px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 13px;
        color: var(--header-text-secondary);
        font-weight: 500;
      }

      .profile-bio {
        font-size: 15px;
        line-height: 1.5;
        color: var(--header-text-primary);
        margin: 0 0 16px;
        max-width: 500px;

        @media (max-width: 768px) {
          max-width: none;
        }
      }

      /* ============================================
         FOLLOW STATS (INLINE)
         ============================================ */

      .follow-stats-inline {
        display: flex;
        gap: 12px;
        align-items: center;
        margin: 4px 0 10px;
      }

      .follow-stat {
        display: flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px 0;
        color: var(--header-text-secondary);
        font-size: 14px;
        transition: color 0.2s ease;

        &:hover {
          color: var(--header-text-primary);
        }
      }

      .stat-count {
        font-weight: 700;
        color: var(--header-text-primary);
      }

      .stat-label {
        color: inherit;
      }

      .stat-separator {
        color: var(--header-text-tertiary);
        font-size: 14px;
      }

      /* ============================================
         ACTION BUTTONS
         ============================================ */

      .profile-actions {
        display: flex;
        gap: 12px;

        @media (max-width: 768px) {
          width: 100%;
          justify-content: flex-start;
          flex-wrap: wrap;
        }
      }

      .action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 24px;
        border-radius: var(--nxt1-radius-full, 9999px);
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        border: none;
        min-width: 120px;

        &:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        &:active:not(:disabled) {
          transform: scale(0.97);
        }
      }

      .action-btn--primary {
        background: var(--header-primary);
        color: #000;

        &:hover:not(:disabled) {
          filter: brightness(1.1);
        }
      }

      .action-btn--following {
        background: var(--header-surface);
        color: var(--header-text-primary);
        border: 1px solid var(--header-border);

        &:hover:not(:disabled) {
          background: var(--nxt1-color-error, #ff4444);
          color: white;
          border-color: transparent;

          span {
            &::after {
              content: 'Unfollow';
            }
            & > span:first-child {
              display: none;
            }
          }
        }
      }

      .action-btn--secondary {
        background: var(--header-surface);
        color: var(--header-text-primary);
        border: 1px solid var(--header-border);

        &:hover:not(:disabled) {
          background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.08));
        }
      }

      /* ============================================
         PINNED VIDEO
         ============================================ */

      .pinned-video-section {
        position: relative;
        padding: 0 24px 24px;

        @media (max-width: 768px) {
          padding: 0 16px 20px;
        }
      }

      .pinned-video-card {
        display: flex;
        gap: 16px;
        width: 100%;
        padding: 12px;
        background: var(--header-surface);
        border: 1px solid var(--header-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: left;

        &:hover {
          background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.06));
          border-color: var(--header-primary);
        }
      }

      .video-thumbnail {
        position: relative;
        width: 120px;
        height: 68px;
        border-radius: var(--nxt1-radius-md, 8px);
        overflow: hidden;
        flex-shrink: 0;
        background: var(--nxt1-color-surface-200, rgba(255, 255, 255, 0.04));

        img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .play-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.4);
      }

      .video-duration {
        position: absolute;
        bottom: 4px;
        right: 4px;
        padding: 2px 6px;
        background: rgba(0, 0, 0, 0.8);
        border-radius: 4px;
        font-size: 11px;
        color: white;
        font-weight: 500;
      }

      .video-info {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
      }

      .video-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--header-text-primary);
      }

      .video-views {
        font-size: 13px;
        color: var(--header-text-tertiary);
      }

      .pinned-video-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 24px;
        background: transparent;
        border: 2px dashed var(--header-border);
        border-radius: var(--nxt1-radius-lg, 12px);
        cursor: pointer;
        color: var(--header-text-secondary);
        font-size: 15px;
        transition: all 0.2s ease;

        &:hover {
          border-color: var(--header-primary);
          color: var(--header-primary);
        }
      }

      .pinned-video-edit {
        position: absolute;
        top: 8px;
        right: 32px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--header-surface);
        border: 1px solid var(--header-border);
        color: var(--header-text-secondary);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.2s ease;

        &:hover {
          background: var(--nxt1-color-surface-200);
          color: var(--header-text-primary);
        }

        @media (max-width: 768px) {
          right: 24px;
        }
      }

      .nxt1-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid currentColor;
        border-top-color: transparent;
        border-radius: 50%;
        display: inline-block;
        animation: profile-spin 0.8s linear infinite;
      }

      @keyframes profile-spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileHeaderComponent {
  // ============================================
  // INPUTS
  // ============================================

  readonly user = input<ProfileUser | null>(null);
  readonly followStats = input<ProfileFollowStats | null>(null);
  readonly pinnedVideo = input<ProfilePinnedVideo | null>(null);
  readonly isOwnProfile = input(false);
  readonly canEdit = input(false);
  readonly isFollowLoading = input(false);
  readonly hasTeam = input(false);

  // ============================================
  // OUTPUTS
  // ============================================

  readonly followToggle = output<void>();
  readonly followersClick = output<void>();
  readonly followingClick = output<void>();
  readonly editProfile = output<void>();
  readonly editTeam = output<void>();
  readonly editBanner = output<void>();
  readonly editAvatar = output<void>();
  readonly messageClick = output<void>();
  readonly pinnedVideoClick = output<void>();
  readonly pinVideoClick = output<void>();

  // ============================================
  // COMPUTED PROPERTIES
  // ============================================

  protected readonly displayName = computed(() => {
    const u = this.user();
    return u?.displayName ?? `${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() ?? 'User';
  });

  protected readonly bannerStyle = computed(() => {
    const banner = this.user()?.bannerImg;
    return banner ? `url(${banner})` : 'none';
  });

  protected readonly avatarSize = computed(() => {
    // Return '2xl' (120px) for profile header avatars
    return '2xl' as const;
  });

  // ============================================
  // HELPERS
  // ============================================

  protected formatCount(count: number): string {
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
  }

  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
