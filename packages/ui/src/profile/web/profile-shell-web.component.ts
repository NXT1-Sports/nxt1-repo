/**
 * @fileoverview Profile Shell Component - Web (Tailwind SSR)
 * @module @nxt1/ui/profile/web
 * @version 1.0.0
 *
 * Web-optimized Profile Shell using pure Tailwind CSS.
 * 100% SSR-safe with semantic HTML for Grade A+ SEO.
 *
 * ⭐ WEB ONLY - Pure Tailwind, Zero Ionic, SSR-optimized ⭐
 *
 * SEO Features:
 * - Semantic HTML structure (<main>, <section>, <article>)
 * - Proper heading hierarchy (h1 → h2 → h3)
 * - Structured data support ready
 * - Fast LCP with SSR
 *
 * Design Token Integration:
 * - Uses @nxt1/design-tokens CSS custom properties
 * - Tailwind classes map to design tokens via preset
 * - Dark/light mode via [data-theme] attribute
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
import {
  type ProfileTabId,
  type ProfileTab,
  PROFILE_TABS,
  PROFILE_EMPTY_STATES,
  type ProfileOffer,
  type ProfileEvent,
} from '@nxt1/core';
import { NxtPageHeaderComponent, type PageHeaderAction } from '../../components/page-header';
import { NxtRefresherComponent, type RefreshEvent } from '../../components/refresh-container';
import {
  NxtOptionScrollerComponent,
  type OptionScrollerItem,
  type OptionScrollerChangeEvent,
} from '../../components/option-scroller';
import { NxtToastService } from '../../services/toast/toast.service';
import { NxtLoggingService } from '../../services/logging/logging.service';
import { ProfileService } from '../profile.service';
import { ProfileHeaderWebComponent } from './profile-header-web.component';
import { ProfileStatsBarComponent } from '../profile-stats-bar.component';
import { ProfileTimelineComponent } from '../profile-timeline.component';
import { ProfileOffersComponent } from '../profile-offers.component';
import { ProfileSkeletonComponent } from '../profile-skeleton.component';
import type { ProfileShellUser } from '../profile-shell.component';

@Component({
  selector: 'nxt1-profile-shell-web',
  standalone: true,
  imports: [
    CommonModule,
    NxtPageHeaderComponent,
    NxtRefresherComponent,
    NxtOptionScrollerComponent,
    ProfileHeaderWebComponent,
    ProfileStatsBarComponent,
    ProfileTimelineComponent,
    ProfileOffersComponent,
    ProfileSkeletonComponent,
  ],
  template: `
    <!-- Page header: mobile only (hidden on desktop) -->
    <div class="md:hidden">
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
    </div>

    <!-- SEO: Main content area with semantic structure -->
    <main class="profile-main bg-bg-primary min-h-screen">
      <!-- Pull-to-Refresh -->
      <nxt-refresher (onRefresh)="handleRefresh($event)" (onTimeout)="handleRefreshTimeout()" />

      <div class="profile-container mx-auto pb-20">
        <!-- Loading State -->
        @if (profile.isLoading()) {
          <nxt1-profile-skeleton variant="full" />
        }

        <!-- Error State -->
        @else if (profile.error()) {
          <section
            class="flex flex-col items-center justify-center px-6 py-16 text-center"
            aria-labelledby="error-heading"
          >
            <div class="mb-4 text-5xl" aria-hidden="true">⚠️</div>
            <h2 id="error-heading" class="text-text-primary mb-2 text-lg font-semibold">
              Failed to load profile
            </h2>
            <p class="text-text-secondary mb-5 text-sm">{{ profile.error() }}</p>
            <button
              type="button"
              class="bg-surface-100 border-border-subtle text-text-primary hover:bg-surface-200 rounded-full border px-6 py-2.5 text-sm font-semibold transition-colors"
              (click)="onRetry()"
            >
              Try Again
            </button>
          </section>
        }

        <!-- Profile Content -->
        @else if (profile.user()) {
          <!-- SEO: Article wraps the main profile content -->
          <article itemscope itemtype="https://schema.org/Person">
            <!-- Profile Header Section -->
            <nxt1-profile-header-web
              [user]="profile.user()"
              [followStats]="profile.followStats()"
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

            <!-- Quick Stats Bar -->
            <nxt1-profile-stats-bar
              [stats]="profile.quickStatsDisplay()"
              [isLoading]="false"
              [clickable]="profile.isOwnProfile()"
              (statClick)="onStatClick($event)"
            />
          </article>

          <!-- Tab Navigation -->
          <nav aria-label="Profile sections">
            <nxt1-option-scroller
              [options]="tabOptions()"
              [selectedId]="profile.activeTab()"
              [config]="{ scrollable: true, stretchToFill: false, showDivider: true }"
              (selectionChange)="onTabChange($event)"
            />
          </nav>

          <!-- Tab Content -->
          <section class="profile-tab-content min-h-[300px]" aria-live="polite">
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
                <section class="stats-section px-4 py-4 md:px-6" aria-labelledby="stats-heading">
                  <h2 id="stats-heading" class="sr-only">Athletic Statistics</h2>
                  @if (profile.athleticStats().length === 0) {
                    <div class="flex flex-col items-center px-6 py-16 text-center">
                      <!-- Stats Icon (inline SVG for SSR) -->
                      <svg
                        class="text-text-tertiary mb-4 h-12 w-12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                        />
                      </svg>
                      <h3 class="text-text-primary mb-2 text-lg font-semibold">
                        No stats recorded
                      </h3>
                      <p class="text-text-secondary mb-5 max-w-[280px] text-sm">
                        Add your athletic and academic stats to complete your profile.
                      </p>
                      @if (profile.isOwnProfile()) {
                        <button
                          type="button"
                          class="bg-primary rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
                          (click)="onAddStats()"
                        >
                          Add Stats
                        </button>
                      }
                    </div>
                  } @else {
                    @for (category of profile.athleticStats(); track category.name) {
                      <div class="mb-6">
                        <h3
                          class="text-text-secondary mb-3 text-sm font-semibold tracking-wider uppercase"
                        >
                          {{ category.name }}
                        </h3>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                          @for (stat of category.stats; track stat.label) {
                            <div
                              class="bg-surface-100 border-border-subtle relative flex flex-col gap-1 rounded-lg border p-3"
                            >
                              <span class="text-text-primary text-xl font-bold"
                                >{{ stat.value }}{{ stat.unit ?? '' }}</span
                              >
                              <span class="text-text-secondary text-xs">{{ stat.label }}</span>
                              @if (stat.verified) {
                                <span
                                  class="bg-primary absolute top-2 right-2 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-black"
                                  >✓</span
                                >
                              }
                            </div>
                          }
                        </div>
                      </div>
                    }
                  }
                </section>
              }

              @case ('events') {
                <section class="events-section px-4 py-4 md:px-6" aria-labelledby="events-heading">
                  <h2 id="events-heading" class="sr-only">Events</h2>
                  @if (profile.events().length === 0) {
                    <div class="flex flex-col items-center px-6 py-16 text-center">
                      <!-- Calendar Icon (inline SVG for SSR) -->
                      <svg
                        class="text-text-tertiary mb-4 h-12 w-12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                        />
                      </svg>
                      <h3 class="text-text-primary mb-2 text-lg font-semibold">
                        No events scheduled
                      </h3>
                      <p class="text-text-secondary mb-5 max-w-[280px] text-sm">
                        Add upcoming games, camps, and showcases to your calendar.
                      </p>
                      @if (profile.isOwnProfile()) {
                        <button
                          type="button"
                          class="bg-primary rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
                          (click)="onAddEvent()"
                        >
                          Add Event
                        </button>
                      }
                    </div>
                  } @else {
                    @if (profile.upcomingEvents().length > 0) {
                      <h3
                        class="text-text-secondary mb-3 text-sm font-semibold tracking-wider uppercase"
                      >
                        Upcoming Events
                      </h3>
                      @for (event of profile.upcomingEvents(); track event.id) {
                        <button
                          type="button"
                          class="bg-surface-100 border-border-subtle hover:bg-surface-200 hover:border-primary mb-2.5 flex w-full cursor-pointer items-center gap-4 rounded-xl border p-3.5 text-left transition-all"
                          (click)="onEventClick(event)"
                        >
                          <time
                            class="bg-primary flex h-[50px] w-[50px] flex-shrink-0 flex-col items-center justify-center rounded-lg text-black"
                          >
                            <span class="text-[10px] font-semibold uppercase">{{
                              formatEventMonth(event.startDate)
                            }}</span>
                            <span class="text-lg font-bold">{{
                              formatEventDay(event.startDate)
                            }}</span>
                          </time>
                          <div class="min-w-0 flex-1">
                            <span
                              class="text-text-primary mb-0.5 block text-[15px] font-semibold"
                              >{{ event.name }}</span
                            >
                            <span class="text-text-secondary text-[13px]">{{
                              event.location
                            }}</span>
                          </div>
                          <span
                            class="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-[11px] font-medium capitalize"
                            >{{ event.type }}</span
                          >
                        </button>
                      }
                    }

                    @if (profile.pastEvents().length > 0) {
                      <h3
                        class="text-text-tertiary mt-6 mb-3 text-sm font-semibold tracking-wider uppercase"
                      >
                        Past Events
                      </h3>
                      @for (event of profile.pastEvents(); track event.id) {
                        <button
                          type="button"
                          class="bg-surface-100 border-border-subtle hover:bg-surface-200 mb-2.5 flex w-full cursor-pointer items-center gap-4 rounded-xl border p-3.5 text-left opacity-60 transition-all"
                          (click)="onEventClick(event)"
                        >
                          <time
                            class="bg-primary flex h-[50px] w-[50px] flex-shrink-0 flex-col items-center justify-center rounded-lg text-black"
                          >
                            <span class="text-[10px] font-semibold uppercase">{{
                              formatEventMonth(event.startDate)
                            }}</span>
                            <span class="text-lg font-bold">{{
                              formatEventDay(event.startDate)
                            }}</span>
                          </time>
                          <div class="min-w-0 flex-1">
                            <span
                              class="text-text-primary mb-0.5 block text-[15px] font-semibold"
                              >{{ event.name }}</span
                            >
                            @if (event.result) {
                              <span class="text-primary text-[13px] font-semibold">{{
                                event.result
                              }}</span>
                            } @else {
                              <span class="text-text-secondary text-[13px]">{{
                                event.location
                              }}</span>
                            }
                          </div>
                        </button>
                      }
                    }
                  }
                </section>
              }

              @case ('contact') {
                <section
                  class="contact-section px-4 py-4 md:px-6"
                  aria-labelledby="contact-heading"
                >
                  <h2 id="contact-heading" class="sr-only">Contact Information</h2>
                  @if (!profile.user()?.contact?.email && !profile.user()?.contact?.phone) {
                    <div class="flex flex-col items-center px-6 py-16 text-center">
                      <!-- Mail Icon (inline SVG for SSR) -->
                      <svg
                        class="text-text-tertiary mb-4 h-12 w-12"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                        />
                      </svg>
                      <h3 class="text-text-primary mb-2 text-lg font-semibold">
                        Contact info not set
                      </h3>
                      <p class="text-text-secondary mb-5 max-w-[280px] text-sm">
                        Add your contact information so coaches can reach you.
                      </p>
                      @if (profile.isOwnProfile()) {
                        <button
                          type="button"
                          class="bg-primary rounded-full px-6 py-2.5 text-sm font-semibold text-black transition-all hover:brightness-110"
                          (click)="onEditContact()"
                        >
                          Add Contact Info
                        </button>
                      }
                    </div>
                  } @else {
                    <div
                      class="bg-surface-100 border-border-subtle divide-border-subtle divide-y overflow-hidden rounded-xl border p-4"
                    >
                      @if (profile.user()?.contact?.email) {
                        <div class="flex items-center gap-3 py-3">
                          <!-- Mail Icon -->
                          <svg
                            class="text-primary h-5 w-5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                            />
                          </svg>
                          <a
                            [href]="'mailto:' + profile.user()?.contact?.email"
                            class="text-text-primary text-[15px] hover:underline"
                            >{{ profile.user()?.contact?.email }}</a
                          >
                        </div>
                      }
                      @if (profile.user()?.contact?.phone) {
                        <div class="flex items-center gap-3 py-3">
                          <!-- Phone Icon -->
                          <svg
                            class="text-primary h-5 w-5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                            />
                          </svg>
                          <a
                            [href]="'tel:' + profile.user()?.contact?.phone"
                            class="text-text-primary text-[15px] hover:underline"
                            >{{ profile.user()?.contact?.phone }}</a
                          >
                        </div>
                      }
                    </div>

                    @if (profile.user()?.social) {
                      <h3
                        class="text-text-secondary mt-6 mb-3 text-sm font-semibold tracking-wider uppercase"
                      >
                        Social Media
                      </h3>
                      <div class="flex flex-col gap-2">
                        @if (profile.user()?.social?.twitter) {
                          <a
                            class="bg-surface-100 border-border-subtle hover:bg-surface-200 hover:border-primary flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all"
                            [href]="'https://twitter.com/' + profile.user()?.social?.twitter"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <!-- Twitter/X Icon -->
                            <svg
                              class="text-text-secondary h-5 w-5"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                              />
                            </svg>
                            <span class="text-text-primary">{{
                              '@' + profile.user()?.social?.twitter
                            }}</span>
                          </a>
                        }
                        @if (profile.user()?.social?.instagram) {
                          <a
                            class="bg-surface-100 border-border-subtle hover:bg-surface-200 hover:border-primary flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all"
                            [href]="'https://instagram.com/' + profile.user()?.social?.instagram"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <!-- Instagram Icon -->
                            <svg
                              class="text-text-secondary h-5 w-5"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"
                              />
                            </svg>
                            <span class="text-text-primary">{{
                              '@' + profile.user()?.social?.instagram
                            }}</span>
                          </a>
                        }
                        @if (profile.user()?.social?.hudl) {
                          <a
                            class="bg-surface-100 border-border-subtle hover:bg-surface-200 hover:border-primary flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all"
                            [href]="'https://hudl.com/profile/' + profile.user()?.social?.hudl"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <!-- Link Icon -->
                            <svg
                              class="text-text-secondary h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                              />
                            </svg>
                            <span class="text-text-primary">Hudl Profile</span>
                          </a>
                        }
                      </div>
                    }
                  }
                </section>
              }
            }
          </section>
        }
      </div>
    </main>
  `,
  styles: [
    `
      /* Host styling */
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }

      /* Main content background */
      .profile-main {
        background: var(--nxt1-color-bg-primary, #0a0a0a);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellWebComponent implements OnInit {
  protected readonly profile = inject(ProfileService);
  private readonly toast = inject(NxtToastService);
  private readonly logger = inject(NxtLoggingService).child('ProfileShellWeb');

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

    if (unicode) {
      this.profile.loadProfile(unicode, isOwn);
    } else {
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
      this.profile.loadProfile('me', true);
    }
  }

  // Header actions
  protected onFollowToggle(): void {
    this.profile.toggleFollow();
  }

  protected onFollowersClick(): void {
    this.logger.debug('Followers click');
  }

  protected onFollowingClick(): void {
    this.logger.debug('Following click');
  }

  protected onEditProfile(): void {
    this.editProfileClick.emit();
  }

  protected onEditTeam(): void {
    this.editTeamClick.emit();
  }

  protected onEditBanner(): void {
    this.logger.debug('Edit banner');
  }

  protected onEditAvatar(): void {
    this.logger.debug('Edit avatar');
  }

  protected onMessageClick(): void {
    this.logger.debug('Message click');
  }

  protected onPinnedVideoClick(): void {
    this.logger.debug('Pinned video click');
  }

  protected onPinVideoClick(): void {
    this.logger.debug('Pin video click');
  }

  protected onStatClick(key: string): void {
    this.logger.debug('Stat click', { key });
  }

  // Post actions
  protected onPostClick(post: { id: string }): void {
    this.logger.debug('Post click', { postId: post.id });
  }

  protected onLikePost(post: { id: string }): void {
    this.logger.debug('Like post', { postId: post.id });
  }

  protected onCommentPost(post: { id: string }): void {
    this.logger.debug('Comment post', { postId: post.id });
  }

  protected onSharePost(post: { id: string }): void {
    this.logger.debug('Share post', { postId: post.id });
  }

  protected onPostMenu(post: { id: string }): void {
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

  // Offers
  protected onOfferClick(offer: ProfileOffer): void {
    this.logger.debug('Offer click', { offerId: offer.id });
  }

  protected onAddOffer(): void {
    this.logger.debug('Add offer');
  }

  // Stats
  protected onAddStats(): void {
    this.logger.debug('Add stats');
  }

  // Events
  protected onEventClick(event: ProfileEvent): void {
    this.logger.debug('Event click', { eventId: event.id });
  }

  protected onAddEvent(): void {
    this.logger.debug('Add event');
  }

  // Contact
  protected onEditContact(): void {
    this.logger.debug('Edit contact');
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
