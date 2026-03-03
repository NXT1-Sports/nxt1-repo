/**
 * @fileoverview NxtEntityPageHeaderComponent — Shared Layout Shell
 * @module @nxt1/ui/components/entity-page-header
 * @version 1.0.0
 *
 * Structural layout component for all entity-level page headers
 * (athlete profile, team profile, college, organization, etc.).
 *
 * Owns the flex row structure, back button, and spacing. Consumers
 * project variant-specific content into named slots:
 *
 * - `[headerIdentity]` — Identity block (name, logo, subtitle)
 * - `[headerTrailing]`  — Trailing content (badges, XP ring, follow button)
 *
 * ⭐ SHARED BETWEEN ALL ENTITY PAGES — single source for layout ⭐
 *
 * Design principle: the structural CSS (row flex, gap, padding,
 * alignment) lives HERE. Each consuming header only styles its own
 * domain-specific projected content (badges, logos, follow buttons).
 *
 * @example
 * ```html
 * <!-- Athlete profile -->
 * <nxt1-entity-page-header (back)="goBack()">
 *   <div headerIdentity>
 *     <span class="name">John Keller</span>
 *   </div>
 *   <div headerTrailing>
 *     <div class="badges">...</div>
 *     <div class="xp-ring">...</div>
 *   </div>
 * </nxt1-entity-page-header>
 *
 * <!-- Team profile -->
 * <nxt1-entity-page-header backAriaLabel="Back to search" (back)="goBack()">
 *   <div headerIdentity>
 *     <img [src]="logo" />
 *     <h1>Lincoln HS Football</h1>
 *   </div>
 *   <div headerTrailing>
 *     <button class="follow-btn">Follow</button>
 *   </div>
 * </nxt1-entity-page-header>
 * ```
 */
import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { NxtBackButtonComponent } from '../back-button';

@Component({
  selector: 'nxt1-entity-page-header',
  standalone: true,
  imports: [NxtBackButtonComponent],
  template: `
    <header class="eph" role="banner">
      <div class="eph-row">
        <!-- Back Button — shared across all entity headers -->
        <nxt1-back-button
          class="eph-back"
          size="md"
          variant="ghost"
          [ariaLabel]="backAriaLabel()"
          (backClick)="back.emit()"
        />

        <!-- Identity Slot — name / logo / subtitle (consumer-provided) -->
        <div class="eph-identity">
          <ng-content select="[headerIdentity]" />
        </div>

        <!-- Trailing Slot — projected directly into the flex row.
             Consumer's [headerTrailing] element becomes a flex item.
             Consumer is responsible for its own internal layout (flex, grid, etc.). -->
        <ng-content select="[headerTrailing]" />
      </div>
    </header>
  `,
  styles: [
    `
      /* ============================================
         HOST
         ============================================ */
      :host {
        display: block;
      }

      /* ============================================
         ROOT — no bottom margin; shell spacing handles gaps
         ============================================ */
      .eph {
        margin-bottom: 0;
      }

      /* ============================================
         ROW LAYOUT — single-axis flex row
         Matches the athlete profile header exactly.
         All entity headers share this structure:
         [Back] [Identity ··· flex:1 ···] [Trailing]
         ============================================ */
      .eph-row {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        padding: 0 var(--nxt1-spacing-1);
      }

      /* ============================================
         BACK BUTTON — fixed-size, no shrink
         ============================================ */
      .eph-back {
        flex-shrink: 0;
      }

      /* ============================================
         IDENTITY — fills remaining horizontal space
         ============================================ */
      .eph-identity {
        flex: 1;
        min-width: 0;
      }

      /* ============================================
         RESPONSIVE — tighter gap on narrow widths
         ============================================ */
      @media (max-width: 900px) {
        .eph-row {
          gap: var(--nxt1-spacing-2);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtEntityPageHeaderComponent {
  /** Accessible label for the back button. */
  readonly backAriaLabel = input('Go back');

  /** Emits when the back button is clicked. */
  readonly back = output<void>();
}
