/**
 * @fileoverview NxtCoSignCollaborationSectionComponent — "The NXT1 Co-Sign"
 * @module @nxt1/ui/components/co-sign-collaboration-section
 *
 * Auto-scrolling marquee of 1:1 (1080 × 1080) mock Instagram collab posts
 * showcasing athlete content featured on the &#64;NXT1Sports main account.
 *
 * Uses the proven double-track CSS technique (translate3d -50 %) for a
 * seamless infinite loop — GPU-accelerated, zero JS timers, SSR-safe.
 *
 * 100 % design-token-driven, semantic, accessible, responsive.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

let coSignCollaborationInstanceCounter = 0;

/** Represents one mock collab post in the marquee. */
export interface CollabPost {
  readonly id: string;
  readonly athleteName: string;
  readonly handle: string;
  readonly sport: string;
  readonly position: string;
  readonly classYear: string;
  readonly badge: string;
  readonly views: string;
  readonly likes: string;
  readonly caption: string;
}

const COLLAB_POSTS: readonly CollabPost[] = [
  {
    id: 'collab-1',
    athleteName: 'Marcus Thompson',
    handle: '@marcus.t11',
    sport: 'Football',
    position: 'QB',
    classYear: '2027',
    badge: "Scout's Eye · Top Play",
    views: '134K',
    likes: '12.4K',
    caption: 'Game-winning 45-yard bomb under pressure 🏈🔥 #NXT1CoSign',
  },
  {
    id: 'collab-2',
    athleteName: 'Ava Chen',
    handle: '@ava.chen.vb',
    sport: 'Volleyball',
    position: 'OH',
    classYear: '2026',
    badge: 'NXT1 Collab Feature',
    views: '87K',
    likes: '9.2K',
    caption: 'Cross-court kill that sealed the state championship 🏐 #NXT1CoSign',
  },
  {
    id: 'collab-3',
    athleteName: 'Jaylen Brooks',
    handle: '@jbrooks.hoops',
    sport: 'Basketball',
    position: 'PG',
    classYear: '2027',
    badge: "Scout's Eye · Top Play",
    views: '241K',
    likes: '26.3K',
    caption: 'Between-the-legs crossover to step-back three 🏀 #NXT1CoSign',
  },
  {
    id: 'collab-4',
    athleteName: 'Sofia Reyes',
    handle: '@sofi.goals',
    sport: 'Soccer',
    position: 'FW',
    classYear: '2026',
    badge: 'Weekly Athlete Feature',
    views: '63K',
    likes: '5.8K',
    caption: "Bicycle kick in the 89th minute — we don't quit 💥⚽ #NXT1CoSign",
  },
  {
    id: 'collab-5',
    athleteName: 'Darius Williams',
    handle: '@d.will.track',
    sport: 'Track & Field',
    position: '100m',
    classYear: '2027',
    badge: 'NXT1 Collab Feature',
    views: '112K',
    likes: '14.1K',
    caption: 'New PR — 10.38 at regionals. D1 scouts were watching 🏃‍♂️ #NXT1CoSign',
  },
  {
    id: 'collab-6',
    athleteName: 'Riley Parker',
    handle: '@riley.lax',
    sport: 'Lacrosse',
    position: 'ATT',
    classYear: '2026',
    badge: "Scout's Eye · Top Play",
    views: '78K',
    likes: '7.6K',
    caption: 'Behind-the-back goal that broke the internet 🥍 #NXT1CoSign',
  },
] as const;

@Component({
  selector: 'nxt1-co-sign-collaboration-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="co-sign" [attr.aria-labelledby]="titleId()">
      <!-- ── Header ── -->
      <div class="co-sign__header">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The NXT1 Co-Sign"
          [headingLevel]="headingLevel()"
          title="Get Featured on the Main Stage."
          subtitle="Don't just post to your feed. Post to ours. We built the audience so you don't have to start from zero."
          variant="hero"
          align="center"
        />
        <p class="co-sign__trust" aria-label="Trust signal">
          Over 10 million monthly impressions across our network. Get your slice.
        </p>
      </div>

      <!-- ── Auto-scrolling collab post marquee ── -->
      <div
        class="co-sign__marquee"
        role="marquee"
        [attr.aria-label]="
          'Auto-scrolling showcase of ' + posts.length + ' NXT1 collaboration posts with athletes'
        "
      >
        <div class="co-sign__track">
          <!-- Original set -->
          @for (post of postsLoop; track post.id + '-' + $index) {
            <article
              class="collab-post"
              [attr.aria-hidden]="$index >= posts.length ? 'true' : null"
            >
              <!-- Post image area (1:1 placeholder) -->
              <div class="collab-post__media" aria-hidden="true">
                <div class="collab-post__media-inner">
                  <div class="collab-post__sport-icon">
                    @switch (post.sport) {
                      @case ('Football') {
                        🏈
                      }
                      @case ('Volleyball') {
                        🏐
                      }
                      @case ('Basketball') {
                        🏀
                      }
                      @case ('Soccer') {
                        ⚽
                      }
                      @case ('Track & Field') {
                        🏃
                      }
                      @case ('Lacrosse') {
                        🥍
                      }
                      @default {
                        🏅
                      }
                    }
                  </div>
                  <span class="collab-post__play-btn">▶</span>
                </div>

                <!-- Collab badge overlay -->
                <div class="collab-post__badge-overlay">
                  <span class="collab-post__badge-dot" aria-hidden="true"></span>
                  {{ post.badge }}
                </div>

                <!-- Views pill -->
                <span class="collab-post__views">{{ post.views }} views</span>
              </div>

              <!-- Post footer: profile + engagement -->
              <div class="collab-post__footer">
                <div class="collab-post__profile">
                  <div class="collab-post__collab-row">
                    <span class="collab-post__avatar collab-post__avatar--nxt1" aria-hidden="true"
                      >N1</span
                    >
                    <span
                      class="collab-post__avatar collab-post__avatar--athlete"
                      aria-hidden="true"
                    >
                      {{ post.athleteName.charAt(0) }}
                    </span>
                    <div class="collab-post__names">
                      <p class="collab-post__collab-label">
                        <span class="collab-post__handle">&#64;NXT1Sports</span>
                        &amp;
                        <span class="collab-post__handle">{{ post.handle }}</span>
                      </p>
                      <p class="collab-post__tag">
                        {{ post.position }} · {{ post.sport }} · Class of {{ post.classYear }}
                      </p>
                    </div>
                  </div>
                </div>

                <p class="collab-post__caption">{{ post.caption }}</p>

                <div class="collab-post__stats">
                  <span class="collab-post__stat">♥ {{ post.likes }}</span>
                  <span class="collab-post__stat">💬 {{ post.views }}</span>
                  <span class="collab-post__stat">↗ Share</span>
                </div>
              </div>
            </article>
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      /* ── Infinite scroll keyframe ── */
      @keyframes co-sign-scroll {
        0% {
          transform: translate3d(0, 0, 0);
        }
        100% {
          transform: translate3d(-50%, 0, 0);
        }
      }

      :host {
        display: block;
      }

      /* ── Section ── */
      .co-sign {
        overflow: hidden;
        padding: var(--nxt1-section-padding-y) 0;
        background: transparent;
      }

      .co-sign__header {
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: 0 var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-3);
        justify-items: center;
        text-align: center;
      }

      .co-sign__trust {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ── Marquee viewport ── */
      .co-sign__marquee {
        position: relative;
        margin-top: var(--nxt1-spacing-7);
        -webkit-mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 6%,
          black 94%,
          transparent 100%
        );
        mask-image: linear-gradient(
          to right,
          transparent 0%,
          black 6%,
          black 94%,
          transparent 100%
        );
      }

      /* ── Scrolling track ── */
      .co-sign__track {
        display: flex;
        gap: var(--nxt1-spacing-4);
        width: max-content;
        animation: co-sign-scroll 40s linear infinite;
        will-change: transform;
      }

      .co-sign__marquee:hover .co-sign__track,
      .co-sign__marquee:focus-within .co-sign__track {
        animation-play-state: paused;
      }

      /* ── Individual collab post card ── */
      .collab-post {
        /* Component-level overlay hooks — themeable without touching internals */
        --_overlay-heavy: var(--nxt1-color-bg-overlay, rgba(0, 0, 0, 0.65));
        --_overlay-light: var(--nxt1-color-alpha-black30, rgba(0, 0, 0, 0.45));
        --_overlay-text: var(--nxt1-color-badge-text, #fff);

        flex: 0 0 clamp(16rem, 32vw, 22rem);
        display: flex;
        flex-direction: column;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        overflow: hidden;
        box-shadow: var(--nxt1-shadow-sm);
        transition: box-shadow var(--nxt1-duration-normal) var(--nxt1-easing-out);
      }

      .collab-post:hover {
        box-shadow: var(--nxt1-shadow-md);
      }

      /* ── 1:1 media placeholder ── */
      .collab-post__media {
        position: relative;
        aspect-ratio: 1 / 1;
        overflow: hidden;
      }

      .collab-post__media-inner {
        width: 100%;
        height: 100%;
        background: linear-gradient(
          145deg,
          var(--nxt1-color-surface-300) 0%,
          var(--nxt1-color-surface-200) 40%,
          var(--nxt1-color-surface-100) 100%
        );
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
      }

      .collab-post__sport-icon {
        font-size: clamp(2rem, 5vw, 3rem);
        line-height: 1;
        opacity: 0.5;
      }

      .collab-post__play-btn {
        width: var(--nxt1-spacing-10);
        height: var(--nxt1-spacing-10);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--_overlay-light);
        color: var(--_overlay-text);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: var(--nxt1-fontSize-sm);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      /* Badge overlay — top-left */
      .collab-post__badge-overlay {
        position: absolute;
        top: var(--nxt1-spacing-2);
        left: var(--nxt1-spacing-2);
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--_overlay-heavy);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        color: var(--_overlay-text);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        white-space: nowrap;
      }

      .collab-post__badge-dot {
        width: var(--nxt1-spacing-1_5);
        height: var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
      }

      /* Views pill — bottom-right */
      .collab-post__views {
        position: absolute;
        bottom: var(--nxt1-spacing-2);
        right: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-0_5) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-md);
        background: var(--_overlay-heavy);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        color: var(--_overlay-text);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      /* ── Post footer ── */
      .collab-post__footer {
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3);
      }

      .collab-post__profile {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-2);
      }

      .collab-post__collab-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        min-width: 0;
      }

      /* Overlapping dual avatars */
      .collab-post__avatar {
        flex-shrink: 0;
        width: var(--nxt1-spacing-7);
        height: var(--nxt1-spacing-7);
        border-radius: var(--nxt1-borderRadius-full);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        border: var(--nxt1-spacing-0_5) solid var(--nxt1-color-surface-100);
      }

      .collab-post__avatar--nxt1 {
        background: var(--nxt1-color-surface-300);
        color: var(--nxt1-color-primary);
        z-index: 1;
      }

      .collab-post__avatar--athlete {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        margin-left: calc(var(--nxt1-spacing-3) * -1);
      }

      .collab-post__names {
        display: grid;
        gap: var(--nxt1-spacing-px);
        min-width: 0;
      }

      .collab-post__collab-label {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .collab-post__handle {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .collab-post__tag {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .collab-post__caption {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .collab-post__stats {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .collab-post__stat {
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .collab-post__stat:first-child {
        color: var(--nxt1-color-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      /* ── Responsive ── */
      @media (max-width: 767px) {
        .collab-post {
          flex-basis: min(17rem, 72vw);
        }

        .co-sign__track {
          animation-duration: 30s;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .co-sign__track {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCoSignCollaborationSectionComponent {
  private readonly instanceId = ++coSignCollaborationInstanceCounter;

  readonly headingLevel = input<SectionHeaderLevel>(2);

  readonly titleId = computed(() => `co-sign-collaboration-title-${this.instanceId}`);

  /** Collab post data for the marquee. */
  protected readonly posts = COLLAB_POSTS;
  /** Doubled array for seamless infinite loop. */
  protected readonly postsLoop = [...COLLAB_POSTS, ...COLLAB_POSTS];
}
