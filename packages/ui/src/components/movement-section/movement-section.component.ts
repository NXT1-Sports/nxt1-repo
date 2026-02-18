/**
 * @fileoverview NXT1 Movement Feed Component
 * @module @nxt1/ui/components/movement-section
 * @version 4.0.0
 *
 * Lightweight live-activity scrolling feed widget.
 * Displays activity cards inside a clipped viewport with infinite
 * vertical CSS scroll. Designed to be composed inside any layout —
 * typically slotted into <nxt1-hero-section> as the right-column media.
 *
 * @example
 * ```html
 * <nxt1-hero-section
 *   badgeLabel="Live Activity"
 *   title="The Movement Is"
 *   accentText="Happening Now"
 *   subtitle="Real-time recruiting signals from across the country."
 * >
 *   <nxt1-movement-section [items]="activityItems" />
 * </nxt1-hero-section>
 * ```
 *
 * Design:
 * - Clipped rounded box with top/bottom edge-fade masks.
 * - Cards scroll vertically in an infinite CSS loop.
 * - Each card shows a green live-dot, user name, location, update, and time.
 * - Shows ~3 cards at a time within the viewport.
 *
 * 2026 standards:
 * - SSR-safe (pure CSS animation, no DOM/browser APIs)
 * - 100% design-token driven
 * - Semantic HTML with ARIA marquee role
 * - prefers-reduced-motion respected
 */

import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// ============================================
// PUBLIC TYPES
// ============================================

/** A single live-activity entry displayed in the scrolling feed. */
export interface MovementActivityItem {
  /** Unique identifier. */
  readonly id: string;
  /** Display name of the user. */
  readonly userName: string;
  /** US state abbreviation or short location tag. */
  readonly location: string;
  /** Activity description (e.g. "just received an offer from Oregon"). */
  readonly update: string;
  /** Relative time label (e.g. "8s ago"). */
  readonly timeLabel: string;
}

// ============================================
// DEFAULTS
// ============================================

const DEFAULT_ACTIVITY_ITEMS: readonly MovementActivityItem[] = [
  {
    id: 'a-1',
    userName: 'John Doe',
    location: 'CA',
    update: 'just received an offer from Oregon',
    timeLabel: '8s ago',
  },
  {
    id: 'a-2',
    userName: 'Ava Thompson',
    location: 'TX',
    update: 'generated a new highlight graphic',
    timeLabel: '23s ago',
  },
  {
    id: 'a-3',
    userName: 'Noah Williams',
    location: 'FL',
    update: 'got added to 3 recruiter boards',
    timeLabel: '41s ago',
  },
  {
    id: 'a-4',
    userName: 'Mia Johnson',
    location: 'GA',
    update: 'booked a call with a Pac-12 program',
    timeLabel: '1m ago',
  },
  {
    id: 'a-5',
    userName: 'Liam Carter',
    location: 'WA',
    update: 'profile views surged 240% in one hour',
    timeLabel: '2m ago',
  },
  {
    id: 'a-6',
    userName: 'Zoe Rivera',
    location: 'OH',
    update: 'started direct conversations with recruiters',
    timeLabel: '3m ago',
  },
];

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-movement-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="feed"
      role="marquee"
      [attr.aria-label]="'Live activity feed with ' + items().length + ' recent events'"
    >
      <!-- Edge fades -->
      <div class="feed__fade feed__fade--top" aria-hidden="true"></div>
      <div class="feed__fade feed__fade--bottom" aria-hidden="true"></div>

      <!-- Scrolling track -->
      <div class="feed__track" [style.--feed-duration]="duration()">
        @for (item of itemsDoubled(); track item.id + '-' + $index) {
          <div class="feed__card">
            <span class="feed__ping" aria-hidden="true"></span>
            <div class="feed__card-body">
              <p class="feed__card-text">
                <span class="feed__card-user">{{ item.userName }}</span>
                <span class="feed__card-loc">({{ item.location }})</span>
                {{ item.update }}
              </p>
              <time class="feed__card-time">{{ item.timeLabel }}</time>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /* ============================================
         MOVEMENT FEED v4
         Self-contained scrolling card feed.
         Composed inside any layout (hero-section, etc).
         100% design-token driven.
         ============================================ */

      :host {
        display: block;
        width: 100%;
      }

      /* ---------- Feed viewport ---------- */

      .feed {
        position: relative;
        overflow: hidden;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        height: 260px;
      }

      /* Top / bottom edge fades */
      .feed__fade {
        position: absolute;
        left: 0;
        right: 0;
        height: var(--nxt1-spacing-10);
        z-index: 1;
        pointer-events: none;
      }

      .feed__fade--top {
        top: 0;
        background: linear-gradient(to bottom, var(--nxt1-color-surface-100), transparent);
      }

      .feed__fade--bottom {
        bottom: 0;
        background: linear-gradient(to top, var(--nxt1-color-surface-100), transparent);
      }

      /* ---------- Track (infinite vertical scroll) ---------- */

      .feed__track {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        animation: feed-scroll-up var(--feed-duration, 20s) linear infinite;
      }

      /* ---------- Card ---------- */

      .feed__card {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .feed__card:hover {
        border-color: var(--nxt1-color-alpha-primary30);
        box-shadow: var(--nxt1-shadow-sm);
      }

      /* Live indicator dot */
      .feed__ping {
        flex-shrink: 0;
        margin-top: var(--nxt1-spacing-1);
        width: 6px;
        height: 6px;
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-success);
        box-shadow: 0 0 0 3px var(--nxt1-color-alpha-success16);
        animation: feed-ping 2s var(--nxt1-motion-easing-inOut) infinite;
      }

      /* Card content */
      .feed__card-body {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
      }

      .feed__card-text {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      .feed__card-user {
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .feed__card-loc {
        color: var(--nxt1-color-text-tertiary);
        margin-right: var(--nxt1-spacing-1);
      }

      .feed__card-time {
        flex-shrink: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        color: var(--nxt1-color-text-tertiary);
        white-space: nowrap;
      }

      /* ---------- Keyframes ---------- */

      @keyframes feed-scroll-up {
        from {
          transform: translateY(0);
        }
        to {
          transform: translateY(-50%);
        }
      }

      @keyframes feed-ping {
        0%,
        100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.6;
          transform: scale(1.25);
        }
      }

      /* ---------- Accessibility ---------- */

      @media (prefers-reduced-motion: reduce) {
        .feed__track {
          animation: none;
        }

        .feed__ping {
          animation: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtMovementSectionComponent {
  /** Activity items rendered in the vertical scroller. */
  readonly items = input<readonly MovementActivityItem[]>(DEFAULT_ACTIVITY_ITEMS);

  /** Total animation cycle in seconds (lower = faster). */
  readonly speedSeconds = input<number>(20);

  /** CSS duration string. */
  protected readonly duration = computed(() => `${this.speedSeconds()}s`);

  /** Duplicate the list so translateY(-50%) creates a seamless loop. */
  protected readonly itemsDoubled = computed(() => [...this.items(), ...this.items()]);
}
