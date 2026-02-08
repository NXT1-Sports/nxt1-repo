/**
 * @fileoverview Profile Header Component - Web (YouTube-Style Desktop Layout)
 * @module @nxt1/ui/profile/web
 * @version 1.0.0
 *
 * Web-optimized profile hero section using pure Tailwind CSS.
 * YouTube-inspired desktop layout: avatar LEFT, info RIGHT (side-by-side).
 * 100% SSR-safe, zero Ionic, semantic HTML for Grade A+ SEO.
 *
 * ⭐ WEB ONLY - Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * Layout Pattern (Desktop ≥768px):
 * ┌───────────────────────────────────────────┐
 * │            BANNER (full-width)        [📷]│
 * ├───────────────────────────────────────────┤
 * │ ┌──────┐ Name ✓           [Edit] [Team]  │
 * │ │Avatar│ Position • Sport • #42           │
 * │ │120px │ 🏫 School  📍 Location           │
 * │ └──────┘ Class 2026 • 6'2" • 185 lbs     │
 * │          Bio text here...                 │
 * │          50 Followers • 120 Following     │
 * └───────────────────────────────────────────┘
 *
 * Layout Pattern (Mobile <768px):
 * Stacked: Banner → Avatar (centered) → Info (centered)
 */

import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProfileUser, ProfileFollowStats, ProfilePinnedVideo } from '@nxt1/core';
import { NxtAvatarComponent } from '../../components/avatar';

@Component({
  selector: 'nxt1-profile-header-web',
  standalone: true,
  imports: [CommonModule, NxtAvatarComponent],
  template: `
    <header class="relative bg-[var(--nxt1-color-bg-primary,#0a0a0a)]">
      <!-- ============================================
           BANNER
           ============================================ -->
      <div
        class="relative h-[200px] overflow-hidden bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] bg-cover bg-center md:h-[220px] lg:mx-4 lg:mt-2 lg:rounded-xl"
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
            <!-- Camera SVG -->
            <svg
              class="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        }
      </div>

      <!-- ============================================
           HEADER CONTENT — YouTube-style side-by-side
           ============================================ -->
      <div
        class="relative -mt-[60px] flex gap-6 px-6 max-md:-mt-[50px] max-md:flex-col max-md:items-center max-md:gap-4 max-md:px-4 max-md:text-center"
      >
        <!-- ============================================
             AVATAR
             ============================================ -->
        <div class="relative flex-shrink-0">
          <nxt1-avatar
            [src]="user()?.profileImg"
            [name]="displayName()"
            size="2xl"
            shape="circle"
          />

          <!-- Edit Avatar Button -->
          @if (canEdit() && isOwnProfile()) {
            <button
              class="absolute right-1 bottom-1 z-[2] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--nxt1-color-bg-primary,#0a0a0a)] bg-[var(--nxt1-color-primary,#d4ff00)] text-black transition-transform hover:scale-110"
              (click)="editAvatar.emit()"
              aria-label="Edit profile picture"
            >
              <svg
                class="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          }

          <!-- Verified Badge -->
          @if (user()?.verificationStatus === 'verified') {
            <div
              class="absolute top-1 right-1 z-[2] flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--nxt1-color-bg-primary,#0a0a0a)] bg-[var(--nxt1-color-info,#4da6ff)] text-white"
              title="Verified"
            >
              <svg
                class="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          }
        </div>

        <!-- ============================================
             INFO SECTION — Right of avatar
             ============================================ -->
        <div class="min-w-0 flex-1 pt-[68px] pb-6 max-md:w-full max-md:pt-2 max-md:pb-5">
          <!-- Row: Name + Actions (YouTube-style) -->
          <div
            class="flex flex-wrap items-start justify-between gap-4 max-md:flex-col max-md:items-center"
          >
            <!-- Name Block -->
            <div class="min-w-0">
              <!-- Name -->
              <h1
                class="flex items-center gap-2 text-[28px] leading-tight font-bold text-[var(--nxt1-color-text-primary,#fff)] max-md:justify-center max-md:text-2xl"
                itemprop="name"
              >
                {{ displayName() }}
                @if (user()?.verificationStatus === 'verified') {
                  <svg
                    class="h-5 w-5 flex-shrink-0 text-[var(--nxt1-color-info,#4da6ff)]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-label="Verified"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
              </h1>

              <!-- Sport & Position -->
              @if (user()?.primarySport) {
                <p
                  class="mt-1 flex items-center gap-2 text-base text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] max-md:justify-center"
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

              <!-- School & Location — YouTube-style inline -->
              @if (user()?.school || user()?.location) {
                <div
                  class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] max-md:justify-center"
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
                        <!-- School icon -->
                        <svg
                          class="h-4 w-4 flex-shrink-0 opacity-70"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"
                          />
                        </svg>
                      }
                      {{ user()?.school?.name }}
                    </span>
                  }
                  @if (user()?.location) {
                    <span class="flex items-center gap-1" itemprop="homeLocation">
                      <!-- Location pin -->
                      <svg
                        class="h-4 w-4 flex-shrink-0 opacity-70"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
                        />
                      </svg>
                      {{ user()?.location }}
                    </span>
                  }
                </div>
              }

              <!-- Class Year & Physical Info (Athletes) -->
              @if (user()?.isRecruit && (user()?.classYear || user()?.height || user()?.weight)) {
                <div class="mt-2 flex flex-wrap gap-2 max-md:justify-center">
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
            </div>

            <!-- Action Buttons (YouTube-style: right-aligned on desktop) -->
            <div class="flex items-center gap-3 max-md:justify-center">
              @if (isOwnProfile()) {
                <button
                  class="flex cursor-pointer items-center gap-2 rounded-full bg-[var(--nxt1-color-primary,#d4ff00)] px-6 py-2.5 text-[15px] font-semibold text-black transition-all hover:brightness-110 active:scale-[0.97]"
                  (click)="editProfile.emit()"
                >
                  <!-- Edit icon -->
                  <svg
                    class="h-[18px] w-[18px]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                    />
                  </svg>
                  <span>Edit Profile</span>
                </button>
                <button
                  class="flex cursor-pointer items-center gap-2 rounded-full border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-6 py-2.5 text-[15px] font-semibold text-[var(--nxt1-color-text-primary,#fff)] transition-colors hover:bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.08))] active:scale-[0.97]"
                  (click)="editTeam.emit()"
                >
                  <!-- Shield icon -->
                  <svg
                    class="h-[18px] w-[18px]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                    />
                  </svg>
                  <span>Edit Team</span>
                </button>
              } @else {
                <!-- Follow Button -->
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
                    <!-- Spinner SVG -->
                    <svg
                      class="h-[18px] w-[18px] animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  } @else if (followStats()?.isFollowing) {
                    <!-- Checkmark -->
                    <svg
                      class="h-[18px] w-[18px]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    <span>Following</span>
                  } @else {
                    <!-- Person add -->
                    <svg
                      class="h-[18px] w-[18px]"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z"
                      />
                    </svg>
                    <span>Follow</span>
                  }
                </button>
                <!-- Message Button -->
                <button
                  class="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] px-6 py-2.5 text-[15px] font-semibold text-[var(--nxt1-color-text-primary,#fff)] transition-colors hover:bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.08))] active:scale-[0.97]"
                  (click)="messageClick.emit()"
                >
                  <span>Message</span>
                </button>
              }
            </div>
          </div>

          <!-- Bio -->
          @if (user()?.aboutMe) {
            <p
              class="mt-3 max-w-[500px] text-[15px] leading-relaxed text-[var(--nxt1-color-text-primary,#fff)] max-md:max-w-none"
              itemprop="description"
            >
              {{ user()?.aboutMe }}
            </p>
          }

          <!-- Follow Stats — YouTube-style inline -->
          @if (followStats()) {
            <div class="mt-3 flex items-center gap-6 max-md:justify-center">
              <button
                class="group flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-sm text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] transition-colors hover:text-[var(--nxt1-color-text-primary,#fff)]"
                (click)="followersClick.emit()"
              >
                <span class="font-bold text-[var(--nxt1-color-text-primary,#fff)]">{{
                  formatCount(followStats()!.followersCount)
                }}</span>
                <span>Followers</span>
              </button>
              <button
                class="group flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-sm text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] transition-colors hover:text-[var(--nxt1-color-text-primary,#fff)]"
                (click)="followingClick.emit()"
              >
                <span class="font-bold text-[var(--nxt1-color-text-primary,#fff)]">{{
                  formatCount(followStats()!.followingCount)
                }}</span>
                <span>Following</span>
              </button>
            </div>
          }
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
                  <svg
                    class="h-8 w-8 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"
                    />
                  </svg>
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
              <!-- Plus circle -->
              <svg
                class="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.5"
                  d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Pin a Video</span>
            </button>
          }

          @if (isOwnProfile() && pinnedVideo()) {
            <button
              class="absolute top-2 right-8 z-[2] flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--nxt1-color-border,rgba(255,255,255,0.08))] bg-[var(--nxt1-color-surface-100,rgba(255,255,255,0.04))] text-sm text-[var(--nxt1-color-text-secondary,rgba(255,255,255,0.7))] transition-all hover:bg-[var(--nxt1-color-surface-200,rgba(255,255,255,0.08))] hover:text-[var(--nxt1-color-text-primary,#fff)] max-md:right-6"
              (click)="pinVideoClick.emit()"
              aria-label="Edit pinned video"
            >
              <svg
                class="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
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
