/**
 * @fileoverview Explore "For You" Landing Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 2.0.0
 *
 * NXT1 2026 Elite "For You" Dashboard — 10 AI-curated sections.
 * SSR-safe semantic HTML, zero Ionic dependencies, design token CSS.
 *
 * ⭐ WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized ⭐
 *
 * Sections:
 *  1. AI Executive Summary (Hero)       — No @defer (LCP critical)
 *  2. Stock Exchange (Trending Movers)  — @defer
 *  3. Film Room (Cinematic Inject)      — @defer, IntersectionObserver via @defer(on viewport)
 *  4. Matchmaker / War Room (Bento)     — @defer
 *  5. Social Pulse (Algorithmic Feed)   — @defer
 *  6. Campus Radar (College Programs)   — @defer
 *  7. Intel Desk (Deep Dives)           — @defer
 *  8. Proving Grounds (Events/Camps)    — @defer
 *  9. Inner Circle (Social Proof)       — @defer
 * 10. Agent X Contextual Inject         — @defer
 *
 * Design Token Compliance: ZERO hardcoded colors. All via Tailwind preset classes.
 */

import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ExploreItem, ExploreTabId } from '@nxt1/core';
import type { ExploreUser } from '../explore-shell.component';
import { MOCK_ATHLETES, MOCK_COLLEGES, MOCK_VIDEOS } from '../explore.mock-data';

// ── Inline mock data for new section types not yet in mock-data ──
const MOCK_EVENTS = [
  {
    id: 'evt-1',
    title: 'Elite Showcase Camp',
    sport: 'Basketball',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    location: 'Los Angeles, CA',
    spots: 12,
  },
  {
    id: 'evt-2',
    title: 'National Combine',
    sport: 'Football',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    location: 'Dallas, TX',
    spots: 8,
  },
  {
    id: 'evt-3',
    title: 'Volleyball Summit',
    sport: 'Volleyball',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
    location: 'San Diego, CA',
    spots: 20,
  },
  {
    id: 'evt-4',
    title: 'Soccer Academy Trials',
    sport: 'Soccer',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28),
    location: 'Miami, FL',
    spots: 15,
  },
];

const MOCK_INTEL = [
  {
    id: 'intel-1',
    title: '5-Star PG Marcus Johnson Commits to UCLA',
    category: 'Commitment',
    thumbnail: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=200',
    timeAgo: '2h ago',
    readTime: '3 min read',
  },
  {
    id: 'intel-2',
    title: 'SEC Recruiting Rankings: Top 2026 Prospects',
    category: 'Rankings',
    thumbnail: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=200',
    timeAgo: '4h ago',
    readTime: '5 min read',
  },
  {
    id: 'intel-3',
    title: "James Thompson's 4.3 Speed Draws NFL Interest",
    category: 'Scout Report',
    thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
    timeAgo: '6h ago',
    readTime: '4 min read',
  },
  {
    id: 'intel-4',
    title: "Big Ten Expanding Women's Basketball Recruiting",
    category: 'News',
    thumbnail: 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?w=200',
    timeAgo: '8h ago',
    readTime: '2 min read',
  },
];

const MOCK_SOCIAL_POSTS = [
  {
    id: 'post-1',
    authorName: 'Marcus Johnson',
    authorAvatar: 'https://i.pravatar.cc/150?img=12',
    content: 'Blessed to announce my commitment to UCLA! 🐻💙 #GoUCLA #Committed',
    timestamp: '2h ago',
    likes: 2847,
    comments: 341,
  },
  {
    id: 'post-2',
    authorName: 'Sarah Williams',
    authorAvatar: 'https://i.pravatar.cc/150?img=25',
    content: 'New PR in the 100m today — 10.98! Hard work paying off 🏃‍♀️⚡',
    timestamp: '5h ago',
    likes: 1204,
    comments: 98,
  },
  {
    id: 'post-3',
    authorName: 'Carlos Rodriguez',
    authorAvatar: 'https://i.pravatar.cc/150?img=33',
    content: 'Game winner in overtime! Nothing better than this feeling ⚽🔥',
    timestamp: '1d ago',
    likes: 3510,
    comments: 267,
  },
];

@Component({
  selector: 'nxt1-explore-for-you-web',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="for-you pb-10" aria-label="For You — personalized explore">
      <!-- ═══════════════════════════════════════════════════════
           SECTION 1: AI Executive Summary (Hero)
           No @defer — LCP critical, loads immediately
           ═══════════════════════════════════════════════════════ -->
      <article
        class="relative mx-4 mb-6 overflow-hidden rounded-2xl bg-surface-100 md:mx-6"
        aria-labelledby="hero-ai-summary"
      >
        <!-- Background imagery with gradient overlay -->
        <div class="relative aspect-[21/9] overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=80"
            alt="Today's top sports recruiting moments"
            class="h-full w-full object-cover"
            loading="eager"
          />
          <div
            class="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/70 to-transparent"
          ></div>
        </div>

        <!-- Content overlay -->
        <div class="absolute bottom-0 left-0 right-0 p-5 md:p-8">
          <!-- AI Badge -->
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span
              class="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-bg-primary"
            >
              ⚡ AI Executive Summary
            </span>
            <span
              class="rounded-full bg-surface-100/60 px-3 py-1 text-[10px] font-medium text-text-inverse backdrop-blur-sm"
            >
              Updated 2 min ago
            </span>
          </div>

          <!-- Headline -->
          <h2
            id="hero-ai-summary"
            class="mb-2 text-xl font-bold leading-tight text-text-inverse md:text-3xl"
          >
            Today's Biggest Moves in Sports Recruiting
          </h2>
          <p class="mb-4 text-sm text-text-inverse/80">
            AI-curated highlights from 247 sources across football, basketball, soccer & more.
          </p>

          <!-- Key athlete chips -->
          <div class="flex flex-wrap gap-2">
            @for (athlete of topAthletes(); track athlete.id) {
              <button
                type="button"
                class="rounded-full bg-surface-100/60 px-3 py-1 text-xs font-medium text-text-inverse backdrop-blur-sm transition-all hover:bg-surface-200/80 active:scale-95"
                (click)="itemTap.emit(athlete)"
              >
                {{ athlete.name }}
              </button>
            }
          </div>
        </div>
      </article>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 2: The Stock Exchange (Trending Movers)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-stock-exchange">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-stock-exchange"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              📈 Stock Exchange
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('athletes')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <!-- Horizontal scroll of mover cards -->
          <div
            class="flex gap-3 overflow-x-auto scroll-smooth px-4 pb-3 md:px-6"
            style="scroll-snap-type: x mandatory; scrollbar-width: thin;"
            role="list"
          >
            @for (mover of trendingMovers(); track mover.id; let i = $index) {
              <article
                class="flex w-32 flex-shrink-0 cursor-pointer flex-col items-center gap-2 rounded-xl border border-border-subtle bg-surface-200 p-3 transition-all hover:-translate-y-0.5 hover:border-border-primary hover:bg-surface-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95"
                style="scroll-snap-align: start;"
                role="listitem"
                tabindex="0"
                (click)="itemTap.emit(mover)"
                (keydown.enter)="itemTap.emit(mover)"
                [attr.aria-label]="mover.name + ', ' + mover.sport"
              >
                <img
                  [src]="mover.imageUrl"
                  [alt]="mover.name"
                  class="h-12 w-12 rounded-full object-cover ring-2 ring-border-subtle"
                  loading="lazy"
                />
                <p class="w-full truncate text-center text-xs font-semibold text-text-primary">
                  {{ mover.name }}
                </p>
                <p class="text-center text-[10px] text-text-tertiary">{{ mover.sport }}</p>
                <!-- Trend indicator -->
                <div class="flex items-center gap-1">
                  @if (i % 3 === 0) {
                    <span class="text-xs font-bold text-primary">↑ +{{ 8 + i * 3 }}%</span>
                  } @else if (i % 3 === 1) {
                    <span class="text-xs font-bold text-primary">↑ +{{ 5 + i * 2 }}%</span>
                  } @else {
                    <span class="text-xs font-bold text-text-secondary">→ Steady</span>
                  }
                </div>
                @if (mover['commitment']) {
                  <span
                    class="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-bg-primary"
                  >
                    Committed
                  </span>
                }
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-36 w-32 flex-shrink-0 animate-pulse rounded-xl bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-36 w-32 flex-shrink-0 animate-pulse rounded-xl bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 3: The Film Room (Cinematic Inject)
           @defer(on viewport) — SSR-safe IntersectionObserver
           Video autoplays muted when section enters viewport
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="bg-bg-primary py-5" aria-labelledby="section-film-room">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-film-room"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              🎬 Film Room
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('videos')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <!-- Featured cinematic video — autoplays when @defer renders in viewport -->
          <div class="relative aspect-video w-full overflow-hidden bg-bg-primary">
            <video
              class="h-full w-full object-cover"
              autoplay
              muted
              loop
              playsinline
              poster="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=60"
              aria-label="Featured highlight reel"
            >
              <source
                src="https://www.w3schools.com/html/mov_bbb.mp4"
                type="video/mp4"
              />
            </video>
            <!-- Gradient overlay at bottom -->
            <div
              class="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg-primary to-transparent"
            ></div>
            <!-- Video label -->
            <div class="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div>
                <p class="text-sm font-bold text-text-inverse">
                  {{ featuredVideo().name }}
                </p>
                <p class="text-xs text-text-inverse/70">{{ featuredVideo().creator.name }}</p>
              </div>
              <span
                class="rounded-md bg-surface-100/80 px-2 py-1 text-[10px] font-medium text-text-primary backdrop-blur-sm"
              >
                {{ formatDuration(featuredVideo().duration) }}
              </span>
            </div>
          </div>

          <!-- Video card scroll -->
          <div
            class="mt-4 flex gap-3 overflow-x-auto px-4 pb-2 md:px-6"
            style="scroll-snap-type: x mandatory; scrollbar-width: thin;"
          >
            @for (video of videoList(); track video.id) {
              <article
                class="flex w-52 flex-shrink-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-100 transition-all hover:-translate-y-0.5 hover:border-border-primary focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97]"
                style="scroll-snap-align: start;"
                tabindex="0"
                (click)="itemTap.emit(video)"
                (keydown.enter)="itemTap.emit(video)"
              >
                <div class="relative aspect-video overflow-hidden bg-surface-200">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.name"
                    class="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    loading="lazy"
                  />
                  <span
                    class="absolute bottom-1.5 right-1.5 rounded bg-surface-300/90 px-1.5 py-0.5 text-[10px] font-medium text-text-primary backdrop-blur-sm"
                  >
                    {{ formatDuration(video.duration) }}
                  </span>
                </div>
                <div class="p-3">
                  <p
                    class="mb-1 line-clamp-2 text-xs font-semibold leading-tight text-text-primary"
                  >
                    {{ video.name }}
                  </p>
                  <p class="text-[10px] text-text-tertiary">
                    {{ formatViews(video.views) }} views
                  </p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="bg-bg-primary py-5">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300 mx-4 md:mx-6"></div>
          <div class="aspect-video w-full animate-pulse bg-surface-300"></div>
        </div>
      } @loading (minimum 300ms) {
        <div class="bg-bg-primary py-5">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300 mx-4 md:mx-6"></div>
          <div class="aspect-video w-full animate-pulse bg-surface-300"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 4: The Matchmaker / War Room (Bento Grid)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-war-room">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-war-room"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              🧠 Matchmaker / War Room
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('colleges')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <!-- Dense Bento Grid -->
          <div class="grid grid-cols-2 gap-3 px-4 md:grid-cols-4 md:px-6">
            @for (college of bentoColleges(); track college.id) {
              <article
                class="group cursor-pointer overflow-hidden rounded-xl border border-border-subtle bg-surface-100 p-4 transition-all hover:border-border-primary hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97]"
                tabindex="0"
                (click)="itemTap.emit(college)"
                (keydown.enter)="itemTap.emit(college)"
                [attr.aria-label]="'College: ' + college.name"
              >
                <img
                  [src]="college.imageUrl"
                  [alt]="college.name + ' logo'"
                  class="mb-3 h-12 w-12 rounded-lg object-contain"
                  loading="lazy"
                />
                <h3 class="mb-1 text-sm font-bold text-text-primary">{{ college.name }}</h3>
                <p class="mb-2 text-xs text-text-secondary">{{ college.division }}</p>
                <p class="text-[10px] text-text-tertiary">{{ college.conference }}</p>
                <!-- Match score badge -->
                <div class="mt-3 flex items-center justify-between">
                  <span class="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {{ 85 + $index * 3 }}% Match
                  </span>
                  <span class="text-[10px] text-text-tertiary">#{{ college.ranking }}</span>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-48 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-40 animate-pulse rounded-xl bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-48 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-40 animate-pulse rounded-xl bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 5: The Social Pulse (Algorithmic Best-Of)
           Masonry-style grid on web
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-social-pulse">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-social-pulse"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              💬 Social Pulse
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('feed')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <!-- Masonry-style post grid -->
          <div
            class="columns-1 gap-3 px-4 md:columns-2 md:px-6 lg:columns-3"
            style="column-fill: balance;"
          >
            @for (post of socialPosts(); track post.id) {
              <article
                class="mb-3 break-inside-avoid cursor-pointer rounded-xl border border-border-subtle bg-surface-200 p-4 transition-all hover:border-border-primary hover:bg-surface-300 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99]"
                tabindex="0"
              >
                <!-- Author row -->
                <header class="mb-3 flex items-center gap-3">
                  <img
                    [src]="post.authorAvatar"
                    [alt]="post.authorName"
                    class="h-8 w-8 flex-shrink-0 rounded-full object-cover ring-2 ring-border-subtle"
                    loading="lazy"
                  />
                  <div class="min-w-0">
                    <p class="truncate text-xs font-semibold text-text-primary">
                      {{ post.authorName }}
                    </p>
                    <p class="text-[10px] text-text-secondary">{{ post.timestamp }}</p>
                  </div>
                </header>
                <!-- Content -->
                <p class="mb-3 text-sm leading-relaxed text-text-primary">{{ post.content }}</p>
                <!-- Engagement -->
                <footer class="flex items-center gap-4">
                  <span class="flex items-center gap-1 text-xs text-text-secondary">
                    <svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path
                        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                      />
                    </svg>
                    {{ post.likes.toLocaleString() }}
                  </span>
                  <span class="flex items-center gap-1 text-xs text-text-secondary">
                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                    {{ post.comments }}
                  </span>
                </footer>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="mb-3 h-28 animate-pulse rounded-xl bg-surface-300"></div>
          }
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="mb-3 h-28 animate-pulse rounded-xl bg-surface-300"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 6: The Campus Radar (Targeted Programs)
           Large horizontal cards with edge-to-edge imagery
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-campus-radar">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-campus-radar"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              🎓 Campus Radar
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('colleges')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <!-- Large campus cards scroll -->
          <div
            class="flex gap-4 overflow-x-auto px-4 pb-3 md:px-6"
            style="scroll-snap-type: x mandatory; scrollbar-width: thin;"
          >
            @for (college of campusColleges(); track college.id) {
              <article
                class="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl"
                style="width: 300px; scroll-snap-align: start;"
                tabindex="0"
                (click)="itemTap.emit(college)"
                (keydown.enter)="itemTap.emit(college)"
                [attr.aria-label]="'Campus: ' + college.name"
              >
                <!-- Campus imagery (edge-to-edge) -->
                <div class="aspect-[4/3] overflow-hidden">
                  <img
                    [src]="college.imageUrl"
                    [alt]="college.name + ' campus'"
                    class="h-full w-full object-cover bg-surface-200 transition-transform duration-500 hover:scale-105"
                    loading="lazy"
                  />
                </div>

                <!-- Dark gradient overlay -->
                <div
                  class="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/50 to-transparent"
                ></div>

                <!-- Content over image -->
                <div class="absolute bottom-0 left-0 right-0 p-4">
                  <div class="flex items-end justify-between">
                    <div>
                      <!-- College logo in surface container -->
                      <div
                        class="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-100 p-1.5"
                      >
                        <img
                          [src]="college.imageUrl"
                          [alt]="college.name"
                          class="h-full w-full object-contain"
                        />
                      </div>
                      <h3 class="text-sm font-bold text-text-inverse">{{ college.name }}</h3>
                      <p class="text-xs text-text-inverse/70">
                        {{ college.conference }} · {{ college.location }}
                      </p>
                    </div>
                    <div class="text-right">
                      <span
                        class="block rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary"
                      >
                        #{{ college.ranking }} Ranked
                      </span>
                    </div>
                  </div>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-4">
            @for (i of [1, 2, 3]; track i) {
              <div
                class="h-48 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"
                style="width: 300px;"
              ></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-4">
            @for (i of [1, 2, 3]; track i) {
              <div
                class="h-48 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"
                style="width: 300px;"
              ></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 7: The Intel Desk (Deep Dives)
           List view: thumbnail left, text right
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-intel-desk">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-intel-desk"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              📡 Intel Desk
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('news')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <ul class="divide-y divide-border-subtle px-4 md:px-6" role="list">
            @for (article of intelArticles(); track article.id) {
              <li>
                <article
                  class="flex cursor-pointer items-center gap-4 py-3 transition-all hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99]"
                  tabindex="0"
                >
                  <!-- Thumbnail -->
                  <div
                    class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-200 md:h-20 md:w-20"
                  >
                    <img
                      [src]="article.thumbnail"
                      [alt]="article.title"
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>

                  <!-- Text content -->
                  <div class="min-w-0 flex-1">
                    <span
                      class="mb-1 inline-block rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
                    >
                      {{ article.category }}
                    </span>
                    <h3
                      class="mb-1 line-clamp-2 text-sm font-semibold leading-tight text-text-primary"
                    >
                      {{ article.title }}
                    </h3>
                    <div class="flex items-center gap-2 text-[10px] text-text-secondary">
                      <span>{{ article.timeAgo }}</span>
                      <span class="text-border-DEFAULT">·</span>
                      <span>{{ article.readTime }}</span>
                    </div>
                  </div>

                  <!-- Arrow -->
                  <svg
                    class="h-4 w-4 flex-shrink-0 text-text-tertiary opacity-40"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </article>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="mb-1 h-20 animate-pulse rounded-lg bg-surface-300"></div>
          }
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="mb-1 h-20 animate-pulse rounded-lg bg-surface-300"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 8: The Proving Grounds (Events/Camps)
           Calendar-driven bento box layout
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-proving-grounds">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-proving-grounds"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              🏟️ Proving Grounds
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('camps')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <!-- Calendar bento grid -->
          <div class="grid grid-cols-1 gap-3 px-4 md:grid-cols-2 md:px-6">
            @for (event of events(); track event.id) {
              <article
                class="flex cursor-pointer items-center gap-4 rounded-xl border border-border-subtle bg-surface-100 p-4 transition-all hover:border-border-primary hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99]"
                tabindex="0"
              >
                <!-- Date badge -->
                <div
                  class="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 text-primary"
                >
                  <span class="text-[10px] font-bold uppercase leading-none">
                    {{ event.date | date: 'MMM' }}
                  </span>
                  <span class="text-2xl font-bold leading-tight">
                    {{ event.date | date: 'd' }}
                  </span>
                </div>
                <!-- Event info -->
                <div class="min-w-0 flex-1">
                  <h3 class="mb-1 text-sm font-bold text-text-primary">{{ event.title }}</h3>
                  <p class="mb-1 text-xs text-text-secondary">{{ event.sport }}</p>
                  <div class="flex items-center gap-1 text-[10px] text-text-tertiary">
                    <svg
                      class="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                    </svg>
                    {{ event.location }}
                  </div>
                </div>
                <!-- Spots remaining -->
                <div class="text-right">
                  <span
                    class="block rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary"
                  >
                    {{ event.spots }} spots
                  </span>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-44 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-20 animate-pulse rounded-xl bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-44 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-20 animate-pulse rounded-xl bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 9: The Inner Circle (Social Proof)
           Horizontal avatar cluster + activity ticker
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-inner-circle">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <h2
              id="section-inner-circle"
              class="text-base font-bold tracking-tight text-text-primary md:text-lg"
            >
              🔥 Inner Circle
            </h2>
            <button
              type="button"
              class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70"
              (click)="categorySelect.emit('following')"
            >
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </header>

          <!-- Avatar cluster -->
          <div class="mb-4 px-4 md:px-6">
            <div class="flex items-center">
              <!-- Overlapping avatars -->
              <div class="flex items-center" role="list" aria-label="Active athletes you follow">
                @for (athlete of innerCircleAvatars(); track athlete.id; let i = $index) {
                  <div
                    class="relative -ml-2 first:ml-0"
                    style="z-index: {{ innerCircleAvatars().length - i }}"
                    role="listitem"
                  >
                    <img
                      [src]="athlete.imageUrl"
                      [alt]="athlete.name"
                      class="h-10 w-10 rounded-full border-2 border-bg-primary object-cover ring-1 ring-border-subtle"
                      [title]="athlete.name"
                      loading="lazy"
                    />
                  </div>
                }
                <div
                  class="-ml-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-bg-primary bg-surface-200 text-xs font-bold text-text-secondary"
                >
                  +24
                </div>
              </div>
              <p class="ml-4 text-sm text-text-secondary">
                <span class="font-semibold text-text-primary">47 athletes</span> in your network
                are active
              </p>
            </div>
          </div>

          <!-- Activity ticker -->
          <div class="flex flex-col gap-2 px-4 md:px-6">
            @for (athlete of innerCircleAvatars().slice(0, 3); track athlete.id) {
              <div
                class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-100 px-4 py-3"
              >
                <img
                  [src]="athlete.imageUrl"
                  [alt]="athlete.name"
                  class="h-8 w-8 flex-shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
                <p class="text-xs text-text-primary">
                  <span class="font-semibold">{{ athlete.name }}</span>
                  <span class="text-text-secondary"> posted a new highlight</span>
                </p>
                <span class="ml-auto flex-shrink-0 text-[10px] text-text-tertiary">now</span>
              </div>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="mb-4 h-12 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="mb-2 h-12 animate-pulse rounded-xl bg-surface-300"></div>
          }
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="mb-4 h-12 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) {
            <div class="mb-2 h-12 animate-pulse rounded-xl bg-surface-300"></div>
          }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 10: Agent X Contextual Inject (The Closer)
           Conversational AI block at the bottom of the feed
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section
          class="px-4 py-5 md:px-6"
          aria-labelledby="section-agent-x"
        >
          <article
            class="rounded-2xl border border-border-primary bg-surface-300 p-5 shadow-[0_0_15px_var(--nxt1-color-alpha-primary20)]"
          >
            <!-- Agent header -->
            <header class="mb-4 flex items-center gap-3">
              <div
                class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary text-bg-primary"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
                  />
                </svg>
              </div>
              <div>
                <h2 id="section-agent-x" class="text-sm font-bold text-text-primary">
                  Agent X
                </h2>
                <p class="text-xs text-text-secondary">Your AI recruiting strategist</p>
              </div>
              <span
                class="ml-auto rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary"
              >
                ⚡ Live
              </span>
            </header>

            <!-- AI Message -->
            <div class="mb-4 rounded-xl bg-surface-100 p-4">
              <p class="mb-1 text-xs font-semibold text-text-secondary">Agent X says:</p>
              <p class="text-sm leading-relaxed text-text-primary">
                Based on your profile and recent activity, I've identified
                <strong class="text-primary">3 new college programs</strong> actively recruiting
                athletes with your exact skill set. Your commitment window is opening in
                <strong class="text-primary">the next 60 days</strong>. Ready to take action?
              </p>
            </div>

            <!-- Action buttons -->
            <div class="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                class="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-bg-primary transition-all hover:opacity-90 active:scale-[0.98]"
              >
                Show Me the Programs
              </button>
              <button
                type="button"
                class="flex-1 rounded-xl border border-border-primary bg-surface-100 px-4 py-3 text-sm font-medium text-text-primary transition-all hover:bg-surface-200 active:scale-[0.98]"
              >
                Ask Agent X
              </button>
            </div>

            <!-- Contextual insight pills -->
            <div class="mt-4 flex flex-wrap gap-2">
              <span class="rounded-full bg-surface-100 px-3 py-1 text-xs text-text-secondary">
                🏀 Basketball profile matched
              </span>
              <span class="rounded-full bg-surface-100 px-3 py-1 text-xs text-text-secondary">
                📊 4.2 GPA compatible
              </span>
              <span class="rounded-full bg-surface-100 px-3 py-1 text-xs text-text-secondary">
                🎓 Division I eligible
              </span>
            </div>
          </article>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="h-48 animate-pulse rounded-2xl bg-surface-300"></div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="h-48 animate-pulse rounded-2xl bg-surface-300"></div>
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ============================================================
         EXPLORE FOR YOU — Web (Zero Ionic)
         Design token driven, SSR-safe, zero hard-coded values.
         All spacing, color, typography via CSS custom properties.
         ============================================================ */

      :host {
        display: block;
      }

      /* ── REDUCED MOTION ── */

      @media (prefers-reduced-motion: reduce) {
        * {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreForYouWebComponent {
  // ── Inputs ──────────────────────────────────────────────
  readonly user = input<ExploreUser | null>(null);

  // ── Outputs ─────────────────────────────────────────────
  /** Emitted when the user clicks a content item */
  readonly itemTap = output<ExploreItem>();
  /** Emitted when the user clicks "See All" or a category tile */
  readonly categorySelect = output<ExploreTabId>();

  // ── State (Signals) ─────────────────────────────────────
  readonly topAthletes = signal(MOCK_ATHLETES.slice(0, 5));
  readonly trendingMovers = signal(MOCK_ATHLETES);
  readonly featuredVideo = signal(MOCK_VIDEOS[0]);
  readonly videoList = signal(MOCK_VIDEOS);
  readonly bentoColleges = signal(MOCK_COLLEGES.slice(0, 4));
  readonly socialPosts = signal(MOCK_SOCIAL_POSTS);
  readonly campusColleges = signal(MOCK_COLLEGES.slice(0, 3));
  readonly intelArticles = signal(MOCK_INTEL);
  readonly events = signal(MOCK_EVENTS);
  readonly innerCircleAvatars = signal(MOCK_ATHLETES.slice(0, 5));

  // ── Helpers ─────────────────────────────────────────────
  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  formatViews(views: number): string {
    if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
    if (views >= 1_000) return `${(views / 1_000).toFixed(0)}K`;
    return views.toString();
  }
}
