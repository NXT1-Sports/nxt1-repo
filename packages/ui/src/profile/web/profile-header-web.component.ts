/**
 * @fileoverview Profile Header Component - Web (YouTube-Style Layout)
 * @module @nxt1/ui/profile/web
 * @version 2.0.0
 *
 * Web-optimized profile hero section using pure Tailwind CSS.
 * YouTube-inspired layout: NO banner overlap, avatar LEFT, info RIGHT.
 * 100% SSR-safe, zero Ionic, semantic HTML for Grade A+ SEO.
 *
 * ⭐ WEB ONLY - Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * Layout Pattern (All Breakpoints):
 * ┌───────────────────────────────────────────┐
 * │            BANNER (rounded, full-width)   │
 * ├───────────────────────────────────────────┤
 * │ ┌──────┐ Name ✓                           │
 * │ │Avatar│ 2.8K Followers • 156 Following   │
 * │ │120px │ Quarterback • Football  #12      │
 * │ └──────┘                                  │
 * │ 🏫 School  📍 Location                    │
 * │ Class 2026 • 6'2" • 185 lbs              │
 * │ Bio text here...                          │
 * │ [Edit Profile] [Edit Team]                │
 * └───────────────────────────────────────────┘
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileUser, ProfileFollowStats, ProfilePinnedVideo } from '@nxt1/core';
import { NxtAvatarComponent } from '../../components/avatar';
import { NxtIconComponent } from '../../components/icon';

@Component({
  selector: 'nxt1-profile-header-web',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent, NxtIconComponent],
  template: `
    <header class="relative bg-[var(--nxt1-color-bg-primary,#0a0a0a)]">
      <!-- ============================================
           BANNER
           ============================================ -->
      <div
        class="relative mx-4 mt-2 h-[200px] overflow-hidden rounded-2xl bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] bg-cover bg-center max-md:mx-3 md:h-[220px]"
        [style.backgroundImage]="bannerStyle()"
      >
        @if (!user()?.bannerImg) {
          <div
            class="absolute inset-0"
            style="background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%)"
          ></div>
        }

        @if (canEdit() && isOwnProfile()) {
          <button
            class="absolute right-4 bottom-4 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-black/60 text-white backdrop-blur-sm transition-all hover:scale-105 hover:bg-black/80 active:scale-95"
            (click)="editBanner.emit()"
            aria-label="Edit banner"
          >
            <nxt1-icon name="image" [size]="18" />
          </button>
        }
      </div>

      <!-- ============================================
           HEADER CONTENT — YouTube-style (NO banner overlap)
           ============================================ -->
      <div class="flex flex-col px-6 pt-4 max-md:px-4 max-md:pt-3">
        <!-- TOP ROW: Avatar + Name/Followers (side by side) -->
        <div class="flex items-start gap-4 max-md:gap-3">
          <!-- ============================================
               AVATAR
               ============================================ -->
          <div class="relative flex-shrink-0">
            <nxt1-avatar
              [src]="user()?.profileImg"
              [name]="displayName()"
              size="2xl"
              shape="circle"
              class="[--avatar-border-color:var(--nxt1-color-primary,#d4ff00)] [--avatar-border-width:3px]"
            />

            @if (canEdit() && isOwnProfile()) {
              <button
                class="absolute right-1 bottom-1 z-[2] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--nxt1-color-bg-primary,#0a0a0a)] bg-[var(--nxt1-color-primary,#d4ff00)] text-black transition-transform hover:scale-110"
                (click)="editAvatar.emit()"
                aria-label="Edit profile picture"
              >
                <nxt1-icon name="image" [size]="14" />
              </button>
            }

            @if (user()?.verificationStatus === 'verified') {
              <div
                class="absolute top-1 right-1 z-[2] flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--nxt1-color-bg-primary,#0a0a0a)] bg-[var(--nxt1-color-info,#4da6ff)] text-white"
                title="Verified"
              >
                <nxt1-icon name="verified" [size]="14" />
              </div>
            }
          </div>

          <!-- NAME SECTION (right of avatar) -->
          <div class="min-w-0 flex-1 pt-2">
            <h1
              class="flex items-center gap-2 text-[28px] leading-tight font-bold text-[var(--nxt1-color-text-primary,#fff)] max-md:text-[22px]"
              itemprop="name"
            >
              {{ displayName() }}
              @if (user()?.verificationStatus === 'verified') {
                <nxt1-icon
                  name="verified"
                  [size]="18"
                  className="text-[var(--nxt1-color-info,#4da6ff)]"
                />
              }
            </h1>

            <!-- Follow Stats (inline) -->
            @if (followStats()) {
              <div class="mt-1 flex items-center gap-3 text-sm">
                <button
                  class="group flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] transition-colors hover:text-[var(--nxt1-color-text-primary,#fff)]"
                  (click)="followersClick.emit()"
                >
                  <span class="font-bold text-[var(--nxt1-color-text-primary,#fff)]">{{
                    formatCount(followStats()!.followersCount)
                  }}</span>
                  <span>Followers</span>
                </button>
                <span class="text-[var(--nxt1-color-text-tertiary,rgba(255,255,255,0.5))]">
                  &#8226;
                </span>
                <button
                  class="group flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] transition-colors hover:text-[var(--nxt1-color-text-primary,#fff)]"
                  (click)="followingClick.emit()"
                >
                  <span class="font-bold text-[var(--nxt1-color-text-primary,#fff)]">{{
                    formatCount(followStats()!.followingCount)
                  }}</span>
                  <span>Following</span>
                </button>
              </div>
            }

            <!-- Sport & Position (below followers) -->
            @if (user()?.primarySport) {
              <p
                class="mt-1 flex items-center gap-2 text-base text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))]"
              >
                <span itemprop="jobTitle"
                  >{{ user()?.primarySport?.position }} &bull;
                  {{ user()?.primarySport?.name }}</span
                >
                @if (user()?.primarySport?.jerseyNumber) {
                  <span
                    class="rounded bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-2 py-0.5 text-sm font-semibold"
                  >
                    #{{ user()?.primarySport?.jerseyNumber }}
                  </span>
                }
              </p>
            }
          </div>
        </div>

        <!-- DETAILS SECTION (full width, under avatar) -->
        <div class="pt-3 pb-6 max-md:pt-2.5 max-md:pb-5">
          <!-- School & Location -->
          @if (user()?.school || user()?.location) {
            <div
              class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))]"
            >
              @if (user()?.school) {
                <span class="flex items-center gap-1.5" itemprop="affiliation">
                  @if (user()?.school?.logoUrl) {
                    <img
                      [src]="user()?.school?.logoUrl"
                      [alt]="user()?.school?.name"
                      class="h-5 w-5 rounded object-cover"
                      loading="lazy"
                    />
                  } @else {
                    <nxt1-icon name="school" [size]="16" className="opacity-70" />
                  }
                  {{ user()?.school?.name }}
                </span>
              }
              @if (user()?.location) {
                <span class="flex items-center gap-1" itemprop="homeLocation">
                  <nxt1-icon name="location" [size]="16" className="opacity-70" />
                  {{ user()?.location }}
                </span>
              }
            </div>
          }

          <!-- Class Year & Physical Info -->
          @if (user()?.isRecruit && (user()?.classYear || user()?.height || user()?.weight)) {
            <div class="mt-2 flex flex-wrap gap-2">
              @if (user()?.classYear) {
                <span
                  class="rounded-full bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-2.5 py-1 text-[13px] font-medium text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))]"
                >
                  Class of {{ user()?.classYear }}
                </span>
              }
              @if (user()?.height) {
                <span
                  class="rounded-full bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-2.5 py-1 text-[13px] font-medium text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))]"
                >
                  {{ user()?.height }}
                </span>
              }
              @if (user()?.weight) {
                <span
                  class="rounded-full bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-2.5 py-1 text-[13px] font-medium text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))]"
                >
                  {{ user()?.weight }} lbs
                </span>
              }
            </div>
          }

          <!-- Bio -->
          @if (user()?.aboutMe) {
            <p
              class="mt-3 max-w-[500px] text-[15px] leading-relaxed text-[var(--nxt1-color-text-primary,#fff)] max-md:max-w-none"
              itemprop="description"
            >
              {{ user()?.aboutMe }}
            </p>
          }

          <!-- Action Buttons -->
          <div class="mt-4 flex flex-wrap items-center gap-3">
            @if (isOwnProfile()) {
              <button
                class="flex cursor-pointer items-center gap-2 rounded-full bg-[var(--nxt1-color-primary,#d4ff00)] px-6 py-2.5 text-[15px] font-semibold text-black transition-all hover:brightness-110 active:scale-[0.97]"
                (click)="editProfile.emit()"
              >
                <nxt1-icon name="pencil" [size]="18" />
                <span>Edit Profile</span>
              </button>
              <button
                class="flex cursor-pointer items-center gap-2 rounded-full border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-6 py-2.5 text-[15px] font-semibold text-[var(--nxt1-color-text-primary,#fff)] transition-colors hover:bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.08))] active:scale-[0.97]"
                (click)="editTeam.emit()"
              >
                <nxt1-icon name="school" [size]="18" />
                <span>Edit Team</span>
              </button>
            } @else {
              <button
                class="flex min-w-[120px] cursor-pointer items-center justify-center gap-2 rounded-full px-6 py-2.5 text-[15px] font-semibold transition-all active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                [class]="
                  followStats()?.isFollowing
                    ? 'follow-btn-following border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] text-[var(--nxt1-color-text-primary,#fff)]'
                    : 'bg-[var(--nxt1-color-primary,#d4ff00)] text-black'
                "
                [disabled]="isFollowLoading()"
                (click)="followToggle.emit()"
              >
                @if (isFollowLoading()) {
                  <span class="nxt1-spinner" aria-hidden="true"></span>
                } @else if (followStats()?.isFollowing) {
                  <nxt1-icon name="checkmark" [size]="18" />
                  <span>Following</span>
                } @else {
                  <nxt1-icon name="plus" [size]="18" />
                  <span>Follow</span>
                }
              </button>
              <button
                class="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-6 py-2.5 text-[15px] font-semibold text-[var(--nxt1-color-text-primary,#fff)] transition-colors hover:bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.08))] active:scale-[0.97]"
                (click)="messageClick.emit()"
              >
                <span>Message</span>
              </button>
            }
          </div>
        </div>
      </div>

      <!-- ============================================
           PINNED VIDEO
           ============================================ -->
      @if (pinnedVideo() || (isOwnProfile() && canEdit())) {
        <div class="relative px-6 pb-6 max-md:px-4 max-md:pb-5">
          @if (pinnedVideo()) {
            <button
              class="flex w-full cursor-pointer gap-4 rounded-xl border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] p-3 text-left transition-all hover:border-[var(--nxt1-color-primary,#d4ff00)] hover:bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.06))]"
              (click)="pinnedVideoClick.emit()"
            >
              <div
                class="relative h-[68px] w-[120px] flex-shrink-0 overflow-hidden rounded-lg bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.04))]"
              >
                @if (pinnedVideo()?.previewImage) {
                  <img
                    [src]="pinnedVideo()?.previewImage"
                    [alt]="pinnedVideo()?.name"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                }
                <!-- Play Overlay -->
                <div class="absolute inset-0 flex items-center justify-center bg-black/40">
                  <nxt1-icon name="playCircle" [size]="32" className="text-white" />
                </div>
                @if (pinnedVideo()?.duration) {
                  <span
                    class="absolute right-1 bottom-1 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-medium text-white"
                  >
                    {{ formatDuration(pinnedVideo()!.duration!) }}
                  </span>
                }
              </div>
              <div class="flex flex-col justify-center gap-1">
                <span class="text-[15px] font-semibold text-[var(--nxt1-color-text-primary,#fff)]">
                  {{ pinnedVideo()?.name || 'Pinned Video' }}
                </span>
                @if (pinnedVideo()?.viewCount) {
                  <span
                    class="text-[13px] text-[var(--nxt1-color-text-tertiary,rgba(255,255,255,0.5))]"
                  >
                    {{ formatCount(pinnedVideo()!.viewCount!) }} views
                  </span>
                }
              </div>
            </button>
          } @else if (isOwnProfile()) {
            <button
              class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-transparent px-6 py-6 text-[15px] text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] transition-all hover:border-[var(--nxt1-color-primary,#d4ff00)] hover:text-[var(--nxt1-color-primary,#d4ff00)]"
              (click)="pinVideoClick.emit()"
            >
              <nxt1-icon name="plusCircle" [size]="24" />
              <span>Pin a Video</span>
            </button>
          }

          @if (isOwnProfile() && pinnedVideo()) {
            <button
              class="absolute top-2 right-8 z-[2] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] text-sm text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] transition-all hover:bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.08))] hover:text-[var(--nxt1-color-text-primary,#fff)] max-md:right-6"
              (click)="pinVideoClick.emit()"
              aria-label="Edit pinned video"
            >
              <nxt1-icon name="pencil" [size]="14" />
            </button>
          }
        </div>
      }
    </header>
  `,
  styles: [
    `
      /* Follow button hover state — unfollow indication */
      :host .follow-btn-following:hover {
        background: var(--nxt1-color-error, #ff4444) !important;
        color: white !important;
        border-color: transparent !important;
      }

      /* Avatar border ring for dark background */
      :host ::ng-deep nxt1-avatar {
        --avatar-border-color: var(--nxt1-color-bg-primary, #0a0a0a);
        --avatar-border-width: 4px;
      }

      :host .nxt1-spinner {
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
export class ProfileHeaderWebComponent {
  // ============================================
  // INPUTS (same API as ProfileHeaderComponent)
  // ============================================

  readonly user = input<ProfileUser | null>(null);
  readonly followStats = input<ProfileFollowStats | null>(null);
  readonly pinnedVideo = input<ProfilePinnedVideo | null>(null);
  readonly isOwnProfile = input(false);
  readonly canEdit = input(false);
  readonly isFollowLoading = input(false);
  readonly hasTeam = input(false);

  // ============================================
  // OUTPUTS (same API as ProfileHeaderComponent)
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
    return u?.displayName ?? (`${u?.firstName ?? ''} ${u?.lastName ?? ''}`.trim() || 'User');
  });

  protected readonly bannerStyle = computed(() => {
    const banner = this.user()?.bannerImg;
    return banner ? `url(${banner})` : 'none';
  });

  // ============================================
  // HELPERS
  // ============================================

  protected formatCount(count: number): string {
    if (count >= 1_000_000) {
      return (count / 1_000_000).toFixed(1) + 'M';
    }
    if (count >= 1_000) {
      return (count / 1_000).toFixed(1) + 'K';
    }
    return count.toString();
  }

  protected formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}
