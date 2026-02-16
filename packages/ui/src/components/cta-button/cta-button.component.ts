/**
 * @fileoverview CTA Button Component — Shared Call-to-Action Button
 * @module @nxt1/ui/components/cta-button
 * @version 1.0.0
 *
 * Single source of truth for CTA buttons across the entire app.
 * Renders as `<a>` when a route is provided, `<button>` otherwise.
 * Supports primary/secondary variants and size modifiers.
 *
 * 100% design-token styling — zero hardcoded values.
 * SSR-safe, responsive, reduced-motion aware.
 *
 * @example
 * ```html
 * <!-- Link button -->
 * <nxt1-cta-button
 *   label="Get Started Free"
 *   route="/auth/register"
 *   variant="primary"
 * />
 *
 * <!-- Click button -->
 * <nxt1-cta-button
 *   label="Submit"
 *   variant="primary"
 *   size="lg"
 *   (clicked)="onSubmit()"
 * />
 *
 * <!-- Secondary outline -->
 * <nxt1-cta-button
 *   label="Log In"
 *   route="/auth/login"
 *   variant="secondary"
 * />
 *
 * <!-- Ghost (semi-transparent for glass backgrounds) -->
 * <nxt1-cta-button
 *   label="Explore Platform"
 *   route="/explore"
 *   variant="ghost"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

/** Visual variant for the CTA button. */
export type CtaButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Size modifier for the CTA button. */
export type CtaButtonSize = 'default' | 'lg';

@Component({
  selector: 'nxt1-cta-button',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    @if (route()) {
      <a
        [routerLink]="route()"
        class="nxt1-cta-btn"
        [class.nxt1-cta-btn--primary]="variant() === 'primary'"
        [class.nxt1-cta-btn--secondary]="variant() === 'secondary'"
        [class.nxt1-cta-btn--ghost]="variant() === 'ghost'"
        [class.nxt1-cta-btn--lg]="size() === 'lg'"
        [attr.aria-label]="ariaLabel() || null"
      >
        <ng-container *ngTemplateOutlet="content" />
      </a>
    } @else {
      <button
        class="nxt1-cta-btn"
        [class.nxt1-cta-btn--primary]="variant() === 'primary'"
        [class.nxt1-cta-btn--secondary]="variant() === 'secondary'"
        [class.nxt1-cta-btn--ghost]="variant() === 'ghost'"
        [class.nxt1-cta-btn--lg]="size() === 'lg'"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel() || null"
        (click)="clicked.emit()"
      >
        <ng-container *ngTemplateOutlet="content" />
      </button>
    }

    <ng-template #content>
      <ng-content />
      @if (label()) {
        {{ label() }}
      }
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      /* ============================================
     * BASE — All CTA buttons share this
     * ============================================ */
      .nxt1-cta-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-6);
        border-radius: var(--nxt1-borderRadius-lg);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        text-decoration: none;
        cursor: pointer;
        border: none;
        white-space: nowrap;
        transition:
          background var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .nxt1-cta-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
      }

      /* ============================================
     * PRIMARY — Filled accent button
     * ============================================ */
      .nxt1-cta-btn--primary {
        background: var(--nxt1-color-primary);
        color: var(--nxt1-color-text-onPrimary);
      }

      .nxt1-cta-btn--primary:hover {
        transform: translateY(-1px);
        box-shadow: var(--nxt1-glow-md);
      }

      .nxt1-cta-btn--primary:active {
        transform: translateY(0);
        box-shadow: none;
      }

      /* ============================================
     * SECONDARY — Outlined / surface button
     * ============================================ */
      .nxt1-cta-btn--secondary {
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-primary);
        border: 1px solid var(--nxt1-color-border-default);
      }

      .nxt1-cta-btn--secondary:hover {
        background: var(--nxt1-color-surface-300);
        border-color: var(--nxt1-color-border-subtle);
      }

      .nxt1-cta-btn--secondary:active {
        background: var(--nxt1-color-surface-400);
      }

      /* ============================================
     * GHOST — Semi-transparent for glass backgrounds
     * ============================================ */
      .nxt1-cta-btn--ghost {
        background: color-mix(in srgb, var(--nxt1-color-surface-200) 85%, transparent);
        color: var(--nxt1-color-text-primary);
        border: 1px solid var(--nxt1-color-border-default);
        backdrop-filter: blur(8px);
      }

      .nxt1-cta-btn--ghost:hover {
        background: color-mix(in srgb, var(--nxt1-color-surface-300) 90%, transparent);
        border-color: var(--nxt1-color-border-subtle);
      }

      .nxt1-cta-btn--ghost:active {
        background: color-mix(in srgb, var(--nxt1-color-surface-400) 90%, transparent);
      }

      /* ============================================
     * SIZE MODIFIER — Large
     * ============================================ */
      .nxt1-cta-btn--lg {
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-8);
        font-size: var(--nxt1-fontSize-lg);
      }

      /* ============================================
     * REDUCED MOTION
     * ============================================ */
      @media (prefers-reduced-motion: reduce) {
        .nxt1-cta-btn {
          transition: none;
        }

        .nxt1-cta-btn--primary:hover {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCtaButtonComponent {
  /** Button label text. Can also project content via ng-content. */
  readonly label = input<string>('');

  /** Route to navigate to (renders as <a> with routerLink). */
  readonly route = input<string>('');

  /** Visual variant. */
  readonly variant = input<CtaButtonVariant>('primary');

  /** Size modifier. */
  readonly size = input<CtaButtonSize>('default');

  /** Whether the button is disabled (button mode only). */
  readonly disabled = input<boolean>(false);

  /** Accessible label override. */
  readonly ariaLabel = input<string>('');

  /** Emitted on click (button mode only). */
  readonly clicked = output<void>();
}
