/**
 * @fileoverview Explore Videos Web Component — 7-Section Film Room Dashboard
 * @module @nxt1/ui/explore/web
 * @version 1.0.0
 *
 * Elite "Videos" dashboard for the /explore route.
 * 100% SSR-safe, zero Ionic, design-token driven.
 *
 * Sections:
 *  1. Jumbotron Hero         — Top trending tape, auto-play on viewport
 *  2. Highlight Reel         — TikTok-style 9:16 snap-scroll carousel
 *  3. The Combine            — Bento grid of verified drill footage
 *  4. Agent X Film Study     — AI-annotated tape (monospace scouting report)
 *  5. Game Day               — Long-form full-game / quarter cuts
 *  6. Positional Masterclass — Position-chip filter + masonry grid
 *  7. Your Watchlist         — Saved tape with watch-progress bars
 *
 * ⭐ WEB ONLY — Pure HTML/Tailwind CSS, Zero Ionic, SSR-optimized ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MOCK_HERO_VIDEO,
  MOCK_HIGHLIGHT_VIDEOS,
  MOCK_DRILL_VIDEOS,
  MOCK_AGENT_X_VIDEOS,
  MOCK_GAME_VIDEOS,
  MOCK_POSITIONAL_VIDEOS,
  MOCK_WATCHLIST_VIDEOS,
  POSITIONS,
  type VideoItem,
  type DrillVideoItem,
  type AgentXVideoItem,
  type WatchlistVideoItem,
  type PositionFilter,
} from '../videos.mock-data';

@Component({
  selector: 'nxt1-explore-videos-web',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="videos-dashboard bg-bg-primary min-h-screen">

      <!-- ═══════════════════════════════════════════════════════
           SECTION 1: JUMBOTRON HERO — No @defer (LCP critical)
           ═══════════════════════════════════════════════════════ -->
      <section
        class="hero-section relative w-full overflow-hidden"
        aria-labelledby="hero-heading"
        style="aspect-ratio: 16/7; min-height: 340px;"
      >
        <!-- Background thumbnail (video would autoplay here) -->
        <img
          [src]="hero.thumbnailUrl"
          [alt]="hero.title"
          class="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          fetchpriority="high"
        />

        <!-- Gradient overlay -->
        <div
          class="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/60 to-transparent"
          aria-hidden="true"
        ></div>

        <!-- Hero content -->
        <div class="absolute inset-x-0 bottom-0 p-6 md:p-10">
          <div class="flex items-end gap-4">
            <!-- Athlete avatar -->
            <img
              [src]="hero.athlete.avatarUrl"
              [alt]="hero.athlete.name"
              class="h-14 w-14 rounded-full border-2 border-primary object-cover flex-shrink-0"
            />

            <div class="flex-1 min-w-0">
              <!-- Badge -->
              <span
                class="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-bg-primary uppercase tracking-wider"
              >
                <span aria-hidden="true">🔥</span> Trending #1
              </span>

              <h1
                id="hero-heading"
                class="text-text-inverse text-xl font-bold leading-tight md:text-3xl truncate"
              >
                {{ hero.title }}
              </h1>
              <p class="text-text-inverse/70 mt-1 text-sm">
                {{ hero.athlete.name }} · {{ hero.athlete.position }} ·
                {{ hero.athlete.school }}
              </p>
            </div>

            <!-- CTA -->
            <a
              href="#"
              role="button"
              class="btn-primary ml-auto flex-shrink-0 hidden sm:inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-bg-primary transition-opacity hover:opacity-90"
              aria-label="Watch full tape: {{ hero.title }}"
            >
              <!-- Play icon -->
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
              Watch Full Tape
            </a>
          </div>
        </div>
      </section>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 2: HIGHLIGHT REEL — Trending Tape (9:16 TikTok carousel)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-8" aria-labelledby="highlights-heading">
          <div class="flex items-center justify-between px-4 md:px-6 mb-4">
            <h2 id="highlights-heading" class="text-text-primary text-lg font-bold">
              🎬 Highlight Reel
            </h2>
            <span class="text-text-tertiary text-xs">This Week's Best</span>
          </div>

          <div
            class="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-4 md:px-6 pb-3"
            style="scrollbar-width: thin;"
            role="list"
            aria-label="Trending highlight tapes"
          >
            @for (video of highlights; track video.id) {
              <article
                class="bg-surface-200 border border-border-subtle rounded-2xl overflow-hidden flex-shrink-0 cursor-pointer snap-start transition-transform hover:-translate-y-1 active:scale-95"
                style="width: 160px;"
                role="listitem"
                [attr.aria-label]="video.title"
              >
                <!-- 9:16 thumbnail -->
                <div
                  class="relative overflow-hidden bg-surface-300"
                  style="aspect-ratio: 9/16;"
                >
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <!-- Momentum fire badge -->
                  @if ((video.momentum ?? 0) >= 80) {
                    <span
                      class="absolute top-2 right-2 text-primary text-lg"
                      aria-label="High momentum"
                      title="Trending"
                    >🔥</span>
                  }
                  <!-- Play overlay -->
                  <div
                    class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  >
                    <svg class="h-10 w-10 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>

                <!-- Card info -->
                <div class="p-2.5">
                  <p class="text-text-primary text-xs font-semibold leading-tight line-clamp-2">
                    {{ video.title }}
                  </p>
                  <p class="text-text-secondary mt-1 text-xs flex items-center gap-1">
                    <svg
                      class="h-3 w-3 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                      />
                    </svg>
                    {{ formatViewCount(video.viewCount) }}
                  </p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-40 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of skeletonArray(4); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl flex-shrink-0"
                style="width: 160px; aspect-ratio: 9/16;"
              ></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-40 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of skeletonArray(4); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl flex-shrink-0"
                style="width: 160px; aspect-ratio: 9/16;"
              ></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 3: THE COMBINE — Verified Drill Footage (bento grid)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-8" aria-labelledby="combine-heading">
          <div class="flex items-center justify-between px-4 md:px-6 mb-4">
            <h2 id="combine-heading" class="text-text-primary text-lg font-bold">
              ⚡ The Combine
            </h2>
            <span class="text-text-tertiary text-xs">Verified Drill Footage</span>
          </div>

          <div
            class="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 md:px-6"
            role="list"
            aria-label="Verified drill footage"
          >
            @for (drill of drills; track drill.id) {
              <article
                class="bg-surface-100 border border-border-subtle rounded-2xl overflow-hidden cursor-pointer transition-transform hover:-translate-y-1 active:scale-95"
                role="listitem"
                [attr.aria-label]="drill.drillType + ': ' + drill.metric"
              >
                <!-- Square thumbnail with metric overlay -->
                <div class="relative overflow-hidden" style="aspect-ratio: 1/1;">
                  <img
                    [src]="drill.thumbnailUrl"
                    [alt]="drill.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <!-- Metric overlay -->
                  <div
                    class="absolute inset-0 flex items-center justify-center bg-surface-300/70 backdrop-blur-sm"
                    aria-hidden="true"
                  >
                    <span class="text-primary font-bold text-2xl md:text-3xl drop-shadow-lg">
                      {{ drill.metric }}
                    </span>
                  </div>
                  <!-- Verified badge -->
                  <span
                    class="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-surface-300/80 backdrop-blur-sm px-2 py-0.5 text-xs font-semibold text-primary"
                  >
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path
                        d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"
                      />
                    </svg>
                    Verified
                  </span>
                </div>

                <!-- Drill info -->
                <div class="p-3">
                  <p class="text-text-primary text-xs font-bold truncate">
                    {{ drill.drillType }}
                  </p>
                  <p class="text-text-secondary text-xs mt-0.5 truncate">
                    {{ drill.athlete.name }}
                  </p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-44 animate-pulse rounded bg-surface-300"></div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            @for (i of skeletonArray(4); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl"
                style="aspect-ratio: 1/1;"
              ></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-44 animate-pulse rounded bg-surface-300"></div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            @for (i of skeletonArray(4); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl"
                style="aspect-ratio: 1/1;"
              ></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 4: AGENT X FILM STUDY — AI Breakdowns
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-8" aria-labelledby="agentx-heading">
          <div class="flex items-center justify-between px-4 md:px-6 mb-4">
            <h2 id="agentx-heading" class="text-text-primary text-lg font-bold">
              🤖 Agent X Film Study
            </h2>
            <span class="text-text-tertiary text-xs">AI Scouting Reports</span>
          </div>

          <div class="flex flex-col gap-4 px-4 md:px-6" role="list" aria-label="Agent X AI film breakdowns">
            @for (video of agentXVideos; track video.id) {
              <article
                class="bg-surface-100 border border-border-subtle rounded-2xl overflow-hidden flex gap-0 cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-[0.99]"
                role="listitem"
                [attr.aria-label]="'Agent X analysis: ' + video.title"
              >
                <!-- Left: Thumbnail -->
                <div
                  class="relative flex-shrink-0 overflow-hidden"
                  style="width: 140px; aspect-ratio: 4/3;"
                >
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div
                    class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  >
                    <svg
                      class="h-8 w-8 text-white/90"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>

                <!-- Right: Agent X output block -->
                <div class="flex-1 min-w-0 p-3 border-l-4 border-primary">
                  <!-- Header row -->
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="min-w-0">
                      <p class="text-text-primary text-xs font-bold leading-tight line-clamp-2">
                        {{ video.title }}
                      </p>
                      <p class="text-text-tertiary text-xs mt-0.5">
                        {{ video.athlete.name }} · {{ video.duration }}
                      </p>
                    </div>
                    <span
                      class="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary border border-primary/20"
                    >
                      <svg
                        class="h-3 w-3"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"
                        />
                      </svg>
                      Agent X
                    </span>
                  </div>

                  <!-- AI insights — monospace scouting report -->
                  <ul
                    class="font-mono text-xs text-text-secondary space-y-1"
                    aria-label="AI-generated insights"
                  >
                    @for (insight of video.agentInsights; track insight) {
                      <li class="flex items-start gap-1.5 leading-tight">
                        <span class="text-primary font-bold flex-shrink-0">&gt;</span>
                        <span>{{ insight }}</span>
                      </li>
                    }
                  </ul>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-48 animate-pulse rounded bg-surface-300"></div>
          <div class="flex flex-col gap-4">
            @for (i of skeletonArray(3); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl h-28"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-48 animate-pulse rounded bg-surface-300"></div>
          <div class="flex flex-col gap-4">
            @for (i of skeletonArray(3); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl h-28"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 5: GAME DAY — Full Game & Quarter Cuts (16:9 carousel)
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-8" aria-labelledby="gameday-heading">
          <div class="flex items-center justify-between px-4 md:px-6 mb-4">
            <h2 id="gameday-heading" class="text-text-primary text-lg font-bold">
              🏟️ Game Day
            </h2>
            <span class="text-text-tertiary text-xs">Full Games & Quarter Cuts</span>
          </div>

          <div
            class="flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory px-4 md:px-6 pb-3"
            style="scrollbar-width: thin;"
            role="list"
            aria-label="Full game and quarter cut footage"
          >
            @for (video of gameVideos; track video.id) {
              <article
                class="bg-surface-200 border border-border-subtle rounded-2xl overflow-hidden flex-shrink-0 cursor-pointer snap-start transition-transform hover:-translate-y-1 active:scale-95"
                style="width: 280px;"
                role="listitem"
                [attr.aria-label]="video.title"
              >
                <!-- 16:9 thumbnail with duration badge -->
                <div class="relative overflow-hidden" style="aspect-ratio: 16/9;">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover transition-transform hover:scale-105 duration-300"
                    loading="lazy"
                  />
                  <!-- Duration badge -->
                  <span
                    class="absolute bottom-2 right-2 rounded-md bg-surface-300/90 px-1.5 py-0.5 text-xs font-medium text-text-primary"
                  >
                    {{ video.duration }}
                  </span>
                  <!-- Play overlay -->
                  <div
                    class="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity"
                    aria-hidden="true"
                  >
                    <svg class="h-12 w-12 text-white/90" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>

                <!-- Card info -->
                <div class="p-3">
                  <p class="text-text-primary text-sm font-semibold leading-tight line-clamp-2">
                    {{ video.title }}
                  </p>
                  <p class="text-text-secondary text-xs mt-1 flex items-center gap-1.5">
                    <svg
                      class="h-3 w-3 flex-shrink-0"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                      />
                    </svg>
                    {{ formatViewCount(video.viewCount) }}
                  </p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-36 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-4">
            @for (i of skeletonArray(3); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl flex-shrink-0"
                style="width: 280px; aspect-ratio: 16/9;"
              ></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-36 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-4">
            @for (i of skeletonArray(3); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl flex-shrink-0"
                style="width: 280px; aspect-ratio: 16/9;"
              ></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 6: POSITIONAL MASTERCLASS — Position filter + masonry
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-8" aria-labelledby="positional-heading">
          <div class="flex items-center justify-between px-4 md:px-6 mb-4">
            <h2 id="positional-heading" class="text-text-primary text-lg font-bold">
              🎯 Positional Masterclass
            </h2>
          </div>

          <!-- Sticky position filter chips -->
          <div
            class="sticky top-0 z-10 bg-bg-primary/95 backdrop-blur-sm border-b border-border-subtle px-4 md:px-6 py-3"
          >
            <div
              class="flex gap-2 overflow-x-auto pb-0.5"
              style="scrollbar-width: none;"
              role="tablist"
              aria-label="Filter videos by position"
            >
              @for (pos of positions; track pos) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="activePosition() === pos"
                  [attr.aria-controls]="'positional-grid'"
                  (click)="setPosition(pos)"
                  class="flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap"
                  [class]="activePosition() === pos
                    ? 'bg-primary text-bg-primary'
                    : 'bg-surface-200 text-text-secondary hover:bg-primary hover:text-bg-primary'"
                >
                  {{ pos }}
                </button>
              }
            </div>
          </div>

          <!-- Masonry video grid -->
          <div
            id="positional-grid"
            class="columns-2 md:columns-3 lg:columns-4 gap-3 px-4 md:px-6 mt-4 space-y-3"
            role="tabpanel"
            [attr.aria-label]="'Videos for ' + activePosition()"
          >
            @for (video of filteredPositionalVideos(); track video.id) {
              <article
                class="bg-surface-100 border border-border-subtle rounded-2xl overflow-hidden cursor-pointer break-inside-avoid transition-transform hover:-translate-y-1 active:scale-95 mb-3"
                [attr.aria-label]="video.title"
              >
                <div class="relative overflow-hidden" style="aspect-ratio: 4/3;">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <!-- Position chip -->
                  <span
                    class="absolute bottom-2 left-2 rounded-full bg-surface-300/80 backdrop-blur-sm px-2 py-0.5 text-xs font-semibold text-text-primary"
                  >
                    {{ video.position }}
                  </span>
                </div>
                <div class="p-2.5">
                  <p class="text-text-primary text-xs font-semibold line-clamp-2 leading-tight">
                    {{ video.title }}
                  </p>
                  <p class="text-text-tertiary text-xs mt-0.5">
                    {{ video.athlete.name }}
                  </p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-52 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-2 mb-4">
            @for (i of skeletonArray(5); track i) {
              <div class="bg-surface-300 animate-pulse rounded-full h-8 w-20"></div>
            }
          </div>
          <div class="columns-2 md:columns-3 gap-3">
            @for (i of skeletonArray(6); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl mb-3 break-inside-avoid" style="aspect-ratio: 4/3;"></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="py-8 px-4 md:px-6">
          <div class="mb-4 h-6 w-52 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-2 mb-4">
            @for (i of skeletonArray(5); track i) {
              <div class="bg-surface-300 animate-pulse rounded-full h-8 w-20"></div>
            }
          </div>
          <div class="columns-2 md:columns-3 gap-3">
            @for (i of skeletonArray(6); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl mb-3 break-inside-avoid" style="aspect-ratio: 4/3;"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 7: YOUR WATCHLIST — Saved Tape with progress bars
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-8 pb-16" aria-labelledby="watchlist-heading">
          <div class="flex items-center justify-between px-4 md:px-6 mb-4">
            <h2 id="watchlist-heading" class="text-text-primary text-lg font-bold">
              📋 Your Watchlist
            </h2>
            <span class="text-text-tertiary text-xs">{{ watchlist.length }} saved</span>
          </div>

          <div
            class="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 md:px-6"
            role="list"
            aria-label="Saved tape watchlist"
          >
            @for (video of watchlist; track video.id) {
              <article
                class="bg-surface-200 border border-border-subtle rounded-2xl overflow-hidden cursor-pointer transition-transform hover:-translate-y-1 active:scale-95"
                role="listitem"
                [attr.aria-label]="video.title + (video.watchProgress != null ? ', ' + video.watchProgress + '% watched' : '')"
              >
                <!-- Thumbnail with progress bar -->
                <div class="relative overflow-hidden" style="aspect-ratio: 16/9;">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <!-- Duration badge -->
                  <span
                    class="absolute bottom-5 right-2 rounded-md bg-surface-300/90 px-1.5 py-0.5 text-xs font-medium text-text-primary"
                  >
                    {{ video.duration }}
                  </span>
                  <!-- Watch progress bar -->
                  @if (video.watchProgress != null) {
                    <div
                      class="absolute inset-x-0 bottom-0 h-1 bg-surface-300"
                      role="progressbar"
                      [attr.aria-valuenow]="video.watchProgress"
                      aria-valuemin="0"
                      aria-valuemax="100"
                      [attr.aria-label]="video.watchProgress + '% watched'"
                    >
                      <div
                        class="h-full bg-primary transition-all"
                        [style.width.%]="video.watchProgress"
                      ></div>
                    </div>
                  }
                </div>

                <!-- Card info -->
                <div class="p-2.5">
                  <p class="text-text-primary text-xs font-semibold line-clamp-2 leading-tight">
                    {{ video.title }}
                  </p>
                  <p class="text-text-tertiary text-xs mt-0.5">
                    {{ video.athlete.name }}
                    @if (video.watchProgress === 100) {
                      · <span class="text-primary font-semibold">Watched</span>
                    }
                  </p>
                </div>
              </article>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-8 pb-16 px-4 md:px-6">
          <div class="mb-4 h-6 w-36 animate-pulse rounded bg-surface-300"></div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            @for (i of skeletonArray(6); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl"
                style="aspect-ratio: 16/9;"
              ></div>
            }
          </div>
        </div>
      } @loading (minimum 200ms) {
        <div class="py-8 pb-16 px-4 md:px-6">
          <div class="mb-4 h-6 w-36 animate-pulse rounded bg-surface-300"></div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            @for (i of skeletonArray(6); track i) {
              <div
                class="bg-surface-300 animate-pulse rounded-2xl"
                style="aspect-ratio: 16/9;"
              ></div>
            }
          </div>
        </div>
      }

    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* Hide scrollbar (cross-browser) */
      .overflow-x-auto::-webkit-scrollbar {
        height: 3px;
      }
      .overflow-x-auto::-webkit-scrollbar-track {
        background: transparent;
      }
      .overflow-x-auto::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-border, rgba(255, 255, 255, 0.08));
        border-radius: 9999px;
      }

      /* Columns layout fix (CSS columns + Tailwind gap) */
      .columns-2, .columns-3, .columns-4 {
        column-gap: 0.75rem;
      }

      /* Reduced motion */
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
export class ExploreVideosWebComponent {
  // ── Static data (would come from a service in production) ──────────────────
  protected readonly hero = MOCK_HERO_VIDEO;
  protected readonly highlights = MOCK_HIGHLIGHT_VIDEOS;
  protected readonly drills = MOCK_DRILL_VIDEOS;
  protected readonly agentXVideos = MOCK_AGENT_X_VIDEOS;
  protected readonly gameVideos = MOCK_GAME_VIDEOS;
  protected readonly watchlist = MOCK_WATCHLIST_VIDEOS;
  protected readonly positions = POSITIONS;

  // ── Signals ────────────────────────────────────────────────────────────────
  protected readonly activePosition = signal<PositionFilter>('All');

  // ── Computed ───────────────────────────────────────────────────────────────
  protected readonly filteredPositionalVideos = computed<readonly VideoItem[]>(() => {
    const pos = this.activePosition();
    if (pos === 'All') return MOCK_POSITIONAL_VIDEOS;
    const posLower = pos.toLowerCase();
    return MOCK_POSITIONAL_VIDEOS.filter((v) => {
      const pLower = v.position.toLowerCase();
      // Normalize both sides: strip trailing 's' for plural matching
      // e.g. "Quarterbacks" → "quarterback", "Quarterback" → "quarterback"
      return posLower.replace(/s$/, '') === pLower.replace(/s$/, '');
    });
  });

  // ── Methods ────────────────────────────────────────────────────────────────

  protected setPosition(pos: PositionFilter): void {
    this.activePosition.set(pos);
  }

  /** Format view count: 1234567 → "1.2M", 89200 → "89.2K" */
  protected formatViewCount(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
    return `${count} views`;
  }

  /** Utility for skeleton repeat — returns number[] of given length */
  protected skeletonArray(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }
}
