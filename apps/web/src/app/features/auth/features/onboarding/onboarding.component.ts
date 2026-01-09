import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthFlowService } from '../../services';

/**
 * Onboarding Component - Placeholder
 *
 * TODO: Implement full onboarding flow with:
 * - Profile type selection
 * - Sport selection
 * - Profile details
 * - Team code entry
 */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="onboarding-container">
      <div class="onboarding-card">
        <h1>Complete Your Profile</h1>
        <p>Let's set up your NXT1 Sports profile</p>

        <div class="placeholder-content">
          <p>Onboarding flow coming soon...</p>
          <p class="small">For now, you can explore the app.</p>
        </div>

        <div class="actions">
          <button class="btn btn-primary" routerLink="/explore">Continue to Explore</button>
          <button class="btn btn-ghost" (click)="onSkip()">Skip for now</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .onboarding-container {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--spacing-lg, 24px);
        background-color: var(--app-bg, #121212);
      }

      .onboarding-card {
        width: 100%;
        max-width: 500px;
        background-color: var(--card-bg, #1e1e1e);
        border-radius: var(--radius-xl, 16px);
        padding: var(--spacing-xl, 32px);
        text-align: center;

        h1 {
          font-size: 1.75rem;
          margin-bottom: var(--spacing-xs, 4px);
        }

        p {
          color: var(--text-secondary, rgba(255, 255, 255, 0.7));
          margin-bottom: var(--spacing-lg, 24px);
        }
      }

      .placeholder-content {
        padding: var(--spacing-xl, 32px);
        background-color: var(--surface, #1a1a1a);
        border-radius: var(--radius-lg, 12px);
        margin-bottom: var(--spacing-lg, 24px);

        p {
          margin: 0;
        }

        .small {
          font-size: 0.875rem;
          margin-top: var(--spacing-sm, 8px);
        }
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm, 8px);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  private readonly authFlow = inject(AuthFlowService);

  async onSkip(): Promise<void> {
    // Could mark onboarding as skipped in user preferences
    window.location.href = '/explore';
  }
}
