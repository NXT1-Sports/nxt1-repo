/**
 * @fileoverview Limitless Box Section (Future-Proofing)
 * @module apps/web/features/marketing/components/limitless-box-section
 *
 * Shared hero-grade marketing section for Agent X capability storytelling.
 * 100% SSR-safe, semantic, and design-token driven.
 */

import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import {
  AGENT_X_LOGO_PATH,
  AGENT_X_LOGO_POLYGON,
} from '@nxt1/ui/agent-x/fab/agent-x-logo.constants';
import { NxtSectionHeaderComponent } from '@nxt1/ui/components/section-header';

interface FloatingCapability {
  readonly id: string;
  readonly text: string;
  readonly position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface LimitlessBurstNode {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly delay: number;
}

const DEFAULT_FLOATING_CAPABILITIES: readonly FloatingCapability[] = [
  {
    id: 'limitless-item-plan',
    text: 'Write a plan for my recruiting',
    position: 'top-left',
  },
  {
    id: 'limitless-item-film',
    text: 'Analyze my film here.',
    position: 'top-right',
  },
  {
    id: 'limitless-item-contract',
    text: 'Draft a sponsorship contract for a local car dealership.',
    position: 'bottom-left',
  },
  {
    id: 'limitless-item-graphic',
    text: 'Turn my stats into a graphic',
    position: 'bottom-right',
  },
] as const;

const BURST_LABEL_POOL = [
  'Merch',
  'Travel',
  'Legal',
  'Training',
  'Recovery',
  'Nutrition',
  'Brand',
  'Media',
  'Highlights',
  'Scheduling',
  'Contracts',
  'Partnerships',
] as const;

const DEFAULT_BURST_NODE_COUNT = 84;

function createBurstNodes(count: number): readonly LimitlessBurstNode[] {
  return Array.from({ length: count }, (_, index) => {
    const ring = index % 4;
    const radius = 20 + ring * 8 + ((index * 3) % 5);
    const angle = (index / count) * Math.PI * 2;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius * 0.66;

    return {
      id: `limitless-burst-node-${index}`,
      label: BURST_LABEL_POOL[index % BURST_LABEL_POOL.length],
      x,
      y,
      delay: 2200 + (index % 16) * 70,
    } satisfies LimitlessBurstNode;
  });
}

let limitlessBoxInstanceCounter = 0;

@Component({
  selector: 'nxt1-limitless-box-section',
  standalone: true,
  imports: [NxtSectionHeaderComponent],
  template: `
    <section
      class="limitless-box"
      [class.is-visible]="isVisible()"
      [attr.aria-labelledby]="headingId"
    >
      <div class="limitless-box__shell">
        <nxt1-section-header
          [titleId]="headingId"
          eyebrow="The Limitless Box (Future-Proofing)"
          [headingLevel]="2"
          variant="hero"
          align="center"
          layout="stack"
          title="Just Ask."
          subtitle="There is no menu. If you can think it, Agent X can build it."
          support="NXT1 isn't just a recruiting tool. It's a career management engine. It grows with you."
        />

        <div class="limitless-stage" role="group" [attr.aria-labelledby]="promptTitleId">
          <h3 class="sr-only" [id]="promptTitleId">Agent X limitless prompt stage</h3>

          <ul class="floating-capabilities" aria-label="Examples of what Agent X can build">
            @for (item of floatingCapabilities; track item.id) {
              <li [class]="'floating-capability floating-capability--' + item.position">
                <span class="floating-capability__dot" aria-hidden="true"></span>
                <span class="floating-capability__text">{{ item.text }}</span>
              </li>
            }
          </ul>

          <div class="prompt-core" aria-hidden="true">
            <div class="prompt-core__label">
              <svg
                class="prompt-core__agent-logo"
                viewBox="0 0 612 792"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="12"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path [attr.d]="agentXLogoPath" />
                <polygon [attr.points]="agentXLogoPolygon" />
              </svg>
              <span>Agent X Prompt</span>
            </div>

            <div class="prompt-core__window">
              <span class="prompt-core__prefix">&gt;</span>
              <span class="prompt-core__typed">What else do you need?</span>
              <span class="prompt-core__cursor"></span>
            </div>
          </div>

          <div class="burst-cloud" aria-hidden="true">
            @for (node of burstNodes; track node.id) {
              <span
                class="burst-node"
                [style.left.%]="node.x"
                [style.top.%]="node.y"
                [style.animation-delay.ms]="node.delay"
              >
                <span class="burst-node__icon"></span>
                <span class="burst-node__label">{{ node.label }}</span>
              </span>
            }
          </div>
        </div>

        <aside class="limitless-box__insight" [attr.aria-labelledby]="insightTitleId">
          <h3 class="limitless-box__insight-title" [id]="insightTitleId">Key Insight</h3>
          <p class="limitless-box__insight-copy">
            NXT1 isn't just a recruiting tool. It's a career management engine. It grows with you.
          </p>
        </aside>
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .limitless-box {
        max-width: var(--nxt1-section-max-width);
        margin: 0 auto;
        padding: var(--nxt1-section-padding-y) var(--nxt1-section-padding-x);
        background: transparent;
      }

      .limitless-box__shell {
        display: grid;
        gap: var(--nxt1-spacing-6);
      }

      .limitless-stage {
        position: relative;
        isolation: isolate;
        min-height: 32rem;
        border-radius: var(--nxt1-borderRadius-3xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: transparent;
        padding: var(--nxt1-spacing-5);
        overflow: hidden;
      }

      .floating-capabilities {
        position: absolute;
        inset: 0;
        margin: 0;
        padding: 0;
        list-style: none;
      }

      .floating-capability {
        position: absolute;
        max-width: min(30ch, 44vw);
        padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        box-shadow: var(--nxt1-shadow-md);
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        z-index: 1;
        opacity: 0;
        transform: translateY(var(--nxt1-spacing-3));
        transition:
          opacity var(--nxt1-motion-duration-slow, 350ms)
            var(--nxt1-motion-easing-standard, ease-out),
          transform var(--nxt1-motion-duration-slow, 350ms)
            var(--nxt1-motion-easing-standard, ease-out);
      }

      :host .is-visible .floating-capability {
        opacity: 1;
        transform: translateY(0);
        animation: floatOrbit 6s ease-in-out infinite;
      }

      .floating-capability--top-left {
        top: 14%;
        left: 6%;
      }

      :host .is-visible .floating-capability--top-left {
        animation-delay: 0ms;
        transition-delay: 0ms;
      }

      .floating-capability--top-right {
        top: 12%;
        right: 6%;
      }

      :host .is-visible .floating-capability--top-right {
        animation-delay: 220ms;
        transition-delay: 150ms;
      }

      .floating-capability--bottom-left {
        bottom: 15%;
        left: 5%;
      }

      :host .is-visible .floating-capability--bottom-left {
        animation-delay: 420ms;
        transition-delay: 300ms;
      }

      .floating-capability--bottom-right {
        bottom: 13%;
        right: 5%;
      }

      :host .is-visible .floating-capability--bottom-right {
        animation-delay: 640ms;
        transition-delay: 450ms;
      }

      .floating-capability__dot {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .floating-capability__text {
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .prompt-core {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: min(42rem, calc(100% - (var(--nxt1-spacing-8) * 2)));
        display: grid;
        gap: var(--nxt1-spacing-3);
        z-index: 3;
      }

      .prompt-core__label {
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        justify-self: start;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-semibold);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .prompt-core__agent-logo {
        width: var(--nxt1-spacing-4);
        height: var(--nxt1-spacing-4);
        color: var(--nxt1-color-primary);
        flex-shrink: 0;
      }

      .prompt-core__window {
        width: 100%;
        min-height: calc(var(--nxt1-spacing-8) * 2);
        border-radius: var(--nxt1-borderRadius-2xl);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        background: var(--nxt1-color-surface-100);
        box-shadow:
          0 0 0 1px var(--nxt1-color-alpha-primary8),
          var(--nxt1-shadow-lg);
        padding: var(--nxt1-spacing-4) var(--nxt1-spacing-5);
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-2);
        transform: scaleX(0.82);
        opacity: 0.4;
      }

      :host .is-visible .prompt-core__window {
        animation: expandPrompt 900ms ease-out 120ms both;
      }

      .prompt-core__prefix {
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-semibold);
      }

      .prompt-core__typed {
        display: inline-block;
        width: 0;
        overflow: hidden;
        white-space: nowrap;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      :host .is-visible .prompt-core__typed {
        animation: typePrompt 1600ms steps(23, end) 900ms forwards;
      }

      .prompt-core__cursor {
        width: 2px;
        height: var(--nxt1-fontSize-xl);
        background: var(--nxt1-color-primary);
        opacity: 0;
      }

      :host .is-visible .prompt-core__cursor {
        animation:
          cursorReveal 0s linear 2500ms forwards,
          cursorBlink 900ms step-end 2500ms infinite;
      }

      .burst-cloud {
        position: absolute;
        inset: 0;
        z-index: 2;
        pointer-events: none;
      }

      .burst-node {
        position: absolute;
        display: inline-flex;
        align-items: center;
        gap: var(--nxt1-spacing-1);
        transform: translate(-50%, -50%) scale(0.2);
        opacity: 0;
      }

      :host .is-visible .burst-node {
        animation: burstReveal 900ms cubic-bezier(0.18, 0.89, 0.36, 1.2) forwards;
      }

      .burst-node__icon {
        width: var(--nxt1-spacing-2);
        height: var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        background: var(--nxt1-color-primary);
        box-shadow: 0 0 0 2px var(--nxt1-color-alpha-primary10);
        flex-shrink: 0;
      }

      .burst-node__label {
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-2);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--nxt1-color-alpha-primary20);
        background: var(--nxt1-color-surface-200);
        color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-normal);
      }

      .limitless-box__insight {
        display: grid;
        gap: var(--nxt1-spacing-2);
        justify-items: center;
        text-align: center;
      }

      .limitless-box__insight-title {
        margin: 0;
        color: var(--nxt1-color-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: var(--nxt1-fontWeight-semibold);
        line-height: var(--nxt1-lineHeight-normal);
        letter-spacing: var(--nxt1-letterSpacing-wide);
        text-transform: uppercase;
      }

      .limitless-box__insight-copy {
        margin: 0;
        max-width: 70ch;
        color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-fontFamily-body);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: var(--nxt1-fontWeight-medium);
        line-height: var(--nxt1-lineHeight-relaxed);
        text-wrap: pretty;
      }

      @keyframes floatOrbit {
        0%,
        100% {
          transform: translate3d(0, 0, 0);
        }
        50% {
          transform: translate3d(0, calc(var(--nxt1-spacing-2) * -1), 0);
        }
      }

      @keyframes expandPrompt {
        0% {
          transform: scaleX(0.82);
          opacity: 0.4;
        }
        100% {
          transform: scaleX(1);
          opacity: 1;
        }
      }

      @keyframes typePrompt {
        from {
          width: 0;
        }
        to {
          width: 23ch;
        }
      }

      @keyframes cursorReveal {
        to {
          opacity: 1;
        }
      }

      @keyframes cursorBlink {
        0%,
        50% {
          opacity: 1;
        }
        50.01%,
        100% {
          opacity: 0;
        }
      }

      @keyframes burstReveal {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.2);
        }
        to {
          opacity: 0.98;
          transform: translate(-50%, -50%) scale(1);
        }
      }

      @media (max-width: 64rem) {
        .limitless-stage {
          min-height: 36rem;
        }

        .floating-capability {
          max-width: min(30ch, 54vw);
        }

        .floating-capability--top-left {
          top: 8%;
          left: 4%;
        }

        .floating-capability--top-right {
          top: 22%;
          right: 4%;
        }

        .floating-capability--bottom-left {
          bottom: 22%;
          left: 4%;
        }

        .floating-capability--bottom-right {
          bottom: 8%;
          right: 4%;
        }
      }

      @media (max-width: 48rem) {
        .limitless-box__insight-copy {
          font-size: var(--nxt1-fontSize-base);
        }

        .limitless-stage {
          min-height: 40rem;
          padding: var(--nxt1-spacing-4);
        }

        .floating-capability {
          max-width: min(30ch, 74vw);
          padding: var(--nxt1-spacing-2) var(--nxt1-spacing-3);
        }

        .floating-capability--top-left {
          top: 5%;
          left: 50%;
          transform: translateX(-50%);
        }

        .floating-capability--top-right {
          top: 17%;
          right: auto;
          left: 50%;
          transform: translateX(-50%);
        }

        .floating-capability--bottom-left {
          bottom: 20%;
          left: 50%;
          transform: translateX(-50%);
        }

        .floating-capability--bottom-right {
          bottom: 8%;
          right: auto;
          left: 50%;
          transform: translateX(-50%);
        }

        .prompt-core {
          width: calc(100% - (var(--nxt1-spacing-4) * 2));
        }

        .prompt-core__window {
          padding: var(--nxt1-spacing-3) var(--nxt1-spacing-4);
          min-height: calc(var(--nxt1-spacing-7) * 2);
        }

        .prompt-core__prefix,
        .prompt-core__typed {
          font-size: var(--nxt1-fontSize-base);
        }

        .burst-node__label {
          font-size: var(--nxt1-fontSize-2xs);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .floating-capability,
        .prompt-core__window,
        .prompt-core__typed,
        .prompt-core__cursor,
        .burst-node {
          animation: none !important;
          transition: none !important;
        }

        .floating-capability {
          opacity: 1;
          transform: none;
        }

        .prompt-core__window {
          transform: scaleX(1);
          opacity: 1;
        }

        .prompt-core__typed {
          width: auto;
        }

        .prompt-core__cursor {
          opacity: 1;
        }

        .burst-node {
          opacity: 0.92;
          transform: translate(-50%, -50%) scale(1);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NxtLimitlessBoxSectionComponent {
  private readonly elementRef = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isVisible = signal(false);
  protected readonly agentXLogoPath = AGENT_X_LOGO_PATH;
  protected readonly agentXLogoPolygon = AGENT_X_LOGO_POLYGON;

  protected readonly floatingCapabilities: readonly FloatingCapability[] =
    DEFAULT_FLOATING_CAPABILITIES;
  protected readonly burstNodes: readonly LimitlessBurstNode[] =
    createBurstNodes(DEFAULT_BURST_NODE_COUNT);

  private readonly instanceId = ++limitlessBoxInstanceCounter;
  protected readonly headingId = `nxt1-limitless-box-heading-${this.instanceId}`;
  protected readonly promptTitleId = `nxt1-limitless-box-prompt-${this.instanceId}`;
  protected readonly insightTitleId = `nxt1-limitless-box-insight-${this.instanceId}`;

  constructor() {
    afterNextRender(() => {
      const el = this.elementRef.nativeElement as HTMLElement;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            this.isVisible.set(true);
            observer.disconnect();
          }
        },
        { threshold: 0.15 }
      );
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
