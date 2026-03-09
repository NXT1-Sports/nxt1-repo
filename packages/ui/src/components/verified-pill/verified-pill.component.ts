/**
 * @fileoverview Verified Pill Component
 * @module @nxt1/ui/components/verified-pill
 * @version 1.0.0
 *
 * Compact "Verified" badge pill that can be placed next to any label
 * to indicate a field, profile, or entity has been verified.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nxt1-verified-pill',
  standalone: true,
  template: `<span class="nxt1-pill">{{ label() }}</span>`,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .nxt1-pill {
        display: inline-flex;
        align-items: center;
        padding: 1px var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: color-mix(in srgb, var(--nxt1-color-primary) 15%, transparent);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: 0.02em;
        line-height: var(--nxt1-lineHeight-snug);
        white-space: nowrap;
        user-select: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtVerifiedPillComponent {
  /** Label text displayed inside the pill. Defaults to "Verified". */
  readonly label = input('Verified');
}
