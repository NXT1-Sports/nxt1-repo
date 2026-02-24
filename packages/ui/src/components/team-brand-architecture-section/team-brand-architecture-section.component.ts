/**
 * @fileoverview Team Brand Architecture Section — Program/AD Marketing Block
 * @module @nxt1/ui/components/team-brand-architecture-section
 * @version 1.2.0
 *
 * Shared section used on Agent X landing surfaces to communicate how schools
 * can generate a unified brand system across every sport from simple prompts.
 *
 * Standards:
 * - 100% design-token driven styling
 * - SSR-safe deterministic heading IDs via monotonic counter
 * - Semantic HTML5 (`section`, `article`, `figure`, `figcaption`, `blockquote`, `ul`)
 * - Mobile-first responsive layout
 * - Configurable via signal `input()` with sensible defaults
 * - Sequential prompt-to-output animation with reduced-motion support
 *
 * @example
 * ```html
 * <!-- Default usage -->
 * <nxt1-team-brand-architecture-section />
 *
 * <!-- Custom output cards -->
 * <nxt1-team-brand-architecture-section
 *   [outputCards]="customCards"
 *   hookQuote="Custom hook message."
 * />
 * ```
 */

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NxtSectionHeaderComponent } from '../section-header';

// ============================================
// TYPES
// ============================================

/** A single output card in the unified creative pipeline. */
export interface BrandPipelineOutputCard {
  /** Stable unique id for `@for` tracking and SSR hydration. */
  readonly id: string;
  /** Prompt shown above the generated output placeholder. */
  readonly prompt: string;
  /** Content placeholder title shown inside the square canvas. */
  readonly placeholderTitle: string;
}

/** Backwards-compatible export alias from v1.1.0. */
export type BrandPipelineStep = BrandPipelineOutputCard;

// ============================================
// DEFAULT DATA
// ============================================

const DEFAULT_OUTPUT_CARDS: readonly BrandPipelineOutputCard[] = [
  {
    id: 'output-gameday',
    prompt: 'Create a football gameday post in team colors.',
    placeholderTitle: 'Gameday Graphic',
  },
  {
    id: 'output-schedule',
    prompt: 'Build a clean season schedule layout for social.',
    placeholderTitle: 'Schedule Poster',
  },
  {
    id: 'output-commitment',
    prompt: 'Design a commitment announcement with logo lockup.',
    placeholderTitle: 'Commitment Edit',
  },
  {
    id: 'output-fundraising',
    prompt: 'Generate a branded fundraising campaign flyer.',
    placeholderTitle: 'Fundraising Flyer',
  },
] as const;

const DEFAULT_HOOK_QUOTE = 'Your school looks like a D1 program in 5 seconds.';

/** Monotonic counter for deterministic SSR-safe IDs. */
let teamBrandArchitectureInstanceCounter = 0;

// ============================================
// COMPONENT
// ============================================

@Component({
  selector: 'nxt1-team-brand-architecture-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section class="team-brand-section" [attr.aria-labelledby]="titleId()">
      <div class="team-brand-shell">
        <nxt1-section-header
          [titleId]="titleId()"
          eyebrow="For Programs & Athletic Directors"
          title="One Identity."
          accentText="Infinite Assets."
          [headingLevel]="2"
          variant="hero"
          subtitle="Scale a unified look across your entire athletic program without hiring an agency."
          support="Use quick prompts to generate polished, consistent creative for every sport in your program."
        />

        <article class="brand-kit-card" [attr.aria-labelledby]="cardTitleId()">
          <header class="brand-kit-card__header">
            <p class="brand-kit-card__eyebrow">Brand Kit Integration</p>
            <h3 class="brand-kit-card__title" [id]="cardTitleId()">Unified Creative Pipeline</h3>
          </header>

          <ul class="brand-output-grid" role="list" aria-label="Four generated creative outputs">
            @for (card of outputCards(); track card.id; let i = $index) {
              <li class="output-item" [style.--output-index]="i">
                <article class="output-card" [attr.aria-label]="card.placeholderTitle">
                  <p class="output-card__prompt">{{ card.prompt }}</p>

                  <div class="output-card__canvas" aria-hidden="true">
                    <div class="output-card__canvas-glow"></div>
                    <p class="output-card__canvas-title">{{ card.placeholderTitle }}</p>
                  </div>
                </article>
              </li>
            }
          </ul>

          <figure class="brand-proof" [attr.aria-labelledby]="hookLabelId()">
            <figcaption class="brand-proof__label" [id]="hookLabelId()">The Hook</figcaption>
            <blockquote class="brand-proof__quote">
              {{ hookQuote() }}
            </blockquote>
          </figure>
        </article>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .team-brand-section {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
      }

      .team-brand-shell {
        display: grid;
        gap: var(--nxt1-spacing-7);
      }

      .brand-kit-card {
        display: grid;
        gap: var(--nxt1-spacing-6);
        padding: var(--nxt1-spacing-6);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-2xl);
        background: var(--nxt1-color-surface-100);
      }

      .brand-kit-card__header {
        display: grid;
        gap: var(--nxt1-spacing-2);
      }

      .brand-kit-card__eyebrow {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .brand-kit-card__title {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-xl);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-tight);
      }

      .brand-output-grid {
        --nxt1-pipeline-step-duration: 2.8s;
        --nxt1-pipeline-cycle-duration: 11.2s;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--nxt1-spacing-4);
        margin: 0;
        padding: 0;
        list-style: none;
        align-items: stretch;
      }

      .output-item {
        min-width: 0;
      }

      .output-card {
        display: grid;
        gap: var(--nxt1-spacing-3);
        padding: var(--nxt1-spacing-4);
        border: 1px solid var(--nxt1-color-border-subtle);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-surface-200);
        animation: nxt1-output-card-active var(--nxt1-pipeline-cycle-duration) ease-in-out infinite;
        animation-delay: calc(var(--output-index, 0) * var(--nxt1-pipeline-step-duration));
      }

      .output-card__prompt {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-relaxed);
        animation: nxt1-output-prompt-active var(--nxt1-pipeline-cycle-duration) ease-in-out
          infinite;
        animation-delay: calc(var(--output-index, 0) * var(--nxt1-pipeline-step-duration));
      }

      .output-card__canvas {
        position: relative;
        overflow: hidden;
        aspect-ratio: 1 / 1;
        margin: 0;
        border-radius: var(--nxt1-borderRadius-lg);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-100);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: nxt1-output-canvas-active var(--nxt1-pipeline-cycle-duration) ease-in-out
          infinite;
        animation-delay: calc(var(--output-index, 0) * var(--nxt1-pipeline-step-duration));
      }

      .output-card__canvas-glow {
        position: absolute;
        inset: auto;
        width: 55%;
        height: 55%;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: radial-gradient(circle, var(--nxt1-color-alpha-primary20) 0%, transparent 70%);
        opacity: 0;
        transform: scale(0.88);
        animation: nxt1-output-canvas-glow var(--nxt1-pipeline-cycle-duration) ease-in-out infinite;
        animation-delay: calc(var(--output-index, 0) * var(--nxt1-pipeline-step-duration));
        transition:
          opacity var(--nxt1-motion-duration-normal, 300ms) var(--nxt1-motion-easing-default, ease),
          transform var(--nxt1-motion-duration-normal, 300ms)
            var(--nxt1-motion-easing-default, ease);
      }

      .output-card__canvas-title {
        position: relative;
        z-index: 1;
        margin: 0;
        color: var(--nxt1-color-text-tertiary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-base);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-tight);
        text-align: center;
      }

      .brand-proof {
        margin: 0;
        display: grid;
        gap: var(--nxt1-spacing-2);
        padding: var(--nxt1-spacing-4);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        border-radius: var(--nxt1-borderRadius-xl);
        background: var(--nxt1-color-alpha-primary4);
      }

      .brand-proof__label {
        margin: 0;
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .brand-proof__quote {
        margin: 0;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-display);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-snug);
      }

      @keyframes nxt1-output-card-active {
        0%,
        100% {
          border-color: var(--nxt1-color-border-subtle);
          box-shadow: none;
        }

        14%,
        34% {
          border-color: var(--nxt1-color-alpha-primary30);
          box-shadow: 0 0 0 1px var(--nxt1-color-alpha-primary20);
        }
      }

      @keyframes nxt1-output-prompt-active {
        0%,
        8%,
        100% {
          color: var(--nxt1-color-text-secondary);
          opacity: 0.74;
        }

        14%,
        24% {
          color: var(--nxt1-color-primary);
          opacity: 1;
        }
      }

      @keyframes nxt1-output-canvas-active {
        0%,
        18%,
        100% {
          border-color: var(--nxt1-color-border-subtle);
          background: var(--nxt1-color-surface-100);
        }

        24%,
        38% {
          border-color: var(--nxt1-color-alpha-primary30);
          background: var(--nxt1-color-alpha-primary4);
        }
      }

      @keyframes nxt1-output-canvas-glow {
        0%,
        22%,
        100% {
          opacity: 0;
          transform: scale(0.88);
        }

        28%,
        38% {
          opacity: 1;
          transform: scale(1);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .output-card,
        .output-card__prompt,
        .output-card__canvas,
        .output-card__canvas-glow {
          animation: none;
        }

        .output-card__prompt {
          opacity: 1;
        }
      }

      @media (min-width: 768px) {
        .brand-output-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--nxt1-spacing-4);
        }

        .brand-kit-card__title {
          font-size: var(--nxt1-fontSize-2xl);
        }

        .brand-proof__quote {
          font-size: var(--nxt1-fontSize-xl);
        }
      }

      @media (min-width: 1200px) {
        .brand-output-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
      }

      @media (max-width: 767px) {
        .brand-kit-card {
          padding: var(--nxt1-spacing-5);
        }

        .output-card__canvas-title {
          font-size: var(--nxt1-fontSize-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtTeamBrandArchitectureSectionComponent {
  private readonly instanceId = ++teamBrandArchitectureInstanceCounter;

  /** Output cards shown in the unified creative pipeline. */
  readonly outputCards = input<readonly BrandPipelineOutputCard[]>(DEFAULT_OUTPUT_CARDS);

  /** Short persuasion quote shown in the hook callout. */
  readonly hookQuote = input<string>(DEFAULT_HOOK_QUOTE);

  readonly titleId = computed(() => `team-brand-architecture-title-${this.instanceId}`);
  readonly cardTitleId = computed(() => `team-brand-architecture-card-title-${this.instanceId}`);
  readonly hookLabelId = computed(() => `team-brand-architecture-hook-label-${this.instanceId}`);
}
