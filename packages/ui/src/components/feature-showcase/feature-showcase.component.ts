/**
 * @fileoverview Feature Showcase Component — Feature Grid Section
 * @module @nxt1/ui/components/feature-showcase
 * @version 1.0.0
 *
 * Reusable feature showcase grid for landing and marketing pages.
 * Displays feature cards with icons, titles, and descriptions
 * in a responsive grid (1-col mobile → 2-col tablet → 3-col desktop).
 *
 * 100% design-token styling — zero hardcoded values.
 * SSR-safe, responsive, hover-animated, reduced-motion aware.
 *
 * @example
 * ```html
 * <nxt1-feature-showcase
 *   title="Everything You Need"
 *   subtitle="A complete toolkit for your journey."
 *   [features]="features"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../icon';

// ============================================
// TYPES
// ============================================

/** Individual feature card configuration. */
export interface FeatureShowcaseItem {
  /** Unique identifier. */
  readonly id: string;
  /** Icon name (Ionicons). */
  readonly icon: string;
  /** Feature title. */
  readonly title: string;
  /** Short description. */
  readonly description: string;
}

/** Number of columns for the grid layout. */
export type FeatureShowcaseColumns = 2 | 3;

@Component({
  selector: 'nxt1-feature-showcase',
  standalone: true,
  imports: [CommonModule, NxtIconComponent],
  template: `
    <section class="feature-showcase" [attr.aria-labelledby]="titleId">
      <!-- Header -->
      @if (title()) {
        <div class="showcase-header">
          <h2 [id]="titleId" class="section-title">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="section-subtitle">{{ subtitle() }}</p>
          }
        </div>
      }

      <!-- Feature Grid -->
      <div class="feature-grid" [class.feature-grid--2col]="columns() === 2" role="list">
        @for (feature of features(); track feature.id) {
          <article class="feature-card" role="listitem">
            <div class="feature-icon-wrapper">
              <nxt1-icon [name]="feature.icon" size="24" />
            </div>
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-description">{{ feature.description }}</p>
          </article>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .feature-showcase {
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
      }

      .showcase-header {
        text-align: center;
        margin-bottom: var(--nxt1-spacing-10);
      }

      .section-title {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-3xl);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-3);
      }

      @media (min-width: 768px) {
        .section-title {
          font-size: var(--nxt1-fontSize-4xl);
        }
      }

      .section-subtitle {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        color: var(--nxt1-color-text-secondary);
        max-width: var(--nxt1-section-subtitle-max-width);
        margin: 0 auto;
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      /* Grid */
      .feature-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-4);
      }

      @media (min-width: 576px) {
        .feature-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (min-width: 992px) {
        .feature-grid {
          grid-template-columns: repeat(3, 1fr);
        }

        .feature-grid--2col {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* Cards */
      .feature-card {
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        padding: var(--nxt1-spacing-6);
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          transform var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .feature-card:hover {
        border-color: var(--nxt1-color-alpha-primary30);
        transform: translateY(-2px);
        box-shadow: var(--nxt1-shadow-lg);
      }

      .feature-icon-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .feature-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .feature-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
        margin: 0;
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .feature-card:hover {
          transform: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtFeatureShowcaseComponent {
  /** Section title. */
  readonly title = input<string>('');

  /** Section subtitle. */
  readonly subtitle = input<string>('');

  /** Feature items to display. */
  readonly features = input.required<readonly FeatureShowcaseItem[]>();

  /** Number of columns at desktop breakpoint (default: 3). */
  readonly columns = input<FeatureShowcaseColumns>(3);

  /** Generated ID for the section title (accessibility). */
  protected readonly titleId = `feature-showcase-${Math.random().toString(36).slice(2, 8)}`;
}
