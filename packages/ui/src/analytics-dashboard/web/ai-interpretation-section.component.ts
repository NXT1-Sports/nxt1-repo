/**
 * @fileoverview AI Interpretation Section — "Your 24/7 Analyst"
 * @module @nxt1/ui/analytics-dashboard/web/ai-interpretation-section
 *
 * Animated, interactive section showing raw stats followed by Agent X
 * typewriter insights. Triggers on scroll via IntersectionObserver.
 * 100% SSR-safe, design-token driven, responsive mobile-first.
 */

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { NxtSectionHeaderComponent } from '../../components/section-header';

/* ─── Data ─── */

interface StatInsightPair {
  readonly id: string;
  readonly rawLabel: string;
  readonly rawValue: string;
  readonly insight: string;
}

const STAT_VS_INSIGHT: readonly StatInsightPair[] = [
  {
    id: 'shooting-efficiency',
    rawLabel: '3PT%',
    rawValue: '28% (Down 5%)',
    insight:
      'Your release point is inconsistent on catch-and-shoot attempts from the right wing. Focus on elbow alignment.',
  },
  {
    id: 'recruiter-momentum',
    rawLabel: 'Recruiter Views',
    rawValue: '+150%',
    insight:
      'Your latest highlight reel is trending in Florida. I recommend emailing FSU while you have momentum.',
  },
] as const;

/* ─── Timing (ms) ─── */

const ENTRY_DELAY = 200;
const STAT_REVEAL_PAUSE = 500;
const TYPE_SPEED = 25;
const PAIR_GAP = 600;

/* ─── Component ─── */

@Component({
  selector: 'nxt1-ai-interpretation-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="analyst" aria-labelledby="analyst-title">
      <nxt1-section-header
        titleId="analyst-title"
        eyebrow="Your 24/7 Analyst · AI Interpretation"
        [headingLevel]="2"
        align="center"
        title="Don't Just See the Number. Understand It."
        subtitle="Stats tell you what happened. Agent X tells you why."
      />

      <!-- Showcase container -->
      <div class="analyst__showcase">
        <p class="analyst__showcase-label">The Stat vs. The Insight</p>

        <div class="analyst__pairs">
          <!-- ── Pair 0 ── -->
          <article class="analyst__pair" [class.analyst__pair--active]="stat0Visible()">
            <div
              class="analyst__stat-card"
              [class.analyst__stat-card--revealed]="stat0Visible()"
              aria-label="Raw data"
            >
              <span class="analyst__badge">Raw Data</span>
              <p class="analyst__metric">
                <span class="analyst__metric-label">{{ pairs[0].rawLabel }}:</span>
                <strong class="analyst__metric-value">{{ pairs[0].rawValue }}</strong>
              </p>
            </div>

            <div class="analyst__connector" aria-hidden="true">
              <span class="analyst__connector-track">
                <span
                  class="analyst__connector-fill"
                  [class.analyst__connector-fill--active]="typing0Active() || insight0Done()"
                ></span>
              </span>
              <span
                class="analyst__connector-dot"
                [class.analyst__connector-dot--pulse]="typing0Active()"
                [class.analyst__connector-dot--done]="insight0Done()"
              ></span>
            </div>

            <div
              class="analyst__insight-card"
              [class.analyst__insight-card--visible]="typing0Active() || insight0Done()"
              aria-label="Agent X insight"
            >
              <span class="analyst__badge analyst__badge--accent">Agent X</span>
              <p class="analyst__insight-text">
                {{ typedText0() }}
                @if (typing0Active()) {
                  <span class="analyst__cursor" aria-hidden="true"></span>
                }
              </p>
            </div>
          </article>

          <!-- ── Pair 1 ── -->
          <article class="analyst__pair" [class.analyst__pair--active]="stat1Visible()">
            <div
              class="analyst__stat-card"
              [class.analyst__stat-card--revealed]="stat1Visible()"
              aria-label="Raw data"
            >
              <span class="analyst__badge">Raw Data</span>
              <p class="analyst__metric">
                <span class="analyst__metric-label">{{ pairs[1].rawLabel }}:</span>
                <strong class="analyst__metric-value">{{ pairs[1].rawValue }}</strong>
              </p>
            </div>

            <div class="analyst__connector" aria-hidden="true">
              <span class="analyst__connector-track">
                <span
                  class="analyst__connector-fill"
                  [class.analyst__connector-fill--active]="typing1Active() || insight1Done()"
                ></span>
              </span>
              <span
                class="analyst__connector-dot"
                [class.analyst__connector-dot--pulse]="typing1Active()"
                [class.analyst__connector-dot--done]="insight1Done()"
              ></span>
            </div>

            <div
              class="analyst__insight-card"
              [class.analyst__insight-card--visible]="typing1Active() || insight1Done()"
              aria-label="Agent X insight"
            >
              <span class="analyst__badge analyst__badge--accent">Agent X</span>
              <p class="analyst__insight-text">
                {{ typedText1() }}
                @if (typing1Active()) {
                  <span class="analyst__cursor" aria-hidden="true"></span>
                }
              </p>
            </div>
          </article>
        </div>
      </div>

      <!-- Signals bar (fades in after sequence) -->
      <div
        class="analyst__signals"
        [class.analyst__signals--visible]="allDone()"
        role="note"
        aria-label="Key value and trust signals"
      >
        <div class="analyst__signal">
          <p class="analyst__signal-text">
            <span class="analyst__signal-label">Key Value:</span>
            Turn data into action. Agent X acts like a D1 film coordinator in your pocket.
          </p>
        </div>
        <span class="analyst__signal-divider" aria-hidden="true"></span>
        <div class="analyst__signal">
          <p class="analyst__signal-text">
            <span class="analyst__signal-label">Trust Signal:</span>
            Powered by the same advanced scouting models used by pro teams.
          </p>
        </div>
      </div>

      <!-- Replay control -->
      @if (allDone()) {
        <div class="analyst__replay">
          <button class="analyst__replay-btn" (click)="replay()" aria-label="Replay animation">
            <svg
              class="analyst__replay-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Replay
          </button>
        </div>
      }
    </section>
  `,
  styles: [
    `
      /* ═══════════════════════════════════════════════
         AI Interpretation Section — animated showcase
         ═══════════════════════════════════════════════ */

      :host {
        display: block;
      }

      .analyst {
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      /* ─── Showcase wrapper ─── */

      .analyst__showcase {
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      .analyst__showcase-label {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .analyst__pairs {
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      /* ─── Per-pair row ─── */

      .analyst__pair {
        display: grid;
        grid-template-columns: 1fr;
        gap: 0;
        opacity: 0;
        transform: translateY(16px);
        transition:
          opacity 0.5s cubic-bezier(0.22, 1, 0.36, 1),
          transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .analyst__pair--active {
        opacity: 1;
        transform: translateY(0);
      }

      /* ─── Stat card ─── */

      .analyst__stat-card {
        position: relative;
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-left: 3px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        opacity: 0;
        transform: scale(0.97) translateY(8px);
        transition:
          opacity 0.45s ease,
          transform 0.45s ease,
          border-color 0.45s ease,
          box-shadow 0.45s ease;
      }

      .analyst__stat-card--revealed {
        opacity: 1;
        transform: scale(1) translateY(0);
        border-left-color: var(--nxt1-color-primary);
        box-shadow: var(--nxt1-shadow-md);
      }

      /* ─── Badge labels ─── */

      .analyst__badge {
        display: inline-block;
        margin-bottom: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-0-5) var(--nxt1-spacing-2);
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        border-radius: var(--nxt1-borderRadius-sm);
        background: var(--nxt1-color-surface-100);
      }

      .analyst__badge--accent {
        color: var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 8%, transparent);
      }

      /* ─── Metric typography ─── */

      .analyst__metric {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .analyst__metric-label {
        color: var(--nxt1-color-text-secondary);
        font-weight: var(--nxt1-fontWeight-medium);
      }

      .analyst__metric-value {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-bold);
      }

      /* ─── Animated connector ─── */

      .analyst__connector {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 28px;
        padding: 0;
        gap: 0;
      }

      .analyst__connector-track {
        position: relative;
        display: block;
        width: 2px;
        height: 100%;
        background: var(--nxt1-color-border-subtle);
        border-radius: 1px;
        overflow: hidden;
      }

      .analyst__connector-fill {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 0;
        background: var(--nxt1-color-primary);
        border-radius: 1px;
        transition: height 0.5s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .analyst__connector-fill--active {
        height: 100%;
      }

      .analyst__connector-dot {
        flex-shrink: 0;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--nxt1-color-border-subtle);
        transition:
          background 0.3s ease,
          box-shadow 0.3s ease;
      }

      .analyst__connector-dot--pulse {
        background: var(--nxt1-color-primary);
        animation: dotPulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }

      .analyst__connector-dot--done {
        background: var(--nxt1-color-primary);
      }

      @keyframes dotPulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 color-mix(in srgb, var(--nxt1-color-primary) 40%, transparent);
        }
        50% {
          box-shadow: 0 0 0 6px color-mix(in srgb, var(--nxt1-color-primary) 0%, transparent);
        }
      }

      /* ─── Insight card ─── */

      .analyst__insight-card {
        position: relative;
        background: var(--nxt1-color-bg-primary);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        opacity: 0;
        transform: translateY(8px);
        transition:
          opacity 0.4s ease,
          transform 0.4s ease,
          box-shadow 0.4s ease;
        min-height: 80px;
      }

      .analyst__insight-card--visible {
        opacity: 1;
        transform: translateY(0);
        box-shadow: var(--nxt1-shadow-md);
      }

      .analyst__insight-text {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        min-height: 1.5em;
        white-space: pre-wrap;
      }

      /* ─── Typewriter cursor ─── */

      .analyst__cursor {
        display: inline-block;
        width: 2px;
        height: 1.15em;
        margin-left: 1px;
        background: var(--nxt1-color-primary);
        vertical-align: text-bottom;
        animation: cursorBlink 0.55s steps(1) infinite;
      }

      @keyframes cursorBlink {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0;
        }
      }

      /* ─── Signals bar ─── */

      .analyst__signals {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        opacity: 0;
        transform: translateY(12px);
        transition:
          opacity 0.5s ease 0.15s,
          transform 0.5s ease 0.15s;
      }

      .analyst__signals--visible {
        opacity: 1;
        transform: translateY(0);
      }

      .analyst__signal {
        display: flex;
        align-items: flex-start;
        gap: var(--nxt1-spacing-3);
      }

      .analyst__signal-text {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .analyst__signal-label {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .analyst__signal-divider {
        display: none;
      }

      /* ─── Replay ─── */

      .analyst__replay {
        display: flex;
        justify-content: center;
        animation: fadeUp 0.4s ease both;
      }

      .analyst__replay-btn {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-4);
        background: transparent;
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-full);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        cursor: pointer;
        transition:
          color 0.2s ease,
          border-color 0.2s ease,
          background 0.2s ease;
        -webkit-tap-highlight-color: transparent;
      }

      .analyst__replay-btn:hover,
      .analyst__replay-btn:focus-visible {
        color: var(--nxt1-color-primary);
        border-color: var(--nxt1-color-primary);
        background: color-mix(in srgb, var(--nxt1-color-primary) 5%, transparent);
        outline: none;
      }

      .analyst__replay-icon {
        transition: transform 0.4s ease;
      }

      .analyst__replay-btn:hover .analyst__replay-icon {
        transform: rotate(-360deg);
      }

      @keyframes fadeUp {
        from {
          opacity: 0;
          transform: translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ═══════════════════════════════════════════════
         Desktop (≥ 992 px)
         ═══════════════════════════════════════════════ */

      @media (min-width: 992px) {
        .analyst__pair {
          grid-template-columns: minmax(0, 1fr) 56px minmax(0, 1.5fr);
          align-items: center;
        }

        .analyst__connector {
          flex-direction: row;
          height: auto;
          width: 100%;
          padding: 0;
        }

        .analyst__connector-track {
          width: 100%;
          height: 2px;
        }

        .analyst__connector-fill {
          top: 0;
          left: 0;
          height: 100%;
          width: 0;
          transition: width 0.5s cubic-bezier(0.22, 1, 0.36, 1);
        }

        .analyst__connector-fill--active {
          width: 100%;
          height: 100%;
        }

        .analyst__signals {
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
        }

        .analyst__signal-divider {
          display: block;
          width: 1px;
          height: 28px;
          background: var(--nxt1-color-border-subtle);
        }
      }
    `,
  ],
})
export class AiInterpretationSectionComponent {
  private readonly elementRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly pairs = STAT_VS_INSIGHT;

  /* ─── Animation state ─────────────────────────────
   * Phase progression:
   *   0 = hidden (not in viewport yet, browser only)
   *   1 = stat 0 revealed
   *   2 = typing insight 0
   *   3 = insight 0 done + stat 1 revealed
   *   4 = typing insight 1
   *   5 = all done (also SSR initial state for full-content render)
   *
   * SSR Strategy (progressive enhancement):
   *   Server renders at phase 5 with full text visible so crawlers
   *   see all content. After hydration, afterNextRender resets to 0
   *   and the IntersectionObserver triggers the animation sequence.
   * ────────────────────────────────────────────────── */

  private readonly _phase = signal(5);
  private readonly _typedText0 = signal(STAT_VS_INSIGHT[0].insight);
  private readonly _typedText1 = signal(STAT_VS_INSIGHT[1].insight);

  protected readonly stat0Visible = computed(() => this._phase() >= 1);
  protected readonly typing0Active = computed(() => this._phase() === 2);
  protected readonly insight0Done = computed(() => this._phase() >= 3);

  protected readonly stat1Visible = computed(() => this._phase() >= 3);
  protected readonly typing1Active = computed(() => this._phase() === 4);
  protected readonly insight1Done = computed(() => this._phase() >= 5);

  protected readonly allDone = computed(() => this._phase() >= 5);

  protected readonly typedText0 = computed(() => this._typedText0());
  protected readonly typedText1 = computed(() => this._typedText1());

  private timeoutIds: ReturnType<typeof setTimeout>[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor() {
    afterNextRender(() => {
      // Reset to hidden state so the scroll-triggered animation plays.
      // SSR already rendered full content — now the client takes over.
      this._phase.set(0);
      this._typedText0.set('');
      this._typedText1.set('');
      this.observeViewport();
    });
    this.destroyRef.onDestroy(() => this.cleanup());
  }

  /* ─── Public ─── */

  protected replay(): void {
    this.clearTimers();
    this._phase.set(0);
    this._typedText0.set('');
    this._typedText1.set('');
    this.schedule(() => this.runSequence(), ENTRY_DELAY);
  }

  /* ─── Viewport detection ─── */

  private observeViewport(): void {
    const el = this.elementRef.nativeElement as HTMLElement;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && this._phase() === 0) {
          this.schedule(() => this.runSequence(), ENTRY_DELAY);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  /* ─── Animation sequence ─── */

  private runSequence(): void {
    this._phase.set(1);

    this.schedule(() => {
      this._phase.set(2);
      this.typewrite(this.pairs[0].insight, this._typedText0, () => {
        this._phase.set(3);

        this.schedule(() => {
          this._phase.set(4);
          this.typewrite(this.pairs[1].insight, this._typedText1, () => {
            this._phase.set(5);
          });
        }, PAIR_GAP);
      });
    }, STAT_REVEAL_PAUSE);
  }

  private typewrite(text: string, target: WritableSignal<string>, onComplete: () => void): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }
    let i = 0;
    this.intervalId = setInterval(() => {
      i++;
      target.set(text.slice(0, i));
      if (i >= text.length) {
        if (this.intervalId !== null) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
        onComplete();
      }
    }, TYPE_SPEED);
  }

  /* ─── Timer helpers ─── */

  private schedule(fn: () => void, ms: number): void {
    this.timeoutIds.push(setTimeout(fn, ms));
  }

  private clearTimers(): void {
    this.timeoutIds.forEach((id) => clearTimeout(id));
    this.timeoutIds = [];
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private cleanup(): void {
    this.clearTimers();
  }
}
