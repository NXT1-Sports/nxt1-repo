/**
 * @fileoverview "The NCSA/Hudl Killer" Comparison Chart
 * @module apps/web/features/marketing/components/nxt1-killer-comparison
 * @version 1.0.0
 *
 * Shared marketing comparison section for persona landing pages.
 * Uses semantic `<table>` markup for accessibility and SEO, with
 * fully token-driven styling and SSR-safe static rendering.
 *
 * Design constraints:
 * - 100% design-token driven — zero hardcoded colors, fonts, or sizes
 * - SSR-safe — deterministic heading IDs via monotonic counter, no browser APIs
 * - Semantic HTML5 (`<section>`, `<table>`, `<caption>`, `<th scope>`)
 * - Configurable via signal `input()` with sensible defaults
 * - Mobile-first responsive
 *
 * @example
 * ```html
 * <!-- Default usage -->
 * <nxt1-killer-comparison />
 *
 * <!-- Custom rows -->
 * <nxt1-killer-comparison [rows]="customRows" />
 * ```
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

// ============================================
// TYPES
// ============================================

/** A single row in the comparison grid. */
export interface KillerComparisonRow {
  /** Feature category label (used as row header and track key). */
  readonly category: string;
  /** Competitor / legacy platform value (shown in muted column). */
  readonly competitor: string;
  /** NXT1 value (shown in highlighted column). */
  readonly nxt1: string;
}

// ============================================
// DEFAULT DATA
// ============================================

export const KILLER_COMPARISON_DEFAULT_ROWS: readonly KillerComparisonRow[] = [
  {
    category: 'Cost',
    competitor: '$1,000/yr',
    nxt1: 'Free to Start',
  },
  {
    category: 'Data Freshness',
    competitor: 'Manual Updates',
    nxt1: 'Real-Time Sync',
  },
  {
    category: 'Product Experience',
    competitor: 'Clunky App',
    nxt1: 'Agent X AI',
  },
  {
    category: 'Athlete Intelligence',
    competitor: 'No AI',
    nxt1: 'Agent X AI',
  },
  {
    category: 'Athlete Brand Growth',
    competitor: 'No Brand Building',
    nxt1: 'NIL Ready',
  },
  {
    category: 'Trust Signal',
    competitor: 'Unverified Data',
    nxt1: 'Verified Data',
  },
] as const;

/** Monotonic counter for deterministic, SSR-hydration-safe heading IDs. */
let killerComparisonInstanceCounter = 0;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-killer-comparison',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="killer-comparison" [attr.aria-labelledby]="titleId()">
      <div class="killer-comparison__header">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="The NCSA/Hudl Killer"
          align="center"
          [headingLevel]="2"
          title="Stop Paying for 2012 Tech."
          subtitle="A direct side-by-side view of outdated recruiting tools versus the modern NXT1 platform."
        />
      </div>

      <div class="killer-comparison__table-wrapper">
        <table class="killer-comparison__table">
          <caption class="sr-only">
            Comparison chart between legacy recruiting platforms and NXT1 across cost, updates, app
            experience, AI, brand building, and data verification.
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col" class="killer-comparison__legacy-heading">Legacy Platforms</th>
              <th scope="col" class="killer-comparison__nxt1-heading">NXT1</th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.category) {
              <tr>
                <th scope="row">{{ row.category }}</th>
                <td class="killer-comparison__legacy-cell">{{ row.competitor }}</td>
                <td class="killer-comparison__nxt1-cell">{{ row.nxt1 }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <p class="killer-comparison__punchline">Why drive a minivan when you can drive a Tesla?</p>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .killer-comparison {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .killer-comparison__header {
        margin: 0 auto var(--nxt1-spacing-8);
      }

      .killer-comparison__table-wrapper {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        overflow: hidden;
      }

      .killer-comparison__table {
        width: 100%;
        border-collapse: collapse;
      }

      .killer-comparison__table thead th {
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        text-align: left;
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        color: var(--nxt1-color-text-secondary);
        background: var(--nxt1-color-surface-200);
      }

      .killer-comparison__legacy-heading {
        color: var(--nxt1-color-text-muted);
      }

      .killer-comparison__nxt1-heading {
        color: var(--nxt1-color-primary);
      }

      .killer-comparison__table tbody tr {
        border-bottom: 1px solid var(--nxt1-color-border-subtle);
      }

      .killer-comparison__table tbody tr:last-child {
        border-bottom: none;
      }

      .killer-comparison__table tbody th,
      .killer-comparison__table tbody td {
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        vertical-align: middle;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .killer-comparison__table tbody th {
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
      }

      .killer-comparison__legacy-cell {
        color: var(--nxt1-color-text-muted);
        background: var(--nxt1-color-surface-200);
      }

      .killer-comparison__nxt1-cell {
        color: var(--nxt1-color-text-primary);
        font-weight: var(--nxt1-fontWeight-semibold);
        background: var(--nxt1-color-alpha-primary10);
      }

      .killer-comparison__punchline {
        margin: var(--nxt1-spacing-5) 0 0;
        text-align: center;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-style: italic;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      @media (max-width: 767px) {
        .killer-comparison__table thead th,
        .killer-comparison__table tbody th,
        .killer-comparison__table tbody td {
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-3);
        }

        .killer-comparison__table thead th {
          font-size: var(--nxt1-fontSize-xs);
        }

        .killer-comparison__table tbody th,
        .killer-comparison__table tbody td {
          font-size: var(--nxt1-fontSize-xs);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtKillerComparisonComponent {
  private readonly instanceId = ++killerComparisonInstanceCounter;

  /** Comparison rows rendered in the table body. */
  readonly rows = input<readonly KillerComparisonRow[]>(KILLER_COMPARISON_DEFAULT_ROWS);

  /** Deterministic heading ID — SSR-hydration safe via monotonic counter. */
  readonly titleId = computed(() => `killer-comparison-title-${this.instanceId}`);
}
