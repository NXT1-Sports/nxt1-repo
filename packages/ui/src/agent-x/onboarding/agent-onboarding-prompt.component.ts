/**
 * @fileoverview Shared Agent X Prompt Header
 * @module @nxt1/ui/agent-x/onboarding
 *
 * Reusable animated header used across Agent X onboarding steps.
 * Creates a conversational, interview-style feeling with staged text reveal.
 */

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AgentOnboardingOrbComponent } from './agent-onboarding-orb.component';

@Component({
  selector: 'nxt1-agent-onboarding-prompt',
  standalone: true,
  imports: [AgentOnboardingOrbComponent],
  template: `
    <div class="agent-prompt" [class.agent-prompt--centered]="centered()">
      <nxt1-agent-onboarding-orb [size]="orbSize()" />

      <span class="agent-prompt-chip">{{ chipLabel() }}</span>

      <div class="agent-prompt-title-wrap">
        <h2
          class="agent-prompt-line agent-prompt-line--title agent-prompt-line--typed"
          [attr.data-testid]="titleTestId() || null"
          [style.animation-delay]="titleDelay()"
        >
          {{ titleText() }}
        </h2>
      </div>

      <div class="agent-prompt-description-wrap">
        <p
          class="agent-prompt-line agent-prompt-line--description agent-prompt-line--typed"
          [style.animation-delay]="descriptionDelay()"
        >
          {{ descriptionText() }}
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;

        /* Scoped Agent X prompt tokens */
        --_prompt-chip-color: var(--nxt1-color-infoLight, #29d9ff);
        --_prompt-chip-bg: rgba(6, 200, 255, 0.12);
        --_prompt-chip-border: rgba(38, 220, 255, 0.28);
        --_prompt-gap: clamp(var(--nxt1-spacing-2), 1.4vh, var(--nxt1-spacing-3));
        --_prompt-min-h: clamp(260px, 34vh, 320px);
        --_prompt-title-size: clamp(var(--nxt1-fontSize-2xl), 6.2vw, var(--nxt1-fontSize-3xl));
        --_prompt-desc-size: clamp(var(--nxt1-fontSize-base), 3.8vw, var(--nxt1-fontSize-lg));
      }

      .agent-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--_prompt-gap);
        width: 100%;
        text-align: center;
        min-height: var(--_prompt-min-h);
      }

      .agent-prompt--centered {
        margin-inline: auto;
      }

      .agent-prompt-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--nxt1-spacing-1) var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-full);
        border: 1px solid var(--_prompt-chip-border);
        background: var(--_prompt-chip-bg);
        color: var(--_prompt-chip-color);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: var(--nxt1-fontWeight-bold);
        letter-spacing: var(--nxt1-letterSpacing-widest);
        text-transform: uppercase;
        animation: promptIn 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .agent-prompt-title-wrap {
        width: 100%;
        min-height: calc(2 * var(--nxt1-lineHeight-none) * 1em + 0.1em);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .agent-prompt-description-wrap {
        width: 100%;
        min-height: calc(2 * var(--nxt1-lineHeight-snug) * 1em + 0.1em);
        display: flex;
        align-items: flex-start;
        justify-content: center;
      }

      .agent-prompt-line {
        margin: 0;
        opacity: 0;
        transform: translateY(var(--nxt1-spacing-2));
        filter: blur(2px);
        animation: lineReveal var(--nxt1-duration-slower) cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .agent-prompt-line--typed {
        overflow: hidden;
        clip-path: inset(0 100% 0 0);
        animation-name: lineReveal, typeReveal;
        animation-duration: var(--nxt1-duration-slower), 820ms;
        animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1), steps(30, end);
        animation-fill-mode: both, both;
      }

      .agent-prompt-line--title {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_prompt-title-size);
        font-weight: var(--nxt1-fontWeight-bold);
        line-height: var(--nxt1-lineHeight-none);
        color: var(--nxt1-color-text-primary);
        letter-spacing: var(--nxt1-letterSpacing-tight);
        max-width: 20ch;
        text-wrap: balance;
      }

      .agent-prompt-line--description {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--_prompt-desc-size);
        font-weight: var(--nxt1-fontWeight-medium);
        color: var(--nxt1-color-text-secondary);
        letter-spacing: var(--nxt1-letterSpacing-normal);
        line-height: var(--nxt1-lineHeight-snug);
        max-width: 32ch;
        text-wrap: pretty;
      }

      @keyframes promptIn {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-1_5)) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes lineReveal {
        from {
          opacity: 0;
          transform: translateY(var(--nxt1-spacing-2));
          filter: blur(2px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
          filter: blur(0);
        }
      }

      @keyframes typeReveal {
        from {
          clip-path: inset(0 100% 0 0);
        }
        to {
          clip-path: inset(0 0 0 0);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingPromptComponent {
  /** Prompt chip label above text */
  readonly chipLabel = input('Agent X');

  /** Main title sentence */
  readonly titleText = input("Let's get your agent started.");

  /** Supporting description sentence under title */
  readonly descriptionText = input('Hi, I am Agent X.');

  /** Optional test id for title text */
  readonly titleTestId = input('');

  /** Optional centering hint for embedding contexts */
  readonly centered = input(true);

  /** Orb size variant */
  readonly orbSize = input<'md' | 'lg'>('lg');

  /** Animation delay for title line */
  readonly titleDelay = input('120ms');

  /** Animation delay for description line */
  readonly descriptionDelay = input('320ms');
}
