/**
 * @fileoverview Agent Onboarding Welcome Step
 * @module @nxt1/ui/agent-x/onboarding
 * @version 1.0.0
 *
 * Full-screen welcome step with "Let's Get Your Agent Started" hero
 * and a prominent CTA button. Clean, modern design using design tokens.
 */

import { Component, ChangeDetectionStrategy, output } from '@angular/core';
import { TEST_IDS } from '@nxt1/core/testing';
import { OnboardingNavigationButtonsComponent } from '../../onboarding/onboarding-navigation-buttons/onboarding-navigation-buttons.component';
import { AgentOnboardingOrbComponent } from './agent-onboarding-orb.component';

@Component({
  selector: 'nxt1-agent-onboarding-welcome',
  standalone: true,
  imports: [OnboardingNavigationButtonsComponent, AgentOnboardingOrbComponent],
  template: `
    <section class="welcome-container" [attr.data-testid]="testIds.WELCOME_STEP">
      <!-- Animated Agent X orb (shared component, size variant) -->
      <nxt1-agent-onboarding-orb size="lg" />

      <!-- Hero content -->
      <div class="welcome-content">
        <span class="welcome-badge">Agent X</span>
        <h1 class="welcome-title" [attr.data-testid]="testIds.WELCOME_TITLE">
          Let's Get Your<br />Agent Started
        </h1>
        <p class="welcome-subtitle">
          Your AI-powered command center is ready. Agent X will learn your goals and help you
          succeed.
        </p>
      </div>

      <div class="welcome-cta-row" [attr.data-testid]="testIds.WELCOME_CTA">
        <nxt1-onboarding-navigation-buttons
          [continueText]="'Get Started'"
          [continueTestId]="testIds.WELCOME_CTA"
          [compact]="true"
          [mobileLayout]="'row'"
          (continueClick)="start.emit()"
        />
      </div>
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
        gap: clamp(12px, 2.2vh, 22px);
        min-height: 62vh;
        padding: var(--nxt1-spacing-lg) var(--nxt1-spacing-md);
        text-align: center;
        position: relative;
        overflow: hidden;
      }

      /* Content */
      .welcome-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: var(--nxt1-borderRadius-full, 9999px);
        background: rgba(204, 255, 0, 0.1);
        color: var(--nxt1-color-primary);
        font-size: var(--nxt1-fontSize-xs, 12px);
        font-weight: 600;
        text-transform: none;
        letter-spacing: 1.2px;
        margin: 0;
      }

      .welcome-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(8px, 1.5vh, 14px);
        max-width: 420px;
        margin: 0;
      }

      .welcome-title {
        font-family: var(--nxt1-fontFamily-brand, var(--nxt1-fontFamily-heading));
        font-size: clamp(1.55rem, 6vw, 2.2rem);
        font-weight: 800;
        line-height: 1.06;
        color: var(--nxt1-color-text-primary);
        margin: 0;
        letter-spacing: -0.02em;
      }

      .welcome-subtitle {
        font-size: var(--nxt1-fontSize-sm, 15px);
        line-height: 1.5;
        color: var(--nxt1-color-text-secondary);
        margin: 0;
        max-width: 360px;
      }

      .welcome-cta-row {
        width: min(100%, 320px);
      }

      @media (max-width: 480px) {
        .welcome-container {
          gap: clamp(10px, 1.8vh, 16px);
          min-height: 58vh;
          padding: var(--nxt1-spacing-md) var(--nxt1-spacing-sm);
        }

        .welcome-content {
          gap: clamp(7px, 1.3vh, 12px);
        }

        .welcome-title {
          font-size: clamp(1.4rem, 7.2vw, 1.9rem);
        }

        .welcome-subtitle {
          font-size: var(--nxt1-fontSize-sm, 14px);
          line-height: 1.42;
          max-width: 320px;
        }

        .welcome-cta-row {
          width: min(100%, 300px);
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentOnboardingWelcomeComponent {
  protected readonly testIds = TEST_IDS.AGENT_ONBOARDING;

  /** Emitted when the user clicks "Get Started" */
  readonly start = output<void>();
}
