/**
 * @fileoverview Audience Section Component — Role-Based Cards
 * @module @nxt1/ui/components/audience-section
 * @version 1.0.0
 *
 * Reusable audience/role segmentation section for landing pages.
 * Shows cards targeting different user types (athletes, coaches, parents, etc.).
 *
 * 100% design-token styling — zero hardcoded values.
 * SSR-safe, responsive, hover-animated, reduced-motion aware.
 *
 * @example
 * ```html
 * <nxt1-audience-section
 *   title="Built for Every Role"
 *   subtitle="Whether you're an athlete or coach."
 *   [segments]="segments"
 * />
 * ```
 */

import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtIconComponent } from '../icon';
import { NxtSectionHeaderComponent } from '../section-header';

// ============================================
// TYPES
// ============================================

/** Individual audience segment card. */
export interface AudienceSegment {
  /** Unique identifier. */
  readonly id: string;
  /** Audience title (e.g., 'Athletes'). */
  readonly title: string;
  /** Short description of the benefit. */
  readonly description: string;
  /** Icon name (Ionicons). */
  readonly icon: string;
}

@Component({
  selector: 'nxt1-audience-section',
  standalone: true,
  imports: [CommonModule, NxtIconComponent, NxtSectionHeaderComponent],
  template: `
    <section class="audience-section" [attr.aria-labelledby]="titleId">
      <!-- Header -->
      @if (title()) {
        <div class="audience-header">
          <nxt1-section-header
            [titleId]="titleId"
            [title]="title()"
            [subtitle]="subtitle()"
            align="center"
          />
        </div>
      }

      <!-- Segment Cards -->
      <div class="audience-grid" role="list">
        @for (segment of segments(); track segment.id) {
          <div class="audience-card" role="listitem">
            <div class="audience-icon-wrapper">
              <nxt1-icon [name]="segment.icon" size="28" />
            </div>
            <h3 class="audience-title">{{ segment.title }}</h3>
            <p class="audience-description">{{ segment.description }}</p>
          </div>
        }
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .audience-section {
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
      }

      .audience-header {
        margin-bottom: var(--nxt1-spacing-10);
      }

      /* Grid */
      .audience-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-4);
      }

      @media (min-width: 768px) {
        .audience-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      /* Cards */
      .audience-card {
        text-align: center;
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        padding: var(--nxt1-spacing-8) var(--nxt1-spacing-6);
        transition:
          border-color var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut),
          box-shadow var(--nxt1-motion-duration-fast) var(--nxt1-motion-easing-inOut);
      }

      .audience-card:hover {
        border-color: var(--nxt1-color-alpha-primary20);
        box-shadow: var(--nxt1-shadow-md);
      }

      .audience-icon-wrapper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--nxt1-spacing-14);
        height: var(--nxt1-spacing-14);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-alpha-primary10);
        color: var(--nxt1-color-primary);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .audience-title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-2);
      }

      .audience-description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        color: var(--nxt1-color-text-secondary);
        line-height: var(--nxt1-lineHeight-relaxed);
        margin: 0;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtAudienceSectionComponent {
  /** Section title. */
  readonly title = input<string>('');

  /** Section subtitle. */
  readonly subtitle = input<string>('');

  /** Audience segments to display. */
  readonly segments = input.required<readonly AudienceSegment[]>();

  /** Generated ID for the section title (accessibility). */
  protected readonly titleId = `audience-section-${Math.random().toString(36).slice(2, 8)}`;
}
