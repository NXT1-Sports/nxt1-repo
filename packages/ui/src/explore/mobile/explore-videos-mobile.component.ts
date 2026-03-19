/**
 * @fileoverview Explore Videos Mobile Component — 7-Section Film Room Dashboard
 * @module @nxt1/ui/explore/mobile
 * @version 1.0.0
 *
 * Elite "Videos" dashboard for the /explore route — Mobile/Ionic implementation.
 * Uses Ionic components for native feel, HapticsService for tactile interactions.
 * Design tokens are inherited through --ion-* variable mapping.
 *
 * Sections:
 *  1. Jumbotron Hero         — Top trending tape
 *  2. Highlight Reel         — TikTok-style 9:16 snap-scroll carousel
 *  3. The Combine            — Bento grid of verified drill footage
 *  4. Agent X Film Study     — AI-annotated tape (monospace scouting report)
 *  5. Game Day               — Long-form full-game / quarter cuts
 *  6. Positional Masterclass — Position-chip filter + masonry grid
 *  7. Your Watchlist         — Saved tape with watch-progress bars
 *
 * ⭐ MOBILE ONLY — Uses Ionic components + HapticsService ⭐
 */

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonItem,
  IonLabel,
  IonList,
  IonBadge,
  IonButton,
  IonChip,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { playCircle, flame, checkmarkCircle, bookmarkOutline } from 'ionicons/icons';
import { HapticsService } from '../../services/haptics/haptics.service';
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
  type PositionFilter,
} from '../videos.mock-data';

@Component({
  selector: 'nxt1-explore-videos-mobile',
  standalone: true,
  imports: [
    CommonModule,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonItem,
    IonLabel,
    IonList,
    IonBadge,
    IonButton,
    IonChip,
    IonIcon,
  ],
  template: `
    <div class="videos-mobile bg-bg-primary min-h-screen">

      <!-- ═══════════════════════════════════════════════════════
           SECTION 1: JUMBOTRON HERO — No @defer (LCP critical)
           ═══════════════════════════════════════════════════════ -->
      <section class="hero-section relative overflow-hidden" style="aspect-ratio: 16/7; min-height: 280px;">
        <img
          [src]="hero.thumbnailUrl"
          [alt]="hero.title"
          class="absolute inset-0 h-full w-full object-cover"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-bg-primary via-bg-primary/60 to-transparent" aria-hidden="true"></div>

        <div class="absolute inset-x-0 bottom-0 p-4">
          <div class="flex items-end gap-3">
            <img
              [src]="hero.athlete.avatarUrl"
              [alt]="hero.athlete.name"
              class="h-12 w-12 rounded-full border-2 border-primary object-cover flex-shrink-0"
            />
            <div class="flex-1 min-w-0">
              <span class="mb-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-bg-primary uppercase tracking-wider">
                🔥 Trending #1
              </span>
              <h1 class="text-text-inverse text-base font-bold leading-tight truncate">{{ hero.title }}</h1>
              <p class="text-text-inverse/70 text-xs mt-0.5">
                {{ hero.athlete.name }} · {{ hero.athlete.school }}
              </p>
            </div>
          </div>
          <ion-button
            expand="block"
            fill="solid"
            class="mt-3 watch-btn"
            (click)="onWatchTap(hero)"
          >
            <ion-icon name="play-circle" slot="start"></ion-icon>
            Watch Full Tape
          </ion-button>
        </div>
      </section>

      <!-- ═══════════════════════════════════════════════════════
           SECTION 2: HIGHLIGHT REEL — 9:16 TikTok-style carousel
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-6" aria-labelledby="highlights-heading-mobile">
          <div class="flex items-center justify-between px-4 mb-3">
            <h2 id="highlights-heading-mobile" class="text-text-primary text-base font-bold">🎬 Highlight Reel</h2>
            <span class="text-text-tertiary text-xs">This Week</span>
          </div>

          <div
            class="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-2"
            style="scrollbar-width: none;"
            (scroll)="onHighlightScroll()"
          >
            @for (video of highlights; track video.id) {
              <ion-card
                class="flex-shrink-0 snap-start m-0 cursor-pointer"
                style="width: 140px; border-radius: 16px;"
                (click)="onVideoTap(video)"
              >
                <div class="relative overflow-hidden" style="aspect-ratio: 9/16;">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  @if ((video.momentum ?? 0) >= 80) {
                    <span class="absolute top-2 right-2 text-primary text-base">🔥</span>
                  }
                  <div class="absolute inset-0 flex items-center justify-center bg-black/15" aria-hidden="true">
                    <ion-icon name="play-circle" class="text-5xl text-white/80"></ion-icon>
                  </div>
                </div>
                <ion-card-content class="px-2 py-2">
                  <p class="text-text-primary text-xs font-semibold line-clamp-2 leading-tight">{{ video.title }}</p>
                  <p class="text-text-secondary text-xs mt-0.5">{{ formatViewCount(video.viewCount) }}</p>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-6 px-4">
          <div class="mb-3 h-5 w-36 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of skeletonArray(4); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl flex-shrink-0" style="width: 140px; aspect-ratio: 9/16;"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 3: THE COMBINE — Verified Drill Footage
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-6" aria-labelledby="combine-heading-mobile">
          <div class="flex items-center justify-between px-4 mb-3">
            <h2 id="combine-heading-mobile" class="text-text-primary text-base font-bold">⚡ The Combine</h2>
            <span class="text-text-tertiary text-xs">Verified</span>
          </div>

          <div class="grid grid-cols-2 gap-3 px-4">
            @for (drill of drills; track drill.id) {
              <ion-card
                class="m-0 cursor-pointer"
                style="border-radius: 16px;"
                (click)="onVideoTap(drill)"
              >
                <div class="relative overflow-hidden" style="aspect-ratio: 1/1;">
                  <img
                    [src]="drill.thumbnailUrl"
                    [alt]="drill.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <div class="absolute inset-0 flex items-center justify-center bg-surface-300/70 backdrop-blur-sm">
                    <span class="text-primary font-bold text-2xl drop-shadow-lg">{{ drill.metric }}</span>
                  </div>
                  <ion-badge
                    color="success"
                    class="absolute top-2 left-2 text-xs"
                    style="font-size: 10px;"
                  >
                    <ion-icon name="checkmark-circle" class="text-xs mr-0.5"></ion-icon>
                    Verified
                  </ion-badge>
                </div>
                <ion-card-content class="px-2 py-2">
                  <p class="text-text-primary text-xs font-bold truncate">{{ drill.drillType }}</p>
                  <p class="text-text-secondary text-xs mt-0.5 truncate">{{ drill.athlete.name }}</p>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-6 px-4">
          <div class="mb-3 h-5 w-40 animate-pulse rounded bg-surface-300"></div>
          <div class="grid grid-cols-2 gap-3">
            @for (i of skeletonArray(4); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl" style="aspect-ratio: 1/1;"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 4: AGENT X FILM STUDY — AI Breakdowns
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-6" aria-labelledby="agentx-heading-mobile">
          <div class="flex items-center justify-between px-4 mb-3">
            <h2 id="agentx-heading-mobile" class="text-text-primary text-base font-bold">🤖 Agent X Film Study</h2>
          </div>

          <ion-list lines="none" class="px-4 space-y-3 bg-transparent">
            @for (video of agentXVideos; track video.id) {
              <ion-item
                class="rounded-2xl overflow-hidden border border-border-subtle mb-3 cursor-pointer"
                style="--background: var(--nxt1-color-surface-100); --border-radius: 16px; --padding-start: 0; --inner-padding-end: 0;"
                (click)="onVideoTap(video)"
              >
                <div class="flex w-full">
                  <!-- Left: Thumbnail -->
                  <div class="relative flex-shrink-0 overflow-hidden" style="width: 120px; aspect-ratio: 4/3;">
                    <img
                      [src]="video.thumbnailUrl"
                      [alt]="video.title"
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div class="absolute inset-0 flex items-center justify-center" aria-hidden="true">
                      <ion-icon name="play-circle" class="text-4xl text-white/80"></ion-icon>
                    </div>
                  </div>

                  <!-- Right: Agent X output — border-l-4 border-primary -->
                  <div class="flex-1 min-w-0 p-3 border-l-4 border-primary">
                    <div class="flex items-start justify-between gap-1 mb-2">
                      <div class="min-w-0">
                        <p class="text-text-primary text-xs font-bold line-clamp-2 leading-tight">{{ video.title }}</p>
                        <p class="text-text-tertiary text-xs mt-0.5">{{ video.athlete.name }} · {{ video.duration }}</p>
                      </div>
                      <ion-badge class="flex-shrink-0" style="--background: rgba(204,255,0,0.15); --color: var(--nxt1-color-primary); font-size: 9px;">
                        Agent X
                      </ion-badge>
                    </div>

                    <!-- Monospace AI insights -->
                    <ul class="font-mono text-xs text-text-secondary space-y-1" aria-label="AI insights">
                      @for (insight of video.agentInsights.slice(0, 3); track insight) {
                        <li class="flex items-start gap-1 leading-tight">
                          <span class="text-primary font-bold flex-shrink-0">&gt;</span>
                          <span>{{ insight }}</span>
                        </li>
                      }
                    </ul>
                  </div>
                </div>
              </ion-item>
            }
          </ion-list>
        </section>
      } @placeholder {
        <div class="py-6 px-4">
          <div class="mb-3 h-5 w-44 animate-pulse rounded bg-surface-300"></div>
          <div class="space-y-3">
            @for (i of skeletonArray(3); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl h-24"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 5: GAME DAY — Full Game & Quarter Cuts
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-6" aria-labelledby="gameday-heading-mobile">
          <div class="flex items-center justify-between px-4 mb-3">
            <h2 id="gameday-heading-mobile" class="text-text-primary text-base font-bold">🏟️ Game Day</h2>
            <span class="text-text-tertiary text-xs">Full Games</span>
          </div>

          <div
            class="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-2"
            style="scrollbar-width: none;"
            (scroll)="onGameScroll()"
          >
            @for (video of gameVideos; track video.id) {
              <ion-card
                class="flex-shrink-0 snap-start m-0 cursor-pointer"
                style="width: 240px; border-radius: 16px;"
                (click)="onVideoTap(video)"
              >
                <div class="relative overflow-hidden" style="aspect-ratio: 16/9;">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span
                    class="absolute bottom-2 right-2 rounded-md bg-surface-300/90 px-1.5 py-0.5 text-xs font-medium text-text-primary"
                  >
                    {{ video.duration }}
                  </span>
                  <div class="absolute inset-0 flex items-center justify-center bg-black/10" aria-hidden="true">
                    <ion-icon name="play-circle" class="text-5xl text-white/80"></ion-icon>
                  </div>
                </div>
                <ion-card-content class="px-3 py-2.5">
                  <p class="text-text-primary text-sm font-semibold line-clamp-2 leading-tight">{{ video.title }}</p>
                  <p class="text-text-secondary text-xs mt-1">{{ formatViewCount(video.viewCount) }}</p>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-6 px-4">
          <div class="mb-3 h-5 w-32 animate-pulse rounded bg-surface-300"></div>
          <div class="flex gap-3">
            @for (i of skeletonArray(3); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl flex-shrink-0" style="width: 240px; aspect-ratio: 16/9;"></div>
            }
          </div>
        </div>
      }

      <!-- ═══════════════════════════════════════════════════════
           SECTION 6: POSITIONAL MASTERCLASS — Chips + Masonry
           ═══════════════════════════════════════════════════════ -->
      @defer (on viewport) {
        <section class="py-6" aria-labelledby="positional-heading-mobile">
          <div class="flex items-center justify-between px-4 mb-3">
            <h2 id="positional-heading-mobile" class="text-text-primary text-base font-bold">🎯 Positional Masterclass</h2>
          </div>

          <!-- Sticky position filter chips -->
          <div class="sticky top-0 z-10 bg-bg-primary/95 backdrop-blur-sm border-b border-border-subtle px-4 py-2.5">
            <div class="flex gap-2 overflow-x-auto pb-0.5" style="scrollbar-width: none;">
              @for (pos of positions; track pos) {
                <ion-chip
                  [class]="activePosition() === pos ? 'ion-chip--active' : ''"
                  [style]="activePosition() === pos
                    ? '--background: var(--nxt1-color-primary); --color: var(--nxt1-color-bg-primary);'
                    : '--background: var(--nxt1-color-surface-200); --color: var(--nxt1-color-text-secondary);'"
                  class="flex-shrink-0 text-xs font-semibold"
                  (click)="onPositionChipTap(pos)"
                >
                  {{ pos }}
                </ion-chip>
              }
            </div>
          </div>

          <!-- Masonry grid -->
          <div class="columns-2 gap-3 px-4 mt-4 space-y-3">
            @for (video of filteredPositionalVideos(); track video.id) {
              <ion-card
                class="m-0 cursor-pointer break-inside-avoid mb-3"
                style="border-radius: 16px;"
                (click)="onVideoTap(video)"
              >
                <div class="relative overflow-hidden" style="aspect-ratio: 4/3;">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span
                    class="absolute bottom-2 left-2 rounded-full bg-surface-300/80 backdrop-blur-sm px-2 py-0.5 text-xs font-semibold text-text-primary"
                  >
                    {{ video.position }}
                  </span>
                </div>
                <ion-card-content class="px-2 py-2">
                  <p class="text-text-primary text-xs font-semibold line-clamp-2 leading-tight">{{ video.title }}</p>
                  <p class="text-text-tertiary text-xs mt-0.5">{{ video.athlete.name }}</p>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-6 px-4">
          <div class="mb-3 h-5 w-48 animate-pulse rounded bg-surface-300"></div>
          <div class="columns-2 gap-3">
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
        <section class="py-6 pb-20" aria-labelledby="watchlist-heading-mobile">
          <div class="flex items-center justify-between px-4 mb-3">
            <h2 id="watchlist-heading-mobile" class="text-text-primary text-base font-bold">📋 Your Watchlist</h2>
            <span class="text-text-tertiary text-xs">{{ watchlist.length }} saved</span>
          </div>

          <div class="grid grid-cols-2 gap-3 px-4">
            @for (video of watchlist; track video.id) {
              <ion-card
                class="m-0 cursor-pointer"
                style="border-radius: 16px;"
                (click)="onWatchlistTap(video)"
              >
                <div class="relative overflow-hidden" style="aspect-ratio: 16/9;">
                  <img
                    [src]="video.thumbnailUrl"
                    [alt]="video.title"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  <span
                    class="absolute bottom-5 right-1.5 rounded-md bg-surface-300/90 px-1.5 py-0.5 text-xs font-medium text-text-primary"
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
                    >
                      <div class="h-full bg-primary transition-all" [style.width.%]="video.watchProgress"></div>
                    </div>
                  }
                </div>
                <ion-card-content class="px-2 py-2">
                  <p class="text-text-primary text-xs font-semibold line-clamp-2 leading-tight">{{ video.title }}</p>
                  <p class="text-text-tertiary text-xs mt-0.5">
                    {{ video.athlete.name }}
                    @if (video.watchProgress === 100) {
                      · <span class="text-primary font-semibold">Watched</span>
                    }
                  </p>
                </ion-card-content>
              </ion-card>
            }
          </div>
        </section>
      } @placeholder {
        <div class="py-6 pb-20 px-4">
          <div class="mb-3 h-5 w-32 animate-pulse rounded bg-surface-300"></div>
          <div class="grid grid-cols-2 gap-3">
            @for (i of skeletonArray(6); track i) {
              <div class="bg-surface-300 animate-pulse rounded-2xl" style="aspect-ratio: 16/9;"></div>
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

      .overflow-x-auto::-webkit-scrollbar {
        display: none;
      }

      ion-card {
        --background: var(--nxt1-color-surface-200);
        --color: var(--nxt1-color-text-primary);
        box-shadow: none;
      }

      .watch-btn {
        --background: var(--nxt1-color-primary);
        --color: var(--nxt1-color-bg-primary);
        --border-radius: 9999px;
        font-weight: 700;
      }

      ion-list {
        --background: transparent;
        --ion-item-background: transparent;
        padding: 0;
      }

      ion-item {
        --inner-border-width: 0;
      }

      /* Columns fix */
      .columns-2 {
        column-gap: 0.75rem;
      }

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
export class ExploreVideosMobileComponent {
  private readonly haptics = inject(HapticsService);

  constructor() {
    addIcons({ playCircle, flame, checkmarkCircle, bookmarkOutline });
  }

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
      // Normalize both sides: strip trailing 's' for plural/singular matching
      return posLower.replace(/s$/, '') === pLower.replace(/s$/, '');
    });
  });

  // ── Interaction Handlers ──────────────────────────────────────────────────

  protected async onVideoTap(video: VideoItem): Promise<void> {
    await this.haptics.impact('light');
    // Navigation handled by parent wrapper
  }

  protected async onWatchTap(video: VideoItem): Promise<void> {
    await this.haptics.impact('medium');
    // Navigation handled by parent wrapper
  }

  protected async onWatchlistTap(video: VideoItem): Promise<void> {
    await this.haptics.impact('light');
    // Navigation handled by parent wrapper
  }

  protected async onPositionChipTap(pos: PositionFilter): Promise<void> {
    await this.haptics.impact('light');
    this.activePosition.set(pos);
  }

  /** Throttled: fire haptic at most once per 300 ms during horizontal scroll */
  protected onHighlightScroll(): void {
    const now = Date.now();
    if (now - this._lastHighlightHapticMs > 300) {
      this._lastHighlightHapticMs = now;
      void this.haptics.impact('light');
    }
  }

  /** Throttled: fire haptic at most once per 300 ms during horizontal scroll */
  protected onGameScroll(): void {
    const now = Date.now();
    if (now - this._lastGameHapticMs > 300) {
      this._lastGameHapticMs = now;
      void this.haptics.impact('light');
    }
  }

  private _lastHighlightHapticMs = 0;
  private _lastGameHapticMs = 0;

  // ── Utilities ─────────────────────────────────────────────────────────────

  protected formatViewCount(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
    return `${count} views`;
  }

  protected skeletonArray(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }
}
