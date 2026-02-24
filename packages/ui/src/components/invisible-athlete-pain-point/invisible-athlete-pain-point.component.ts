/**
 * @fileoverview Invisible Athlete Pain Point Section
 * @module @nxt1/ui/components/invisible-athlete-pain-point
 * @version 1.0.0
 *
 * Shared marketing section for athlete persona surfaces.
 * Communicates the recruiting visibility problem using
 * a structured pain-point visual and data-backed pivot.
 *
 * Design constraints:
 * - 100% design-token driven styles
 * - SSR-safe deterministic ids and static content
 * - Semantic HTML5 for strong SEO parsing
 * - Mobile-first responsive layout
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

export interface InvisibleAthleteSignal {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

const DEFAULT_SIGNALS: readonly InvisibleAthleteSignal[] = [
  {
    id: 'signal-stats',
    label: 'Stats',
    value: 'Unknown',
  },
  {
    id: 'signal-film',
    label: 'Film',
    value: 'Missing',
  },
  {
    id: 'signal-contact',
    label: 'Contact',
    value: 'Dead Link',
  },
] as const;

let invisibleAthleteInstanceCounter = 0;

@Component({
  selector: 'nxt1-invisible-athlete-pain-point',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="invisible-athlete" [attr.aria-labelledby]="titleId()">
      <nxt1-section-header
        layout="split"
        contentPosition="start"
        [titleId]="titleId()"
        eyebrow="The Invisible Athlete"
        [headingLevel]="2"
        title="If They Can't Find You,"
        accentText=" They Can't Sign You."
        subtitle="Stop relying on luck. 80% of recruiting happens online before a coach ever steps on your campus."
        support="Most athletes are talented. Most athletes are still invisible. Visibility is the first step to getting evaluated."
      >
        <figure class="invisible-athlete__graphic" [attr.aria-label]="graphicLabel()">
          <figcaption class="sr-only">
            Recruiting profile health showing missing information for an invisible athlete profile.
          </figcaption>

          <div class="ghost-stage" aria-hidden="true">
            <div class="ghost-silhouette" role="presentation">
              <span class="ghost-silhouette__head"></span>
              <span class="ghost-silhouette__body"></span>
            </div>
          </div>

          <ul class="signal-list" role="list" aria-label="Recruiting profile signal status">
            @for (signal of signals(); track signal.id) {
              <li class="signal-item" role="listitem">
                <span class="signal-item__label">{{ signal.label }}:</span>
                <strong class="signal-item__value">{{ signal.value }}</strong>
              </li>
            }
          </ul>
        </figure>
      </nxt1-section-header>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .invisible-athlete {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .invisible-athlete__graphic {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-5);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: linear-gradient(
          to bottom,
          var(--nxt1-color-surface-200),
          var(--nxt1-color-surface-100)
        );
        padding: var(--nxt1-spacing-6);
      }

      .ghost-stage {
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-secondary, var(--nxt1-color-border-subtle));
        background: var(--nxt1-color-surface-50, var(--nxt1-color-surface-100));
        min-height: calc(var(--nxt1-spacing-12) * 4);
        padding: var(--nxt1-spacing-6);
      }

      .ghost-silhouette {
        display: grid;
        justify-items: center;
        gap: var(--nxt1-spacing-2);
      }

      .ghost-silhouette__head {
        display: block;
        width: var(--nxt1-spacing-12);
        height: var(--nxt1-spacing-12);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-text-tertiary);
        opacity: 0.7;
      }

      .ghost-silhouette__body {
        display: block;
        width: calc(var(--nxt1-spacing-12) * 2);
        height: calc(var(--nxt1-spacing-12) * 2);
        border-radius: var(--nxt1-borderRadius-2xl);
        background: var(--nxt1-color-text-tertiary);
        opacity: 0.5;
      }

      .signal-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: var(--nxt1-spacing-3);
      }

      .signal-item {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
      }

      .signal-item__label {
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .signal-item__value {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        letter-spacing: var(--nxt1-letterSpacing-tight);
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
        .invisible-athlete__graphic {
          padding: var(--nxt1-spacing-5);
        }

        .signal-item__value {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtInvisibleAthletePainPointComponent {
  private readonly instanceId = ++invisibleAthleteInstanceCounter;

  readonly titleId = computed(() => `invisible-athlete-title-${this.instanceId}`);
  readonly graphicLabel = computed(
    () => `Invisible athlete profile diagnostics ${this.instanceId}`
  );
  readonly signals = input<readonly InvisibleAthleteSignal[]>(DEFAULT_SIGNALS);
}
