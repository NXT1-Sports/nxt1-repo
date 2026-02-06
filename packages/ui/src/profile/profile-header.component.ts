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
import { IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  personAddOutline,
  checkmarkOutline,
  createOutline,
  cameraOutline,
  locationOutline,
  schoolOutline,
  calendarOutline,
  logoTwitter,
  logoInstagram,
  logoYoutube,
  linkOutline,
  shieldCheckmarkOutline,
  shieldOutline,
} from 'ionicons/icons';
import type { ProfileUser, ProfileFollowStats, ProfilePinnedVideo } from '@nxt1/core';
import { NxtAvatarComponent } from '../components/avatar';

// Register icons
addIcons({
  personAddOutline,
  checkmarkOutline,
  createOutline,
  cameraOutline,
  locationOutline,
  schoolOutline,
  calendarOutline,
  logoTwitter,
  logoInstagram,
  logoYoutube,
  linkOutline,
  shieldCheckmarkOutline,
  shieldOutline,
});

@Component({
  selector: 'nxt1-profile-header',
  standalone: true,
  imports: [CommonModule, IonIcon, IonSpinner, NxtAvatarComponent],
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
            <ion-icon name="camera-outline"></ion-icon>
          </button>
        }
      </div>

      <!-- Profile Content -->
      <div class="profile-header-content">
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
              <ion-icon name="camera-outline"></ion-icon>
            </button>
          }

          <!-- Verified Badge -->
          @if (user()?.verificationStatus === 'verified') {
            <div class="verification-badge" title="Verified">
              <ion-icon name="shield-checkmark-outline"></ion-icon>
            </div>
          }
        </div>

        <!-- Info Section -->
        <div class="profile-info">
          <!-- Name -->
          <h1 class="profile-name">
            {{ displayName() }}
            @if (user()?.verificationStatus === 'verified') {
              <ion-icon name="shield-checkmark-outline" class="verified-icon"></ion-icon>
            }
          </h1>

          <!-- Sport & Position -->
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
                  <ion-icon name="location-outline"></ion-icon>
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

          <!-- Follow Stats -->
          @if (followStats()) {
            <div class="follow-stats">
              <button class="follow-stat" (click)="followersClick.emit()">
                <span class="stat-count">{{ formatCount(followStats()!.followersCount) }}</span>
                <span class="stat-label">Followers</span>
              </button>
              <button class="follow-stat" (click)="followingClick.emit()">
                <span class="stat-count">{{ formatCount(followStats()!.followingCount) }}</span>
                <span class="stat-label">Following</span>
              </button>
            </div>
          }

          <!-- Action Buttons -->
          <div class="profile-actions">
            @if (isOwnProfile()) {
              <!-- Own Profile Actions -->
              <button class="action-btn action-btn--primary" (click)="editProfile.emit()">
                <ion-icon name="create-outline"></ion-icon>
                <span>Edit Profile</span>
              </button>
              <!-- TODO: Re-enable hasTeam() check when backend provides team data -->
              <button class="action-btn action-btn--secondary" (click)="editTeam.emit()">
                <ion-icon name="shield-outline"></ion-icon>
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
                  <ion-spinner name="crescent"></ion-spinner>
                } @else {
                  <ion-icon
                    [name]="followStats()?.isFollowing ? 'checkmark-outline' : 'person-add-outline'"
                  ></ion-icon>
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
                  <ion-icon name="play-circle-outline"></ion-icon>
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
              <ion-icon name="add-circle-outline"></ion-icon>
              <span>Pin a Video</span>
            </button>
          }

          @if (isOwnProfile() && pinnedVideo()) {
            <button class="pinned-video-edit" (click)="pinVideoClick.emit()">
              <ion-icon name="create-outline"></ion-icon>
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

        @media (max-width: 768px) {
          height: 150px;
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
         HEADER CONTENT
         ============================================ */

      .profile-header-content {
        display: flex;
        gap: 24px;
        padding: 0 24px 24px;
        margin-top: -60px;
        position: relative;

        @media (max-width: 768px) {
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 0 16px 20px;
          margin-top: -50px;
          gap: 16px;
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
        --avatar-border-color: var(--header-bg);
        --avatar-border-width: 4px;
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
         INFO SECTION
         ============================================ */

      .profile-info {
        flex: 1;
        padding-top: 68px;
        min-width: 0;

        @media (max-width: 768px) {
          padding-top: 8px;
          width: 100%;
        }
      }

      .profile-name {
        font-size: 28px;
        font-weight: 700;
        color: var(--header-text-primary);
        margin: 0 0 4px;
        display: flex;
        align-items: center;
        gap: 8px;

        @media (max-width: 768px) {
          font-size: 24px;
          justify-content: center;
        }
      }

      .verified-icon {
        color: var(--header-verified);
        font-size: 20px;
      }

      .profile-meta {
        font-size: 16px;
        color: var(--header-text-secondary);
        margin: 0 0 8px;
        display: flex;
        align-items: center;
        gap: 8px;

        @media (max-width: 768px) {
          justify-content: center;
        }
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

        @media (max-width: 768px) {
          justify-content: center;
          flex-wrap: wrap;
          gap: 12px;
        }
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

        @media (max-width: 768px) {
          justify-content: center;
        }
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
         FOLLOW STATS
         ============================================ */

      .follow-stats {
        display: flex;
        gap: 24px;
        margin-bottom: 16px;

        @media (max-width: 768px) {
          justify-content: center;
        }
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

      /* ============================================
         ACTION BUTTONS
         ============================================ */

      .profile-actions {
        display: flex;
        gap: 12px;

        @media (max-width: 768px) {
          justify-content: center;
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

        ion-icon {
          font-size: 18px;
        }

        ion-spinner {
          width: 18px;
          height: 18px;
        }

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

        ion-icon {
          font-size: 32px;
          color: white;
        }
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

        ion-icon {
          font-size: 24px;
        }

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
