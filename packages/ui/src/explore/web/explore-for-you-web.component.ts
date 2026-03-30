/**
 * @fileoverview Explore "For You" Landing Component — Web (Zero Ionic)
 * @module @nxt1/ui/explore/web
 * @version 3.0.0
 *
 * NXT1 2026 Elite "For You" Dashboard — 10 AI-curated sections.
 * SSR-safe semantic HTML, zero Ionic dependencies, design token CSS.
 *
 * WEB ONLY — Pure HTML/CSS, Zero Ionic, SSR-optimized
 *
 * Sections:
 *  1. Agent X Brief (top, no @defer)
 *  2. AI Executive Summary (Hero, no @defer)
 *  3. Stock Exchange (Trending Movers)  — @defer
 *  4. Film Room (Cinematic Inject)      — @defer, IntersectionObserver via @defer(on viewport)
 *  5. Matchmaker / War Room (Scroll)    — @defer
 *  6. Social Pulse (Algorithmic Feed)   — @defer
 *  7. Campus Radar (College Programs)   — @defer
 *  8. Intel Desk (Deep Dives)           — @defer
 *  9. Proving Grounds (College Camps)   — @defer
 * 10. Inner Circle (Social Proof)       — @defer
 *
 * Design Token Compliance: ZERO hardcoded colors. All via Tailwind preset classes.
 */

import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ExploreItem, ExploreTabId } from '@nxt1/core';
import type { ExploreUser } from '../explore-shell.component';
import { MOCK_ATHLETES, MOCK_COLLEGES, MOCK_VIDEOS } from '../explore.mock-data';
import { FeedPostCardComponent } from '../../feed/feed-post-card.component';
import { MOCK_FEED_POSTS } from '../../feed/feed.mock-data';

// ── Inline mock data for college-hosted camps ──
const MOCK_COLLEGE_CAMPS = [
  {
    id: 'camp-1',
    collegeName: 'UCLA',
    collegeLogo:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/UCLA_Bruins_script.svg/200px-UCLA_Bruins_script.svg.png',
    campName: 'UCLA Basketball Elite Camp',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
    location: 'Los Angeles, CA',
    sport: 'Basketball',
    matchPercent: 94,
    division: 'Division I · Big Ten',
    spotsLeft: 8,
  },
  {
    id: 'camp-2',
    collegeName: 'Duke',
    collegeLogo:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Duke_Athletics_logo.svg/200px-Duke_Athletics_logo.svg.png',
    campName: 'Duke Elite Prospects Camp',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 21),
    location: 'Durham, NC',
    sport: 'Basketball',
    matchPercent: 87,
    division: 'Division I · ACC',
    spotsLeft: 12,
  },
  {
    id: 'camp-3',
    collegeName: 'Texas',
    collegeLogo:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Texas_Longhorns_logo.svg/200px-Texas_Longhorns_logo.svg.png',
    campName: 'Texas Football Showcase',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 28),
    location: 'Austin, TX',
    sport: 'Football',
    matchPercent: 82,
    division: 'Division I · SEC',
    spotsLeft: 5,
  },
  {
    id: 'camp-4',
    collegeName: 'Stanford',
    collegeLogo:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Stanford_Cardinal_logo.svg/200px-Stanford_Cardinal_logo.svg.png',
    campName: 'Stanford Basketball Academy',
    date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 35),
    location: 'Stanford, CA',
    sport: 'Basketball',
    matchPercent: 78,
    division: 'Division I · ACC',
    spotsLeft: 20,
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

const STOCK_HERO_IMAGES = [
  'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=400&h=640&fit=crop&q=80',
  'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400&h=640&fit=crop&q=80',
  'https://images.unsplash.com/photo-1556816213-354f1e24cb47?w=400&h=640&fit=crop&q=80',
  'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?w=400&h=640&fit=crop&q=80',
  'https://images.unsplash.com/photo-1547347298-4074fc3086f0?w=400&h=640&fit=crop&q=80',
  'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=400&h=640&fit=crop&q=80',
];

@Component({
  selector: 'nxt1-explore-for-you-web',
  standalone: true,
  imports: [CommonModule, FeedPostCardComponent],
  template: `
    <section class="for-you pb-10" aria-label="For You — personalized explore">

      <!-- ═══════════════════════════════════════════════════════
           SECTION 1: Agent X Brief (TOP — no @defer)
           Typewriter-style personalized intelligence brief
           ═══════════════════════════════════════════════════════ -->
      <section class="px-4 pt-4 pb-2 md:px-6" aria-labelledby="agent-x-brief">
        <article
          class="rounded-2xl border border-border-primary bg-surface-300 p-5 shadow-[0_0_20px_var(--nxt1-color-alpha-primary20)]"
        >
          <header class="mb-4 flex items-center gap-3">
            <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary">
              <svg class="h-5 w-5 text-bg-primary" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-11h2v6h-2zm0-4h2v2h-2z"/>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <h2 id="agent-x-brief" class="text-sm font-bold text-text-primary">Agent X</h2>
              <p class="text-[11px] text-text-secondary">Personalized Intelligence Brief</p>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="agent-pulse"></span>
              <span class="text-[11px] font-semibold text-primary">Live</span>
            </div>
          </header>

          <div class="rounded-xl bg-surface-100 p-4">
            <p class="mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
              Daily Brief — {{ today() }}
            </p>
            <div class="space-y-3">
              <p class="text-sm leading-relaxed text-text-primary">
                Your Class of 2026 Point Guard profile ranks in the
                <span class="font-bold text-primary">top 8% of recruits nationally</span>
                based on verified highlights and scout activity this week.
              </p>
              <p class="text-sm leading-relaxed text-text-primary">
                Coaching staff from
                <span class="font-bold text-primary">UCLA, Michigan, and Duke</span>
                have actively viewed your highlight reel in the last 48 hours.
              </p>
              <p class="text-sm leading-relaxed text-text-primary">
                Your commitment window is entering a
                <span class="font-bold text-primary">critical 60-day stage</span>
                — 3 Division I programs have flagged your profile as a priority target.
              </p>
              <p class="text-sm leading-relaxed text-text-primary">
                Open your personalized action plan to review scholarship timelines, camp invites,
                and the next move Agent X recommends for your recruiting journey.<span class="agent-cursor"></span>
              </p>
            </div>
          </div>

          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-bg-primary transition-all hover:opacity-90 active:scale-[0.98]"
            >
              Open My Action Plan
            </button>
            <button
              type="button"
              class="rounded-xl border border-border-primary bg-surface-100 px-4 py-3 text-sm font-medium text-text-primary transition-all hover:bg-surface-200 active:scale-[0.98]"
            >
              Ask Agent X
            </button>
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <span class="rounded-full bg-surface-200 px-3 py-1 text-xs text-text-secondary">Basketball · Class of 2026</span>
            <span class="rounded-full bg-surface-200 px-3 py-1 text-xs text-text-secondary">4.2 GPA · Division I Eligible</span>
            <span class="rounded-full bg-surface-200 px-3 py-1 text-xs text-text-secondary">3 Programs Active</span>
          </div>
        </article>
      </section>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 2: AI Executive Summary (Hero)
           No @defer — LCP critical
           ═══════════════════════════════════════════════════════ -->
      <article
        class="relative mx-4 mt-4 mb-6 overflow-hidden rounded-2xl bg-surface-100 md:mx-6"
        aria-labelledby="hero-ai-summary"
      >
        <div class="relative aspect-[21/9] overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=80"
            alt="Today's top sports recruiting moments"
            class="h-full w-full object-cover"
            loading="eager"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/80 to-bg-primary/10"></div>
        </div>

        <div class="absolute bottom-0 left-0 right-0 z-10 p-5 md:p-8">
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-bg-primary">
              AI Executive Summary
            </span>
            <span class="rounded-full border border-border-subtle bg-surface-100/60 px-3 py-1 text-[10px] font-medium text-text-primary backdrop-blur-sm">
              Updated 2 min ago
            </span>
          </div>
          <h2 id="hero-ai-summary" class="mb-2 text-xl font-bold leading-tight text-text-primary md:text-3xl">
            Today's Biggest Moves in Sports Recruiting
          </h2>
          <p class="mb-4 text-sm text-text-secondary">
            AI-curated highlights from 247 sources across football, basketball, soccer and more.
          </p>
          <div class="flex flex-wrap gap-2">
            @for (athlete of topAthletes(); track athlete.id) {
              <button
                type="button"
                class="rounded-full border border-border-subtle bg-surface-100/70 px-3 py-1 text-xs font-medium text-text-primary backdrop-blur-sm transition-all hover:bg-surface-200/80 active:scale-95"
                (click)="itemTap.emit(athlete)"
              >
                {{ athlete.name }}
              </button>
            }
          </div>
        </div>
      </article>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 3: The Stock Exchange (Trending Movers)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-stock-exchange">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-stock-exchange" class="text-base font-bold tracking-tight text-text-primary md:text-lg">
                Stock Exchange
              </h2>
              <p class="text-[11px] text-text-tertiary">Trending athletes in your network</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('athletes')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <div
            class="flex gap-3 overflow-x-auto scroll-smooth px-4 pb-4 md:px-6"
            style="scroll-snap-type: x mandatory; scrollbar-width: none;"
            role="list"
          >
            @for (mover of trendingMovers(); track mover.id; let i = $index) {
              <article
                class="group relative h-64 w-44 flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl border border-border-subtle transition-all hover:-translate-y-1 hover:border-border-primary hover:shadow-[0_8px_24px_var(--nxt1-color-alpha-primary20)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.97]"
                style="scroll-snap-align: start;"
                role="listitem"
                tabindex="0"
                (click)="itemTap.emit(mover)"
                (keydown.enter)="itemTap.emit(mover)"
                (keydown.space)="$event.preventDefault(); itemTap.emit(mover)"
                [attr.aria-label]="mover.name + ', ' + mover.sport"
              >
                <!-- Full-bleed athlete image -->
                <img
                  [src]="getHeroImage(i)"
                  [alt]="mover.name"
                  class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <!-- Gradient overlay — fades bottom half -->
                <div class="absolute inset-0 bg-gradient-to-t from-bg-primary from-30% via-bg-primary/65 via-55% to-transparent"></div>
                <!-- Text overlaid on gradient -->
                <div class="absolute bottom-0 left-0 right-0 p-3">
                  <p class="truncate text-sm font-bold text-text-primary">{{ mover.name }}</p>
                  <p class="truncate text-xs text-text-secondary">{{ mover['position'] || mover.sport }}</p>
                  <p class="text-[11px] text-text-tertiary">Class of {{ mover['classYear'] || '2026' }}</p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-64 w-44 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="h-64 w-44 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 4: The Film Room (Cinematic Inject)
           @defer(on viewport) — video autoplays when visible
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-film-room">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-film-room" class="text-base font-bold tracking-tight text-text-primary md:text-lg">
                Film Room
              </h2>
              <p class="text-[11px] text-text-tertiary">Top highlight reels this week</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('videos')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <div class="mx-4 overflow-hidden rounded-2xl border border-border-subtle bg-bg-primary md:mx-6">
            <div class="relative aspect-video w-full bg-bg-primary">
              <video
                class="h-full w-full object-cover"
                autoplay
                muted
                loop
                playsinline
                poster="https://images.unsplash.com/photo-1546519638-68e109498ffc?w=900&q=60"
                aria-label="Featured highlight reel"
              >
                <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4" />
              </video>

              <div class="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-bg-primary to-transparent"></div>

              <div class="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-bg-primary/70 to-transparent px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
                  <span class="text-[10px] font-semibold uppercase tracking-wider text-text-primary">Live Highlights</span>
                </div>
                <span class="rounded bg-surface-300/80 px-2 py-0.5 text-[10px] font-medium text-text-primary backdrop-blur-sm">HD</span>
              </div>

              <div class="absolute bottom-0 left-0 right-0 px-4 pb-4">
                <div class="flex items-end justify-between">
                  <div class="min-w-0 flex-1">
                    <p class="mb-0.5 truncate text-sm font-bold text-text-primary">{{ featuredVideo().name }}</p>
                    <div class="flex items-center gap-2 text-[11px] text-text-secondary">
                      <span>{{ featuredVideo().creator.name }}</span>
                      <span class="opacity-50">·</span>
                      <span>{{ formatViews(featuredVideo().views) }} views</span>
                      <span class="opacity-50">·</span>
                      <span>{{ featuredVideo().sport }}</span>
                    </div>
                  </div>
                  <span class="ml-3 flex-shrink-0 rounded-md bg-surface-300/80 px-2 py-1 text-[10px] font-bold text-text-primary backdrop-blur-sm">
                    {{ formatDuration(featuredVideo().duration) }}
                  </span>
                </div>
                <div class="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-surface-300/40">
                  <div class="h-full w-1/3 rounded-full bg-primary"></div>
                </div>
              </div>
            </div>

            <div class="flex gap-3 overflow-x-auto bg-surface-100 px-4 pb-4 pt-3" style="scrollbar-width: none;">
              @for (video of videoList(); track video.id) {
                <article
                  class="group flex w-44 flex-shrink-0 cursor-pointer flex-col overflow-hidden rounded-xl border border-border-subtle transition-all hover:border-border-primary focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97]"
                  tabindex="0"
                  (click)="itemTap.emit(video)"
                  (keydown.enter)="itemTap.emit(video)"
                >
                  <div class="relative aspect-video overflow-hidden bg-surface-200">
                    <img [src]="video.thumbnailUrl" [alt]="video.name" class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                    <div class="absolute inset-0 flex items-center justify-center bg-bg-primary/30 opacity-0 transition-opacity group-hover:opacity-100">
                      <div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
                        <svg class="ml-0.5 h-4 w-4 text-bg-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                    <span class="absolute bottom-1.5 right-1.5 rounded bg-bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-text-primary">
                      {{ formatDuration(video.duration) }}
                    </span>
                  </div>
                  <div class="bg-surface-100 p-2.5">
                    <p class="line-clamp-2 text-[11px] font-semibold leading-tight text-text-primary">{{ video.name }}</p>
                    <p class="mt-1 text-[10px] text-text-tertiary">{{ formatViews(video.views) }} views</p>
                  </div>
                </article>
              }
            </div>
          </div>
        </section>
      } @placeholder {
        <div class="py-5 px-4 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="aspect-video w-full animate-pulse rounded-2xl bg-surface-300"></div>
        </div>
      } @loading (minimum 300ms) {
        <div class="py-5 px-4 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="aspect-video w-full animate-pulse rounded-2xl bg-surface-300"></div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 5: The Matchmaker (Horizontal Scroll)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-war-room">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-war-room" class="text-base font-bold tracking-tight text-text-primary md:text-lg">
                Matchmaker
              </h2>
              <p class="text-[11px] text-text-tertiary">Programs built for your profile</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('colleges')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <div
            class="flex gap-4 overflow-x-auto px-4 pb-4 md:px-6"
            style="scroll-snap-type: x mandatory; scrollbar-width: none;"
            role="list"
          >
            @for (college of allColleges(); track college.id; let i = $index) {
              <article
                class="group flex w-64 flex-shrink-0 cursor-pointer flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-100 transition-all hover:-translate-y-0.5 hover:border-border-primary hover:shadow-[0_8px_24px_var(--nxt1-color-alpha-primary20)] focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.97]"
                style="scroll-snap-align: start;"
                role="listitem"
                tabindex="0"
                (click)="itemTap.emit(college)"
                (keydown.enter)="itemTap.emit(college)"
                [attr.aria-label]="'College match: ' + college.name"
              >
                <div class="relative flex items-center justify-between bg-surface-200 px-4 py-3">
                  <img [src]="college.imageUrl" [alt]="college.name + ' logo'" class="h-10 w-10 rounded-lg object-contain" loading="lazy" />
                  <div class="text-right">
                    <p class="text-[10px] font-medium uppercase tracking-wider text-text-tertiary">Match Score</p>
                    <p class="text-2xl font-black text-primary">{{ 95 - i * 4 }}%</p>
                  </div>
                  <div class="absolute bottom-0 left-0 h-0.5 bg-surface-300 w-full">
                    <div class="h-full bg-primary" [style.width]="(95 - i * 4) + '%'"></div>
                  </div>
                </div>

                <div class="flex flex-1 flex-col p-4">
                  <h3 class="mb-1 text-sm font-bold text-text-primary">{{ college.name }}</h3>
                  <p class="mb-1 text-xs text-text-secondary">{{ college.division }} · {{ college.conference }}</p>
                  <p class="mb-3 text-[11px] text-text-tertiary">{{ college.location }}</p>

                  <div class="mb-3 rounded-lg bg-surface-200 px-3 py-2">
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">Why You Match</p>
                    <p class="mt-1 text-xs text-text-secondary">
                      @switch (i % 3) {
                        @case (0) { Actively recruiting your position and class year }
                        @case (1) { Academic profile aligns with admission standards }
                        @default { Scout reports match their style of play }
                      }
                    </p>
                  </div>

                  <div class="mt-auto flex flex-wrap gap-1">
                    @for (sport of college.sports.slice(0, 3); track sport) {
                      <span class="rounded-full bg-surface-300 px-2 py-0.5 text-[10px] text-text-secondary">{{ sport }}</span>
                    }
                    @if (college.sports.length > 3) {
                      <span class="rounded-full bg-surface-300 px-2 py-0.5 text-[10px] text-text-tertiary">+{{ college.sports.length - 3 }}</span>
                    }
                  </div>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-4">
            @for (i of [1, 2, 3]; track i) {
              <div class="h-56 w-64 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"></div>
            }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-40 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-4">
            @for (i of [1, 2, 3]; track i) {
              <div class="h-56 w-64 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 6: The Social Pulse
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-social-pulse">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-social-pulse" class="text-base font-bold tracking-tight text-text-primary md:text-lg">
                Social Pulse
              </h2>
              <p class="text-[11px] text-text-tertiary">Best of your network today</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('feed')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <!-- Real feed post cards from shared FeedPostCardComponent -->
          <div class="flex flex-col divide-y divide-border-subtle px-4 md:px-6">
            @for (feedPost of feedPosts(); track feedPost.id) {
              <nxt1-feed-post-card
                [post]="feedPost"
              />
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="mb-3 h-36 animate-pulse rounded-xl bg-surface-300"></div> }
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4, 5, 6]; track i) { <div class="mb-3 h-36 animate-pulse rounded-xl bg-surface-300"></div> }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 7: The Campus Radar
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-campus-radar">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-campus-radar" class="text-base font-bold tracking-tight text-text-primary md:text-lg">Campus Radar</h2>
              <p class="text-[11px] text-text-tertiary">Campuses actively recruiting you</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('colleges')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <div class="flex gap-4 overflow-x-auto px-4 pb-3 md:px-6" style="scroll-snap-type: x mandatory; scrollbar-width: none;">
            @for (college of campusColleges(); track college.id) {
              <article
                class="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-2xl"
                style="width: 300px; scroll-snap-align: start;"
                tabindex="0"
                (click)="itemTap.emit(college)"
                (keydown.enter)="itemTap.emit(college)"
                [attr.aria-label]="'Campus: ' + college.name"
              >
                <div class="aspect-[4/3] overflow-hidden bg-surface-200">
                  <img [src]="college.imageUrl" [alt]="college.name" class="h-full w-full object-cover transition-transform duration-500 hover:scale-105" loading="lazy" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/50 to-transparent"></div>
                <div class="absolute bottom-0 left-0 right-0 p-4">
                  <div class="flex items-end justify-between">
                    <div>
                      <div class="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-100 p-1.5">
                        <img [src]="college.imageUrl" [alt]="college.name" class="h-full w-full object-contain" />
                      </div>
                      <h3 class="text-sm font-bold text-text-primary">{{ college.name }}</h3>
                      <p class="text-xs text-text-secondary">{{ college.conference }} · {{ college.location }}</p>
                    </div>
                    <span class="rounded-lg bg-primary/10 px-2 py-1 text-xs font-bold text-primary">#{{ college.ranking }}</span>
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
            @for (i of [1, 2, 3]; track i) { <div class="h-48 w-72 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"></div> }
          </div>
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="flex gap-4">
            @for (i of [1, 2, 3]; track i) { <div class="h-48 w-72 flex-shrink-0 animate-pulse rounded-2xl bg-surface-300"></div> }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 8: The Intel Desk
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-intel-desk">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-intel-desk" class="text-base font-bold tracking-tight text-text-primary md:text-lg">Intel Desk</h2>
              <p class="text-[11px] text-text-tertiary">Deep dives selected for you</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('news')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <ul class="divide-y divide-border-subtle px-4 md:px-6" role="list">
            @for (article of intelArticles(); track article.id) {
              <li>
                <article class="flex cursor-pointer items-center gap-4 py-3 transition-all hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99]" tabindex="0">
                  <div class="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-surface-200 md:h-20 md:w-20">
                    <img [src]="article.thumbnail" [alt]="article.title" class="h-full w-full object-cover" loading="lazy" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <span class="mb-1 inline-block rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{{ article.category }}</span>
                    <h3 class="mb-1 line-clamp-2 text-sm font-semibold leading-tight text-text-primary">{{ article.title }}</h3>
                    <div class="flex items-center gap-2 text-[10px] text-text-secondary">
                      <span>{{ article.timeAgo }}</span><span class="opacity-50">·</span><span>{{ article.readTime }}</span>
                    </div>
                  </div>
                  <svg class="h-4 w-4 flex-shrink-0 text-text-tertiary opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                </article>
              </li>
            }
          </ul>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) { <div class="mb-1 h-20 animate-pulse rounded-lg bg-surface-300"></div> }
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) { <div class="mb-1 h-20 animate-pulse rounded-lg bg-surface-300"></div> }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 9: The Proving Grounds (College-Hosted Camps)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-proving-grounds">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-proving-grounds" class="text-base font-bold tracking-tight text-text-primary md:text-lg">Proving Grounds</h2>
              <p class="text-[11px] text-text-tertiary">College camps matched to your profile</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('camps')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <div class="flex flex-col gap-3 px-4 md:px-6">
            @for (camp of collegeCamps(); track camp.id) {
              <article
                class="flex cursor-pointer items-center gap-4 rounded-2xl border border-border-subtle bg-surface-100 p-4 transition-all hover:border-border-primary hover:bg-surface-200 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99]"
                tabindex="0"
              >
                <div class="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <span class="text-[9px] font-bold uppercase leading-none tracking-wider">{{ camp.date | date: 'MMM' }}</span>
                  <span class="text-2xl font-black leading-tight">{{ camp.date | date: 'd' }}</span>
                </div>

                <div class="min-w-0 flex-1">
                  <div class="mb-0.5 flex items-center gap-2">
                    <img [src]="camp.collegeLogo" [alt]="camp.collegeName" class="h-5 w-5 object-contain" loading="lazy" />
                    <span class="text-[11px] font-semibold text-text-secondary">{{ camp.collegeName }}</span>
                  </div>
                  <h3 class="mb-1 text-sm font-bold text-text-primary">{{ camp.campName }}</h3>
                  <p class="text-[11px] text-text-tertiary">{{ camp.division }} · {{ camp.location }}</p>
                </div>

                <div class="flex flex-shrink-0 flex-col items-end gap-2">
                  <span class="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{{ camp.matchPercent }}% match</span>
                  <span class="text-[10px] text-text-tertiary">{{ camp.spotsLeft }} spots left</span>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-44 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) { <div class="mb-3 h-24 animate-pulse rounded-2xl bg-surface-300"></div> }
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-44 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3, 4]; track i) { <div class="mb-3 h-24 animate-pulse rounded-2xl bg-surface-300"></div> }
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 10: The Inner Circle
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport; prefetch on idle) {
        <section class="py-5" aria-labelledby="section-inner-circle">
          <header class="mb-3 flex items-center justify-between px-4 md:px-6">
            <div>
              <h2 id="section-inner-circle" class="text-base font-bold tracking-tight text-text-primary md:text-lg">Inner Circle</h2>
              <p class="text-[11px] text-text-tertiary">Activity from your network</p>
            </div>
            <button type="button" class="flex items-center gap-1 text-sm font-medium text-primary transition-opacity hover:opacity-70" (click)="categorySelect.emit('following')">
              See All
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </header>

          <div class="mb-4 px-4 md:px-6">
            <div class="flex items-center">
              <div class="flex items-center" role="list" aria-label="Active athletes you follow">
                @for (athlete of innerCircleAvatars(); track athlete.id; let i = $index) {
                  <div class="relative -ml-2 first:ml-0" [style.z-index]="innerCircleAvatars().length - i" role="listitem">
                    <img [src]="athlete.imageUrl" [alt]="athlete.name" class="h-10 w-10 rounded-full border-2 border-bg-primary object-cover ring-1 ring-border-subtle" [title]="athlete.name" loading="lazy" />
                  </div>
                }
                <div class="-ml-2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-bg-primary bg-surface-200 text-xs font-bold text-text-secondary">+24</div>
              </div>
              <p class="ml-4 text-sm text-text-secondary">
                <span class="font-semibold text-text-primary">47 athletes</span> in your network are active
              </p>
            </div>
          </div>

          <div class="flex flex-col gap-2 px-4 md:px-6">
            @for (athlete of innerCircleAvatars().slice(0, 3); track athlete.id) {
              <div class="flex items-center gap-3 rounded-xl border border-border-subtle bg-surface-100 px-4 py-3">
                <img [src]="athlete.imageUrl" [alt]="athlete.name" class="h-8 w-8 flex-shrink-0 rounded-full object-cover" loading="lazy" />
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
          @for (i of [1, 2, 3]; track i) { <div class="mb-2 h-12 animate-pulse rounded-xl bg-surface-300"></div> }
        </div>
      } @loading (minimum 300ms) {
        <div class="px-4 py-5 md:px-6">
          <div class="mb-3 h-6 w-36 animate-pulse rounded-lg bg-surface-300"></div>
          <div class="mb-4 h-12 animate-pulse rounded-lg bg-surface-300"></div>
          @for (i of [1, 2, 3]; track i) { <div class="mb-2 h-12 animate-pulse rounded-xl bg-surface-300"></div> }
        </div>
      }

    </section>
  `,
  styles: [
    `
      :host { display: block; }

      .agent-pulse {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--nxt1-color-primary);
        animation: agent-pulse 1.8s ease-in-out infinite;
      }
      @keyframes agent-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.4; transform: scale(0.8); }
      }

      .agent-cursor {
        display: inline-block;
        width: 2px;
        height: 14px;
        background: var(--nxt1-color-primary);
        margin-left: 2px;
        vertical-align: text-bottom;
        animation: blink 1s step-end infinite;
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0; }
      }

      [style*="scrollbar-width: none"]::-webkit-scrollbar { display: none; }

      @media (prefers-reduced-motion: reduce) {
        *, .agent-pulse, .agent-cursor {
          transition: none !important;
          animation: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExploreForYouWebComponent {
  readonly user = input<ExploreUser | null>(null);
  readonly itemTap = output<ExploreItem>();
  readonly categorySelect = output<ExploreTabId>();

  readonly topAthletes = signal(MOCK_ATHLETES.slice(0, 5));
  readonly trendingMovers = signal(MOCK_ATHLETES);
  readonly featuredVideo = signal(MOCK_VIDEOS[0]);
  readonly videoList = signal(MOCK_VIDEOS);
  readonly allColleges = signal(MOCK_COLLEGES);
  readonly bentoColleges = signal(MOCK_COLLEGES.slice(0, 4));
  readonly feedPosts = signal(MOCK_FEED_POSTS.slice(0, 6));
  readonly campusColleges = signal(MOCK_COLLEGES.slice(0, 3));
  readonly intelArticles = signal(MOCK_INTEL);
  readonly collegeCamps = signal(MOCK_COLLEGE_CAMPS);
  readonly innerCircleAvatars = signal(MOCK_ATHLETES.slice(0, 5));

  today(): string {
    return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

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

  getHeroImage(index: number): string {
    return STOCK_HERO_IMAGES[index % STOCK_HERO_IMAGES.length];
  }
}
