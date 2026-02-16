/**
 * @fileoverview CTA Banner Component — Call-to-Action Section
 * @module @nxt1/ui/components/cta-banner
 * @version 1.0.0
 *
 * Reusable call-to-action banner for landing and marketing pages.
 * Centered card with title, subtitle, and action button.
 * Features a gradient accent border at the top.
 *
 * 100% design-token styling — zero hardcoded values.
 * SSR-safe, responsive, reduced-motion aware.
 *
 * @example
 * ```html
 * <nxt1-cta-banner
 *   title="Ready to Get Started?"
 *   subtitle="Create your free account today."
 *   ctaLabel="Sign Up Free"
 *   ctaRoute="/auth/register"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { NxtCtaButtonComponent } from '../cta-button';

/** Visual variant for the CTA banner. */
export type CtaBannerVariant = 'default' | 'minimal' | 'accent';

@Component({
  selector: 'nxt1-cta-banner',
  standalone: true,
  imports: [CommonModule, RouterModule, NxtCtaButtonComponent],
  template: `
    <section
      class="cta-section"
      [class.cta-section--minimal]="variant() === 'minimal'"
      [class.cta-section--accent]="variant() === 'accent'"
      [attr.aria-labelledby]="titleId"
    >
      <div class="cta-content">
        <h2 [id]="titleId" class="cta-title">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="cta-subtitle">{{ subtitle() }}</p>
        }
        <div class="cta-actions">
          @if (ctaRoute()) {
            <nxt1-cta-button
              [label]="ctaLabel()"
              [route]="ctaRoute()"
              variant="primary"
              size="lg"
            />
          } @else {
            <nxt1-cta-button
              [label]="ctaLabel()"
              variant="primary"
              size="lg"
              (clicked)="ctaClick.emit()"
            />
          }
          @if (secondaryLabel()) {
            @if (secondaryRoute()) {
              <nxt1-cta-button
                [label]="secondaryLabel()"
                [route]="secondaryRoute()"
                variant="secondary"
              />
            } @else {
              <nxt1-cta-button
                [label]="secondaryLabel()"
                variant="secondary"
                (clicked)="secondaryClick.emit()"
              />
            }
          }
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .cta-section {
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .cta-content {
        text-align: center;
        max-width: var(--nxt1-section-subtitle-max-width);
        margin: 0 auto;
        padding: var(--nxt1-spacing-12) var(--nxt1-spacing-6);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        position: relative;
        overflow: hidden;
      }

      .cta-content::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, var(--nxt1-color-primary), transparent);
      }

      .cta-section--minimal .cta-content {
        background: transparent;
        border: none;
        border-radius: 0;
      }

      .cta-section--minimal .cta-content::before {
        display: none;
      }

      .cta-section--accent .cta-content {
        background: var(--nxt1-color-alpha-primary4);
        border-color: var(--nxt1-color-alpha-primary20);
      }

      .cta-title {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-3);
      }

      @media (min-width: 768px) {
        .cta-title {
          font-size: var(--nxt1-fontSize-3xl);
        }
      }

      .cta-subtitle {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        color: var(--nxt1-color-text-secondary);
        margin: 0 0 var(--nxt1-spacing-6);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      .cta-actions {
        display: flex;
        justify-content: center;
        gap: var(--nxt1-spacing-3);
        flex-wrap: wrap;
      }

      @media (prefers-reduced-motion: reduce) {
        .cta-content:hover {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCtaBannerComponent {
  /** CTA title. */
  readonly title = input.required<string>();

  /** CTA subtitle. */
  readonly subtitle = input<string>('');

  /** Primary button label. */
  readonly ctaLabel = input<string>('Sign Up Free');

  /** Primary button route (if link-based). */
  readonly ctaRoute = input<string>('');

  /** Secondary button label (hidden if empty). */
  readonly secondaryLabel = input<string>('');

  /** Secondary button route (if link-based). */
  readonly secondaryRoute = input<string>('');

  /** Visual variant. */
  readonly variant = input<CtaBannerVariant>('default');

  /** Emitted when primary CTA is clicked (button mode). */
  readonly ctaClick = output<void>();

  /** Emitted when secondary button is clicked (button mode). */
  readonly secondaryClick = output<void>();

  /** Generated ID for the section title (accessibility). */
  protected readonly titleId = `cta-banner-${Math.random().toString(36).slice(2, 8)}`;
}
