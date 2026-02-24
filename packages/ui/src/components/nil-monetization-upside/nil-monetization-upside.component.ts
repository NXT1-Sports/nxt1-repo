/**
 * @fileoverview NIL & Monetization (The Upside) Shared Section
 * @module @nxt1/ui/components/nil-monetization-upside
 *
 * Marketing section highlighting financial upside for athletes.
 * Includes a campaign generator visual preview and
 * monetization KPI cards.
 *
 * SSR-safe, token-driven, and responsive.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NxtSectionHeaderComponent } from '../section-header';
import type { HeadingLevel } from '../hero-section';

@Component({
  selector: 'nxt1-nil-monetization-upside',
  standalone: true,
  imports: [CommonModule, NxtSectionHeaderComponent],
  template: `
    <section class="nil-upside" aria-labelledby="nil-upside-title">
      <div class="nil-upside__header">
        <nxt1-section-header
          titleId="nil-upside-title"
          [headingLevel]="headingLevel()"
          align="center"
          eyebrow="NIL & Monetization"
          title="Own Your Name."
          accentText="Image. Likeness."
          subtitle="Turn local partnerships into premium athlete-ready campaigns with AI-assisted creative production built for NIL momentum."
        />
      </div>

      <div class="nil-upside__layout">
        <article class="nil-upside__preview" aria-labelledby="nil-preview-title">
          <h3 id="nil-preview-title" class="nil-upside__preview-title">
            Campaign Generator Preview
          </h3>
          <p class="nil-upside__preview-subtitle">
            Sponsor onboarding, campaign planning, and launch execution in one seamless workflow.
          </p>

          <div class="campaign-workspace" aria-label="Campaign generation workflow preview">
            <div class="campaign-sponsor" role="group" aria-label="Sponsor image placeholder">
              <p class="campaign-sponsor__label">Sponsor Brand Input</p>
              <div class="campaign-sponsor__image" aria-label="Sponsor image placeholder">
                <span class="campaign-sponsor__image-badge">Image Placeholder</span>
                <span class="campaign-sponsor__image-mark">HB</span>
              </div>
              <p class="campaign-sponsor__name">Hometown Burger Joint</p>
              <p class="campaign-sponsor__tag">Primary Partner Campaign</p>
            </div>

            <div class="campaign-workflow" role="group" aria-label="Campaign workflow steps">
              <p class="campaign-workflow__label">Campaign Workflow</p>
              <ol class="campaign-workflow__list">
                <li class="campaign-step">
                  <span class="campaign-step__index" aria-hidden="true">01</span>
                  <div class="campaign-step__content">
                    <p class="campaign-step__title">Sponsor Intake & Goal Alignment</p>
                    <p class="campaign-step__description">
                      Capture sponsor objectives, target audience, and campaign KPIs.
                    </p>
                  </div>
                </li>
                <li class="campaign-step">
                  <span class="campaign-step__index" aria-hidden="true">02</span>
                  <div class="campaign-step__content">
                    <p class="campaign-step__title">Creative Direction & Athlete Positioning</p>
                    <p class="campaign-step__description">
                      Build campaign message and visual direction around athlete brand value.
                    </p>
                  </div>
                </li>
                <li class="campaign-step">
                  <span class="campaign-step__index" aria-hidden="true">03</span>
                  <div class="campaign-step__content">
                    <p class="campaign-step__title">Asset Production & Multi-Format Output</p>
                    <p class="campaign-step__description">
                      Generate feed, story, and recruiting variants for consistent distribution.
                    </p>
                  </div>
                </li>
                <li class="campaign-step">
                  <span class="campaign-step__index" aria-hidden="true">04</span>
                  <div class="campaign-step__content">
                    <p class="campaign-step__title">Approval, Launch & Performance Recap</p>
                    <p class="campaign-step__description">
                      Finalize sponsor approvals, launch campaign, and report engagement lift.
                    </p>
                  </div>
                </li>
              </ol>

              <div class="campaign-workflow__deliverables" aria-label="Campaign deliverables">
                <span class="campaign-deliverable">Social Creative</span>
                <span class="campaign-deliverable">Story Assets</span>
                <span class="campaign-deliverable">Recruiting Variant</span>
                <span class="campaign-deliverable">Sponsor Report</span>
              </div>
            </div>
          </div>
        </article>

        <div class="nil-upside__metrics" role="list" aria-label="NIL monetization metrics">
          <article class="metric-card" role="listitem">
            <p class="metric-card__label">Estimated Local Deal Value</p>
            <p class="metric-card__value">$2.5K &#8211; $8K</p>
            <p class="metric-card__context">Per campaign cycle for emerging athletes</p>
          </article>

          <article class="metric-card" role="listitem">
            <p class="metric-card__label">Sponsor Turnaround</p>
            <p class="metric-card__value">&lt; 24 Hours</p>
            <p class="metric-card__context">From brand brief to publish-ready creative</p>
          </article>

          <article class="metric-card" role="listitem">
            <p class="metric-card__label">Cross-Channel Reach</p>
            <p class="metric-card__value">3x Distribution</p>
            <p class="metric-card__context">Single campaign repurposed for web and social</p>
          </article>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .nil-upside {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .nil-upside__header {
        margin-bottom: var(--nxt1-spacing-10);
      }

      .nil-upside__layout {
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      @media (min-width: 992px) {
        .nil-upside__layout {
          grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
          align-items: start;
          gap: var(--nxt1-spacing-8);
        }

        .nil-upside__preview {
          padding: var(--nxt1-spacing-5);
        }
      }

      .nil-upside__preview {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-lg);
        padding: var(--nxt1-spacing-6);
      }

      .nil-upside__preview-title {
        margin: 0 0 var(--nxt1-spacing-4);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-md);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        color: var(--nxt1-color-text-primary);
      }

      .nil-upside__preview-subtitle {
        margin: 0 0 var(--nxt1-spacing-5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      .campaign-workspace {
        display: grid;
        gap: var(--nxt1-spacing-4);
      }

      @media (min-width: 768px) {
        .campaign-workspace {
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
          align-items: start;
          gap: var(--nxt1-spacing-5);
        }
      }

      .campaign-sponsor,
      .campaign-workflow {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-4);
      }

      .campaign-sponsor {
        align-self: start;
      }

      .campaign-sponsor__label,
      .campaign-workflow__label,
      .metric-card__label,
      .campaign-deliverable {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        color: var(--nxt1-color-text-muted);
      }

      .campaign-sponsor__image {
        position: relative;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        margin: var(--nxt1-spacing-3) 0;
        min-height: calc(var(--nxt1-spacing-12) * 2 + var(--nxt1-spacing-4));
        padding: var(--nxt1-spacing-3);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: linear-gradient(
          135deg,
          var(--nxt1-color-alpha-primary10),
          var(--nxt1-color-surface-100)
        );
      }

      .campaign-sponsor__image::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(to right, var(--nxt1-color-alpha-primary20) 1px, transparent 1px),
          linear-gradient(to bottom, var(--nxt1-color-alpha-primary20) 1px, transparent 1px);
        background-size: var(--nxt1-spacing-4) var(--nxt1-spacing-4);
        opacity: 0.45;
      }

      .campaign-sponsor__image-badge {
        position: absolute;
        top: var(--nxt1-spacing-2);
        left: var(--nxt1-spacing-2);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        border-radius: var(--nxt1-borderRadius-full);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-100);
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
        z-index: 1;
      }

      .campaign-sponsor__image-mark {
        position: relative;
        width: calc(var(--nxt1-spacing-12) + var(--nxt1-spacing-3));
        height: calc(var(--nxt1-spacing-12) + var(--nxt1-spacing-3));
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-bold);
        color: var(--nxt1-color-primary);
        background: var(--nxt1-color-surface-100);
        z-index: 1;
      }

      .campaign-sponsor__name {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        color: var(--nxt1-color-text-primary);
      }

      .campaign-sponsor__tag {
        margin: var(--nxt1-spacing-1) 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
        color: var(--nxt1-color-text-secondary);
      }

      .campaign-workflow {
        background: linear-gradient(
          160deg,
          var(--nxt1-color-surface-100),
          var(--nxt1-color-surface-200)
        );
      }

      .campaign-workflow__label {
        margin-bottom: var(--nxt1-spacing-3);
        color: var(--nxt1-color-primary);
      }

      .campaign-workflow__list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .campaign-step {
        border: 1px solid var(--nxt1-color-alpha-primary30);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-3);
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: var(--nxt1-spacing-3);
        align-items: start;
      }

      .campaign-step__index {
        border-radius: var(--nxt1-borderRadius-md);
        border: 1px solid var(--nxt1-color-alpha-primary30);
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        color: var(--nxt1-color-primary);
      }

      .campaign-step__content {
        min-width: 0;
      }

      .campaign-step__title {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
        color: var(--nxt1-color-text-primary);
      }

      .campaign-step__description {
        margin: var(--nxt1-spacing-1) 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      .campaign-workflow__deliverables {
        margin-top: var(--nxt1-spacing-4);
        display: flex;
        flex-wrap: wrap;
        gap: var(--nxt1-spacing-2);
      }

      .campaign-deliverable {
        border: 1px solid var(--nxt1-color-alpha-primary30);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-1_5) var(--nxt1-spacing-2_5);
        color: var(--nxt1-color-primary);
      }

      .metric-card__context {
        margin: var(--nxt1-spacing-2) 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        color: var(--nxt1-color-text-secondary);
      }

      .nil-upside__metrics {
        display: grid;
        gap: var(--nxt1-spacing-4);
        align-content: start;
        grid-auto-rows: min-content;
      }

      .metric-card {
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-100);
        box-shadow: var(--nxt1-shadow-md);
        padding: var(--nxt1-spacing-4);
      }

      @media (min-width: 992px) {
        .nil-upside__metrics {
          gap: var(--nxt1-spacing-3);
        }

        .metric-card {
          padding: var(--nxt1-spacing-3);
        }
      }

      .metric-card__value {
        margin: var(--nxt1-spacing-2) 0 0;
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        color: var(--nxt1-color-text-primary);
      }

      @media (max-width: 575px) {
        .nil-upside__preview {
          padding: var(--nxt1-spacing-3);
        }

        .metric-card {
          padding: var(--nxt1-spacing-3);
        }

        .metric-card__value {
          font-size: var(--nxt1-fontSize-xl);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        * {
          animation: none !important;
          transition: none !important;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtNilMonetizationUpsideComponent {
  /** Semantic heading level (use 2+ when another h1 exists). */
  readonly headingLevel = input<HeadingLevel>(2);
}
