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
      }

      .agent-prompt {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(8px, 1.4vh, 12px);
        width: 100%;
        text-align: center;
        min-height: clamp(260px, 34vh, 320px);
      }

      .agent-prompt--centered {
        margin-inline: auto;
      }

      .agent-prompt-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 5px 12px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        border: 1px solid rgba(38, 220, 255, 0.28);
        background: rgba(6, 200, 255, 0.12);
        color: #29d9ff;
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        animation: promptIn 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .agent-prompt-title-wrap {
        width: 100%;
        min-height: calc(2 * 1.06em + 0.1em);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .agent-prompt-description-wrap {
        width: 100%;
        min-height: calc(2 * 1.4em + 0.1em);
        display: flex;
        align-items: flex-start;
        justify-content: center;
      }

      .agent-prompt-line {
        margin: 0;
        opacity: 0;
        transform: translateY(8px);
        filter: blur(2px);
        animation: lineReveal 560ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .agent-prompt-line--typed {
        overflow: hidden;
        clip-path: inset(0 100% 0 0);
        animation-name: lineReveal, typeReveal;
        animation-duration: 560ms, 820ms;
        animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1), steps(30, end);
        animation-fill-mode: both, both;
      }

      .agent-prompt-line--title {
        font-family: var(--nxt1-fontFamily-brand, var(--nxt1-fontFamily-heading));
        font-size: clamp(1.65rem, 6.2vw, 2.35rem);
        font-weight: 800;
        line-height: 1.06;
        color: var(--nxt1-color-text-primary);
        letter-spacing: -0.02em;
        max-width: 20ch;
        text-wrap: balance;
      }

      .agent-prompt-line--description {
        font-family: var(--nxt1-fontFamily-brand, var(--nxt1-fontFamily-heading));
        font-size: clamp(1rem, 3.8vw, 1.2rem);
        font-weight: 500;
        color: var(--nxt1-color-text-secondary);
        letter-spacing: 0.01em;
        line-height: 1.4;
        max-width: 32ch;
        text-wrap: pretty;
      }

      @keyframes promptIn {
        from {
          opacity: 0;
          transform: translateY(6px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes lineReveal {
        from {
          opacity: 0;
          transform: translateY(8px);
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
