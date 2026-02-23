/**
 * @fileoverview NxtUnfairAdvantageHeroComponent — AI Athletes Hero Section
 * @module @nxt1/ui/components/unfair-advantage-hero
 *
 * Split-screen hero for AI athlete workflows:
 * - Left panel: Human grind narrative (effort, fatigue, repetition)
 * - Right panel: AI execution narrative (film analysis, messaging, brand output)
 *
 * Uses shared section header and CTA primitives.
 * 100% design-token driven, SSR-safe, and accessibility compliant.
 *
 * @example
 * <nxt1-unfair-advantage-hero
 *   humanImageUrl="/assets/ai-athletes/human-grind.webp"
 *   humanImageAlt="Athlete exhausted after heavy training set"
 *   aiImageUrl="/assets/ai-athletes/ai-brain.webp"
 *   aiImageAlt="AI interface analyzing clips and recruiting emails"
 * />
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NxtAppStoreBadgesComponent } from '../app-store-badges';
import { NxtCtaButtonComponent } from '../cta-button';
import { NxtIconComponent } from '../icon';
import { NxtSectionHeaderComponent, type SectionHeaderLevel } from '../section-header';

@Component({
  selector: 'nxt1-unfair-advantage-hero',
  standalone: true,
  imports: [
    NxtSectionHeaderComponent,
    NxtCtaButtonComponent,
    NxtAppStoreBadgesComponent,
    NxtIconComponent,
  ],
  template: `
    <section class="advantage-hero" [attr.aria-labelledby]="ariaTitleId()">
      <div class="advantage-hero__content">
        <nxt1-section-header
          variant="hero"
          [titleId]="ariaTitleId()"
          [headingLevel]="headingLevel()"
          eyebrow="The Unfair Advantage"
          title="Outwork Everyone. Lift Nothing."
          subtitle="While they sleep, your AI is analyzing film, crafting emails, and building your brand."
        />

        <div class="advantage-hero__actions">
          <nxt1-cta-button
            class="advantage-hero__cta-desktop"
            label="Start Free With NXT1"
            [route]="ctaRoute()"
            variant="primary"
            [ariaLabel]="ctaAriaLabel()"
          />

          <nxt1-app-store-badges class="advantage-hero__cta-mobile" layout="row" />
        </div>
      </div>

      <div
        class="advantage-hero__visual"
        role="img"
        aria-label="Split screen showing human effort and AI execution"
      >
        <article class="advantage-pane advantage-pane--human">
          @if (humanImageUrl()) {
            <img
              class="advantage-pane__image"
              [src]="humanImageUrl()"
              [alt]="humanImageAlt()"
              width="400"
              height="224"
              fetchpriority="high"
              loading="eager"
              decoding="async"
            />
          }

          <header class="advantage-pane__header">
            <span class="advantage-pane__pill">Athlete</span>
            <nxt1-icon name="barbell-outline" size="20" aria-hidden="true" />
          </header>
          <h2 class="advantage-pane__title">The Grind</h2>
          <p class="advantage-pane__copy">
            Long sessions. Heavy legs. Limited hours for film breakdown and outreach.
          </p>
          <p class="advantage-pane__copy">
            You are still manually sorting highlights, writing outreach late, and trying to keep
            your brand active.
          </p>
        </article>

        <article class="advantage-pane advantage-pane--ai">
          @if (aiImageUrl()) {
            <img
              class="advantage-pane__image"
              [src]="aiImageUrl()"
              [alt]="aiImageAlt()"
              width="400"
              height="224"
              fetchpriority="auto"
              loading="eager"
              decoding="async"
            />
          }

          <header class="advantage-pane__header">
            <span class="advantage-pane__pill">AI</span>
            <nxt1-icon name="hardware-chip-outline" size="20" aria-hidden="true" />
          </header>
          <h2 class="advantage-pane__title">The Engine</h2>
          <p class="advantage-pane__copy">
            Instant analysis across clips, coach communication, and digital identity output.
          </p>
          <p class="advantage-pane__copy">
            AI reviews film at scale, drafts recruiting outreach fast, and keeps your personal brand
            moving.
          </p>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .advantage-hero {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-8);
        max-width: var(--nxt1-section-max-width);
        margin-inline: auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      @media (min-width: 1024px) {
        .advantage-hero {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: center;
          gap: var(--nxt1-spacing-10);
        }
      }

      .advantage-hero__content {
        display: grid;
        gap: var(--nxt1-spacing-5);
      }

      .advantage-hero__actions {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
      }

      .advantage-hero__cta-desktop {
        display: none;
      }

      .advantage-hero__cta-mobile {
        display: inline-flex;
      }

      @media (min-width: 1024px) {
        .advantage-hero__cta-desktop {
          display: inline-flex;
        }

        .advantage-hero__cta-mobile {
          display: none;
        }
      }

      @media (max-width: 767px) {
        .advantage-hero__content {
          text-align: center;
        }

        .advantage-hero__actions {
          justify-content: center;
        }

        .advantage-hero__content ::ng-deep .section-header {
          justify-items: center;
          text-align: center;
        }

        .advantage-hero__content ::ng-deep .section-header__text {
          justify-items: center;
          text-align: center;
        }
      }

      .advantage-hero__visual {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--nxt1-spacing-4);
      }

      @media (min-width: 768px) {
        .advantage-hero__visual {
          grid-template-columns: 1fr 1fr;
        }
      }

      .advantage-pane {
        display: grid;
        align-content: start;
        gap: var(--nxt1-spacing-3);
        min-height: var(--nxt1-spacing-80);
        padding: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-200);
      }

      .advantage-pane__image {
        display: block;
        width: 100%;
        min-height: var(--nxt1-spacing-56);
        height: auto;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background-color: var(--nxt1-color-surface-300);
        object-fit: cover;
        object-position: center;
      }

      .advantage-pane--human {
        background:
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--nxt1-color-surface-300) 82%, transparent),
            color-mix(in srgb, var(--nxt1-color-surface-200) 86%, transparent)
          ),
          var(--nxt1-color-surface-200);
      }

      .advantage-pane--ai {
        background:
          linear-gradient(
            160deg,
            color-mix(in srgb, var(--nxt1-color-primary) 14%, transparent),
            color-mix(in srgb, var(--nxt1-color-surface-200) 88%, transparent)
          ),
          var(--nxt1-color-surface-200);
      }

      .advantage-pane__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--nxt1-spacing-2);
        color: var(--nxt1-color-text-secondary);
      }

      .advantage-pane__pill {
        display: inline-flex;
        align-items: center;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2_5);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-default);
        background: color-mix(in srgb, var(--nxt1-color-surface-100) 72%, transparent);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-2xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .advantage-pane__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .advantage-pane__copy {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
      }

      @media (prefers-reduced-motion: reduce) {
        .advantage-pane {
          transition: none;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtUnfairAdvantageHeroComponent {
  readonly headingLevel = input<SectionHeaderLevel>(1);
  readonly ariaTitleId = input<string>('ai-athletes-unfair-advantage-title');
  readonly ctaRoute = input<string>('/auth');
  readonly ctaAriaLabel = input<string>('Start free with NXT1');
  readonly humanImageUrl = input<string>('');
  readonly humanImageAlt = input<string>('Exhausted athlete training in the gym');
  readonly aiImageUrl = input<string>('');
  readonly aiImageAlt = input<string>('Digital AI brain processing recruiting data');
}
