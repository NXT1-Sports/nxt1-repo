/**
 * @fileoverview Agent Onboarding Welcome Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Full-screen welcome step with "Let's Get Your Agent Started" hero
 * and a prominent CTA button. Clean, modern design using design tokens.
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { AgentOnboardingPromptComponent } from './agent-onboarding-prompt.component';

@Component({
  selector: 'nxt1-agent-onboarding-welcome',
  standalone: true,
  imports: [AgentOnboardingPromptComponent],
  template: `
    <section class="welcome-container" [attr.data-testid]="testIds.WELCOME_STEP">
      <nxt1-agent-onboarding-prompt
        [titleText]="'Let us get your agent started.'"
        [descriptionText]="'Hi, I am Agent X.'"
        [titleTestId]="testIds.WELCOME_TITLE"
      />
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .welcome-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: clamp(14px, 2.4vh, 24px);
        min-height: calc(100dvh - 210px);
        padding: clamp(8px, 1.8vh, 18px) var(--nxt1-spacing-md);
        text-align: center;
        position: relative;
        overflow: hidden;
      }

      @media (max-width: 480px) {
        .welcome-container {
          min-height: calc(100dvh - 220px);
          padding: clamp(6px, 1.4vh, 12px) var(--nxt1-spacing-sm);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingWelcomeComponent {
  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;
}
