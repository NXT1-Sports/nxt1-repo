import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

interface ContentSpin {
  readonly id: 'quote-card' | 'stat-flashback' | 'workout-pov' | 'fan-qa' | 'rankings-update';
  readonly label: string;
  readonly detail: string;
  readonly format: string;
}

const CONTENT_SPINS: readonly ContentSpin[] = [
  {
    id: 'quote-card',
    label: 'Quote Card',
    detail: 'Inspirational quote overlaid on practice photo.',
    format: 'Square Post',
  },
  {
    id: 'stat-flashback',
    label: 'Stat Flashback',
    detail: 'On this day last year: 25 Points.',
    format: 'Story + Feed',
  },
  {
    id: 'workout-pov',
    label: 'Workout POV',
    detail: 'GoPro style lifting clip with music.',
    format: 'Vertical Video',
  },
  {
    id: 'fan-qa',
    label: 'Fan Q&A',
    detail: 'Instagram Story template.',
    format: 'Story Template',
  },
  {
    id: 'rankings-update',
    label: 'Rankings Update',
    detail: 'Moved up to #15 in State.',
    format: 'Announcement Card',
  },
] as const;

let infiniteContentEngineInstanceCounter = 0;

@Component({
  selector: 'nxt1-infinite-content-engine-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="infinite-engine" [attr.aria-labelledby]="titleId()">
      <div class="infinite-engine__shell">
        <nxt1-section-header
          [titleId]="titleId()"
          [headingLevel]="headingLevel()"
          variant="hero"
          align="center"
          eyebrow="The Infinite Content Engine"
          title="Never Run Out of Content Again."
          subtitle="No new highlight? No problem. Agent X generates personalized content for you — every single day."
        />

        <article class="infinite-engine__studio" [attr.aria-labelledby]="studioTitleId()">
          <header class="infinite-engine__studio-header">
            <h3 class="infinite-engine__studio-title" [id]="studioTitleId()">
              Content Slot Machine
            </h3>
            <p class="infinite-engine__studio-status" role="status" aria-live="polite">
              Personalization Active
            </p>
          </header>

          <!-- Slot machine: compact single-window viewport cycling through spins -->
          <div
            class="slot-machine"
            [attr.aria-labelledby]="slotMachineTitleId()"
            [attr.aria-describedby]="slotMachineDescriptionId()"
          >
            <h4 class="sr-only" [id]="slotMachineTitleId()">Visual Strategy Reel</h4>
            <p class="sr-only" [id]="slotMachineDescriptionId()">
              A compact slot-machine reel cycles through five elite post types.
            </p>

            <div class="slot-machine__window" aria-hidden="true">
              <div class="slot-machine__reel">
                @for (spin of reelSpins; track spin.id + '-' + $index) {
                  <div class="slot-machine__cell">
                    <div class="slot-machine__cell-visual">
                      <img
                        [src]="placeholderSrc"
                        [alt]="''"
                        width="1080"
                        height="1080"
                        loading="lazy"
                      />
                      <span class="slot-machine__cell-format">{{ spin.format }}</span>
                    </div>
                    <div class="slot-machine__cell-body">
                      <p class="slot-machine__cell-label">{{ spin.label }}</p>
                      <p class="slot-machine__cell-detail">{{ spin.detail }}</p>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Indicator dots -->
            <div class="slot-machine__dots" aria-hidden="true">
              @for (spin of contentSpins; track spin.id) {
                <span class="slot-machine__dot"></span>
              }
            </div>
          </div>

          <!-- Key insight -->
          <aside class="infinite-engine__insight" [attr.aria-labelledby]="insightTitleId()">
            <h4 class="infinite-engine__insight-title" [id]="insightTitleId()">Key Insight</h4>
            <p class="infinite-engine__insight-copy">
              "Consistency is the hardest part of being a creator. We automate it."
            </p>
            <p class="infinite-engine__insight-sub">Wake up. Open app. Post. Grow.</p>
          </aside>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      /* ── Host ── */
      :host {
        display: block;
      }

      /* ── Screen-reader only ── */
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
      }

      /* ── Reel animation — cycles 5 items then resets seamlessly ── */
      @keyframes infinite-engine-reel-spin {
        0%,
        5% {
          transform: translateY(0);
        }
        15%,
        25% {
          transform: translateY(-10%);
        }
        35%,
        45% {
          transform: translateY(-20%);
        }
        55%,
        65% {
          transform: translateY(-30%);
        }
        75%,
        85% {
          transform: translateY(-40%);
        }
        95%,
        100% {
          transform: translateY(-50%);
        }
      }

      /* ── Section container ── */
      .infinite-engine {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .infinite-engine__shell {
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      /* ── Studio card ── */
      .infinite-engine__studio {
        display: grid;
        gap: var(--nxt1-spacing-5);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 94%, transparent);
        box-shadow: var(--nxt1-shadow-md);
        max-width: 520px;
        margin: 0 auto;
        width: 100%;
      }

      .infinite-engine__studio-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      .infinite-engine__studio-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .infinite-engine__studio-status {
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        background: var(--nxt1-color-alpha-primary8);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      /* ── Slot Machine ── */
      .slot-machine {
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .slot-machine__window {
        position: relative;
        height: 340px;
        overflow: hidden;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        background: var(--nxt1-color-surface-200);
      }

      /* Gradient masks top & bottom for fade-out illusion */
      .slot-machine__window::before,
      .slot-machine__window::after {
        content: '';
        position: absolute;
        left: 0;
        right: 0;
        height: var(--nxt1-spacing-6);
        z-index: 1;
        pointer-events: none;
      }

      .slot-machine__window::before {
        top: 0;
        background: linear-gradient(to bottom, var(--nxt1-color-surface-200), transparent);
      }

      .slot-machine__window::after {
        bottom: 0;
        background: linear-gradient(to top, var(--nxt1-color-surface-200), transparent);
      }

      .slot-machine__reel {
        animation: infinite-engine-reel-spin 15s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }

      .slot-machine__cell {
        display: grid;
        gap: var(--nxt1-spacing-3);
        height: 340px;
        padding: var(--nxt1-spacing-4);
        align-content: center;
      }

      .slot-machine__cell-visual {
        position: relative;
        width: 100%;
        aspect-ratio: 4 / 3;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-default);
        overflow: hidden;
        background: linear-gradient(
          150deg,
          var(--nxt1-color-alpha-primary8),
          var(--nxt1-color-surface-100)
        );
      }

      .slot-machine__cell-visual img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .slot-machine__cell-format {
        position: absolute;
        right: var(--nxt1-spacing-2);
        bottom: var(--nxt1-spacing-2);
        margin: 0;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary25);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 90%, transparent);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .slot-machine__cell-body {
        display: grid;
        gap: var(--nxt1-spacing-1);
        padding: 0 var(--nxt1-spacing-2);
      }

      .slot-machine__cell-label {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      .slot-machine__cell-detail {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Dots indicator ── */
      .slot-machine__dots {
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-1_5);
      }

      .slot-machine__dot {
        width: var(--nxt1-spacing-1_5);
        height: var(--nxt1-spacing-1_5);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary25);
      }

      /* Highlight the active dot via nth-child synced to animation keyframes */
      .slot-machine__dot:first-child {
        animation: dot-pulse-1 15s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }
      .slot-machine__dot:nth-child(2) {
        animation: dot-pulse-2 15s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }
      .slot-machine__dot:nth-child(3) {
        animation: dot-pulse-3 15s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }
      .slot-machine__dot:nth-child(4) {
        animation: dot-pulse-4 15s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }
      .slot-machine__dot:nth-child(5) {
        animation: dot-pulse-5 15s cubic-bezier(0.45, 0, 0.55, 1) infinite;
      }

      @keyframes dot-pulse-1 {
        0%,
        5% {
          background: var(--nxt1-color-primary);
        }
        15%,
        100% {
          background: var(--nxt1-color-alpha-primary25);
        }
      }
      @keyframes dot-pulse-2 {
        0%,
        14% {
          background: var(--nxt1-color-alpha-primary25);
        }
        15%,
        25% {
          background: var(--nxt1-color-primary);
        }
        35%,
        100% {
          background: var(--nxt1-color-alpha-primary25);
        }
      }
      @keyframes dot-pulse-3 {
        0%,
        34% {
          background: var(--nxt1-color-alpha-primary25);
        }
        35%,
        45% {
          background: var(--nxt1-color-primary);
        }
        55%,
        100% {
          background: var(--nxt1-color-alpha-primary25);
        }
      }
      @keyframes dot-pulse-4 {
        0%,
        54% {
          background: var(--nxt1-color-alpha-primary25);
        }
        55%,
        65% {
          background: var(--nxt1-color-primary);
        }
        75%,
        100% {
          background: var(--nxt1-color-alpha-primary25);
        }
      }
      @keyframes dot-pulse-5 {
        0%,
        74% {
          background: var(--nxt1-color-alpha-primary25);
        }
        75%,
        85% {
          background: var(--nxt1-color-primary);
        }
        95%,
        100% {
          background: var(--nxt1-color-alpha-primary25);
        }
      }

      /* ── Key Insight ── */
      .infinite-engine__insight {
        display: grid;
        gap: var(--nxt1-spacing-1_5);
        padding: var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-alpha-primary25);
        background: color-mix(in srgb, var(--nxt1-color-alpha-primary6) 65%, transparent);
        text-align: center;
      }

      .infinite-engine__insight-title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
      }

      .infinite-engine__insight-copy {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        font-style: italic;
      }

      .infinite-engine__insight-sub {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* ── Tablet ── */
      @media (min-width: 640px) {
        .infinite-engine__studio {
          max-width: 580px;
          padding: var(--nxt1-spacing-6);
        }

        .slot-machine__window {
          height: 400px;
        }

        .slot-machine__cell {
          height: 400px;
          padding: var(--nxt1-spacing-5);
        }

        .slot-machine__cell-label {
          font-size: var(--nxt1-fontSize-xl);
        }

        .slot-machine__cell-detail {
          font-size: var(--nxt1-fontSize-base);
        }
      }

      /* ── Desktop ── */
      @media (min-width: 1024px) {
        .infinite-engine__studio {
          max-width: 640px;
        }

        .slot-machine__window {
          height: 440px;
        }

        .slot-machine__cell {
          height: 440px;
          padding: var(--nxt1-spacing-6);
        }
      }

      /* ── Reduced motion ── */
      @media (prefers-reduced-motion: reduce) {
        .slot-machine__reel,
        .slot-machine__dot:first-child,
        .slot-machine__dot:nth-child(2),
        .slot-machine__dot:nth-child(3),
        .slot-machine__dot:nth-child(4),
        .slot-machine__dot:nth-child(5) {
          animation: none;
        }

        .slot-machine__dot:first-child {
          background: var(--nxt1-color-primary);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtInfiniteContentEngineSectionComponent {
  private readonly instanceId = ++infiniteContentEngineInstanceCounter;

  readonly headingLevel = input<SectionHeaderLevel>(2);
  readonly titleId = input<string>(`infinite-content-engine-title-${this.instanceId}`);

  protected readonly contentSpins = CONTENT_SPINS;

  /**
   * Doubled spin array for seamless infinite-loop illusion.
   * The reel scrolls through the first set then snaps back to
   * the identical second set, creating a continuous loop.
   */
  protected readonly reelSpins = [...CONTENT_SPINS, ...CONTENT_SPINS] as const;

  protected readonly studioTitleId = computed(
    () => `infinite-content-engine-studio-title-${this.instanceId}`
  );
  protected readonly slotMachineTitleId = computed(
    () => `infinite-content-engine-slot-machine-title-${this.instanceId}`
  );
  protected readonly slotMachineDescriptionId = computed(
    () => `infinite-content-engine-slot-machine-description-${this.instanceId}`
  );
  protected readonly insightTitleId = computed(
    () => `infinite-content-engine-insight-title-${this.instanceId}`
  );

  /** Transparent SVG placeholder to preserve image slot layout without network fetches. */
  protected readonly placeholderSrc =
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221080%22 height=%221080%22%3E%3C/svg%3E';
}
