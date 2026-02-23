/**
 * @fileoverview Analytics "The Time Machine" section — Shared Web UI
 * @module @nxt1/ui/analytics-dashboard/web
 * @version 2.1.0
 *
 * Compact, SSR-safe marketing/feature section for `/analytics`.
 * Simple dropdown date-range selector with preview metrics & sparkline.
 *
 * Design compliance:
 * - 100 % design-token driven (zero hardcoded px/rem/hex values)
 * - Canonical section spacing via --nxt1-section-padding-y / --nxt1-section-padding-x
 * - Max-width via --nxt1-section-max-width-narrow (matches stats bar)
 * - SSR-safe: no browser APIs, deterministic IDs, no afterNextRender needed
 * - Accessible: labelled section, associated label + select, role="img" on SVG
 * - OnPush change detection + signals
 */

import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

interface TimeMachineOption {
  readonly id: string;
  readonly label: string;
  readonly dateRange: string;
  readonly profileViews: string;
  readonly videoPlays: string;
  readonly engagement: string;
  readonly chartPath: string;
  readonly fillPath: string;
}

const TIME_MACHINE_OPTIONS: readonly TimeMachineOption[] = [
  {
    id: 'last-7',
    label: 'Last 7 Days',
    dateRange: 'Feb 13 — Feb 20',
    profileViews: '184',
    videoPlays: '312',
    engagement: '+18%',
    chartPath: 'M0 38 C24 36 48 30 72 24 C96 18 120 22 144 14 C168 10 192 8 216 6',
    fillPath: 'M0 38 C24 36 48 30 72 24 C96 18 120 22 144 14 C168 10 192 8 216 6 L216 48 L0 48 Z',
  },
  {
    id: 'last-30',
    label: 'Last 30 Days',
    dateRange: 'Jan 21 — Feb 20',
    profileViews: '1,247',
    videoPlays: '3,891',
    engagement: '+64%',
    chartPath: 'M0 40 C24 38 48 32 72 26 C96 20 120 14 144 10 C168 8 192 6 216 4',
    fillPath: 'M0 40 C24 38 48 32 72 26 C96 20 120 14 144 10 C168 8 192 6 216 4 L216 48 L0 48 Z',
  },
  {
    id: 'season',
    label: 'Season to Date',
    dateRange: 'Nov 01 — Feb 20',
    profileViews: '6,820',
    videoPlays: '18,430',
    engagement: '+29%',
    chartPath: 'M0 40 C24 38 48 36 72 32 C96 28 120 24 144 20 C168 16 192 14 216 10',
    fillPath: 'M0 40 C24 38 48 36 72 32 C96 28 120 24 144 20 C168 16 192 14 216 10 L216 48 L0 48 Z',
  },
  {
    id: 'last-6mo',
    label: 'Last 6 Months',
    dateRange: 'Aug 20 — Feb 20',
    profileViews: '14,200',
    videoPlays: '42,100',
    engagement: '+112%',
    chartPath: 'M0 44 C24 42 48 38 72 34 C96 28 120 22 144 16 C168 10 192 8 216 4',
    fillPath: 'M0 44 C24 42 48 38 72 34 C96 28 120 22 144 16 C168 10 192 8 216 4 L216 48 L0 48 Z',
  },
  {
    id: 'all-time',
    label: 'All Time',
    dateRange: 'Since Joined',
    profileViews: '31,540',
    videoPlays: '89,700',
    engagement: '+248%',
    chartPath: 'M0 46 C24 44 48 40 72 36 C96 30 120 24 144 18 C168 12 192 8 216 4',
    fillPath: 'M0 46 C24 44 48 40 72 36 C96 30 120 24 144 18 C168 12 192 8 216 4 L216 48 L0 48 Z',
  },
] as const;

@Component({
  selector: 'nxt1-time-machine-section',
  standalone: true,
  template: `
    <section class="tm" aria-labelledby="tm-heading">
      <!-- Top bar: Dropdown LEFT  ·  Section header RIGHT -->
      <div class="tm__bar">
        <div class="tm__picker">
          <label for="tm-range-select" class="tm__picker-label">Date Range</label>
          <div class="tm__select-wrap">
            <select
              id="tm-range-select"
              class="tm__select"
              [value]="selectedId()"
              (change)="onSelect($event)"
            >
              @for (opt of options; track opt.id) {
                <option [value]="opt.id">{{ opt.label }}</option>
              }
            </select>
            <svg class="tm__select-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M4.5 6l3.5 4 3.5-4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
          <span class="tm__date-hint" aria-live="polite">{{ active().dateRange }}</span>
        </div>

        <div class="tm__header">
          <h2 id="tm-heading" class="tm__title">The Time Machine</h2>
          <p class="tm__subtitle">Filter every stat by exact dates.</p>
        </div>
      </div>

      <!-- Metrics row + sparkline -->
      <div class="tm__metrics" role="region" aria-label="Key metrics for selected date range">
        <div class="tm__metric">
          <span class="tm__metric-value">{{ active().profileViews }}</span>
          <span class="tm__metric-label">Profile Views</span>
        </div>
        <div class="tm__divider" aria-hidden="true"></div>
        <div class="tm__metric">
          <span class="tm__metric-value">{{ active().videoPlays }}</span>
          <span class="tm__metric-label">Video Plays</span>
        </div>
        <div class="tm__divider" aria-hidden="true"></div>
        <div class="tm__metric">
          <span class="tm__metric-value tm__metric-value--accent">{{ active().engagement }}</span>
          <span class="tm__metric-label">Engagement</span>
        </div>

        <div class="tm__sparkline">
          <svg
            class="tm__spark-svg"
            viewBox="0 0 216 48"
            preserveAspectRatio="none"
            role="img"
            [attr.aria-label]="'Engagement trend for ' + active().label"
          >
            <path class="tm__spark-fill" [attr.d]="active().fillPath" />
            <path class="tm__spark-line" [attr.d]="active().chartPath" />
          </svg>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* ── Section container — canonical section layout ── */
      .tm {
        max-width: var(--nxt1-section-max-width-narrow);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      /* ── Top bar ───────────────────────────────────── */
      .tm__bar {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: var(--nxt1-spacing-4);
        flex-wrap: wrap;
      }

      /* LEFT — date picker */
      .tm__picker {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      .tm__picker-label {
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        white-space: nowrap;
      }

      .tm__select-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
      }

      .tm__select {
        appearance: none;
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-text-primary);
        border-radius: var(--nxt1-borderRadius-lg);
        padding: var(--nxt1-spacing-2) var(--nxt1-spacing-8) var(--nxt1-spacing-2)
          var(--nxt1-spacing-3);
        font-family: var(--nxt1-fontFamily-sans);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;

        &:hover {
          border-color: var(--nxt1-color-border-default);
        }

        &:focus-visible {
          outline: none;
          border-color: var(--nxt1-color-primary);
          box-shadow: 0 0 0 var(--nxt1-spacing-0_5)
            var(--nxt1-color-alpha-primary10, var(--nxt1-color-primary));
        }
      }

      .tm__select-icon {
        position: absolute;
        right: var(--nxt1-spacing-2_5);
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        color: var(--nxt1-color-text-tertiary);
        pointer-events: none;
      }

      .tm__date-hint {
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        white-space: nowrap;
      }

      /* RIGHT — section header */
      .tm__header {
        text-align: right;
      }

      .tm__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .tm__subtitle {
        margin: var(--nxt1-spacing-0_5) 0 0;
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      /* ── Metrics card ──────────────────────────────── */
      .tm__metrics {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        box-shadow: var(--nxt1-shadow-sm);
      }

      .tm__metric {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-0_5);
        min-width: 0;
      }

      .tm__metric-value {
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        white-space: nowrap;
      }

      .tm__metric-value--accent {
        color: var(--nxt1-color-success);
      }

      .tm__metric-label {
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        white-space: nowrap;
      }

      .tm__divider {
        width: 1px;
        align-self: stretch;
        background: var(--nxt1-color-border-subtle);
        flex-shrink: 0;
      }

      /* Sparkline — fills remaining horizontal space */
      .tm__sparkline {
        flex: 1 1 var(--nxt1-spacing-28);
        min-width: var(--nxt1-spacing-20);
        height: var(--nxt1-spacing-12);
      }

      .tm__spark-svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      .tm__spark-fill {
        fill: var(--nxt1-color-alpha-primary10, var(--nxt1-color-surface-200));
      }

      .tm__spark-line {
        fill: none;
        stroke: var(--nxt1-color-primary);
        stroke-width: 2;
        stroke-linecap: round;
      }

      /* ── Responsive ────────────────────────────────── */
      @media (max-width: 768px) {
        .tm {
          padding: var(--nxt1-spacing-10) var(--nxt1-section-padding-x);
        }

        .tm__bar {
          flex-direction: column-reverse;
          align-items: stretch;
          gap: var(--nxt1-spacing-3);
        }

        .tm__header {
          text-align: left;
        }

        .tm__metrics {
          flex-wrap: wrap;
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        }

        .tm__divider {
          display: none;
        }

        .tm__metric {
          flex: 1 1 auto;
          min-width: var(--nxt1-spacing-20);
        }

        .tm__sparkline {
          flex-basis: 100%;
          height: var(--nxt1-spacing-10);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeMachineSectionComponent {
  protected readonly options = TIME_MACHINE_OPTIONS;
  protected readonly selectedId = signal<string>('last-30');

  protected readonly active = computed(() => {
    const id = this.selectedId();
    return this.options.find((o) => o.id === id) ?? this.options[1];
  });

  protected onSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedId.set(value);
  }
}
