/**
 * @fileoverview Coverage Gap Pain Point Section
 * @module @nxt1/ui/components/coverage-gap-pain-point
 *
 * Shared media-coverage section that visualizes the athlete exposure gap.
 * Designed for mobile + desktop, token-driven, SSR-safe, and SEO-friendly.
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface CoverageGapLayer {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly tier: 'top' | 'middle' | 'bottom';
}

const DEFAULT_LAYERS: readonly CoverageGapLayer[] = [
  {
    id: 'coverage-gap-top',
    label: 'ESPN / 247 / On3',
    description: 'They cover the top 100.',
    tier: 'top',
  },
  {
    id: 'coverage-gap-middle',
    label: 'Local News',
    description: 'A 30-second clip, maybe.',
    tier: 'middle',
  },
  {
    id: 'coverage-gap-bottom',
    label: 'NXT1',
    description: 'We cover EVERYONE.',
    tier: 'bottom',
  },
] as const;

let coverageGapInstanceCounter = 0;

@Component({
  selector: 'nxt1-coverage-gap-pain-point',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="coverage-gap" [attr.aria-labelledby]="titleId()">
      <nxt1-section-header
        layout="split"
        contentPosition="end"
        [titleId]="titleId()"
        eyebrow="The Coverage Gap"
        [headingLevel]="2"
        title="ESPN Covers 0.01%."
        accentText=" We Cover You."
        subtitle="Media coverage shouldn't be a privilege for the elite. It should be a right for anyone who competes."
      >
        <figure class="coverage-gap__visual" role="group" [attr.aria-label]="visualLabel()">
          <figcaption class="sr-only">
            Pyramid showing media exposure tiers: national outlets at the tiny top, local news in
            the middle, and NXT1 as the largest foundation covering every athlete.
          </figcaption>

          <ol class="coverage-gap__pyramid" role="list" aria-label="Media coverage tiers">
            @for (layer of layers(); track layer.id) {
              <li
                class="coverage-gap__layer"
                [class.coverage-gap__layer--top]="layer.tier === 'top'"
                [class.coverage-gap__layer--middle]="layer.tier === 'middle'"
                [class.coverage-gap__layer--bottom]="layer.tier === 'bottom'"
              >
                <p class="coverage-gap__brand">{{ layer.label }}</p>
                <p class="coverage-gap__copy">{{ layer.description }}</p>
              </li>
            }
          </ol>
        </figure>
      </nxt1-section-header>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .coverage-gap {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      .coverage-gap__visual {
        margin: 0;
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          to bottom,
          color-mix(in srgb, var(--nxt1-color-surface-200) 86%, transparent),
          var(--nxt1-color-surface-100)
        );
        padding: var(--nxt1-spacing-5);
      }

      .coverage-gap__pyramid {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-2_5);
      }

      .coverage-gap__layer {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-1);
        text-align: center;
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-lg);
        background: var(--nxt1-color-surface-200);
        padding: var(--nxt1-spacing-2_5) var(--nxt1-spacing-4);
      }

      .coverage-gap__layer--top {
        width: min(44%, calc(var(--nxt1-spacing-12) * 3));
      }

      .coverage-gap__layer--middle {
        width: min(68%, calc(var(--nxt1-spacing-12) * 5));
      }

      .coverage-gap__layer--bottom {
        width: 100%;
        background: color-mix(
          in srgb,
          var(--nxt1-color-primary) 20%,
          var(--nxt1-color-surface-200)
        );
        border-color: color-mix(
          in srgb,
          var(--nxt1-color-primary) 52%,
          var(--nxt1-color-border-default)
        );
        box-shadow: var(--nxt1-glow-md);
      }

      .coverage-gap__brand,
      .coverage-gap__copy,
      .coverage-gap__insight {
        margin: 0;
        font-family: var(--nxt1-fontFamily-brand);
      }

      .coverage-gap__brand {
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .coverage-gap__copy {
        color: var(--nxt1-color-text-secondary);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .coverage-gap__layer--bottom .coverage-gap__brand {
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-tight);
      }

      .coverage-gap__layer--bottom .coverage-gap__copy {
        color: var(--nxt1-color-text-primary);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .coverage-gap__insight {
        color: var(--nxt1-color-text-tertiary);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-regular);
        line-height: var(--nxt1-lineHeight-relaxed);
        max-width: var(--nxt1-section-subtitle-max-width, 56rem);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }

      @media (max-width: 991px) {
        .coverage-gap {
          gap: var(--nxt1-spacing-5);
        }

        .coverage-gap__visual {
          padding: var(--nxt1-spacing-4);
        }

        .coverage-gap__layer--top {
          width: 52%;
        }

        .coverage-gap__layer--middle {
          width: 74%;
        }

        .coverage-gap__layer--bottom .coverage-gap__brand {
          font-size: var(--nxt1-fontSize-lg);
        }

        .coverage-gap__layer--bottom .coverage-gap__copy,
        .coverage-gap__insight {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtCoverageGapPainPointComponent {
  private readonly instanceId = ++coverageGapInstanceCounter;

  readonly layers = input<readonly CoverageGapLayer[]>(DEFAULT_LAYERS);
  readonly titleId = computed(() => `coverage-gap-title-${this.instanceId}`);
  readonly visualLabel = computed(
    () => 'Coverage gap pyramid showing media exposure tiers for athletes'
  );
}
