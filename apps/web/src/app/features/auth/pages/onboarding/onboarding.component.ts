import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthFlowService } from '../../services';

/**
 * Onboarding Component - Profile Setup Flow
 * @module @nxt1/web/features/auth
 *
 * Planned features:
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
    <div class="bg-bg-primary flex min-h-screen items-center justify-center p-6">
      <div class="bg-surface-100 w-full max-w-[500px] rounded-2xl p-8 text-center">
        <h1 class="text-text-primary mb-1 text-3xl font-semibold">Complete Your Profile</h1>
        <p class="text-text-secondary mb-6">Let's set up your NXT1 Sports profile</p>

        <div class="bg-surface-200 mb-6 rounded-xl py-8">
          <p class="text-text-primary m-0">Onboarding flow coming soon...</p>
          <p class="text-text-tertiary m-0 mt-2 text-sm">For now, you can explore the app.</p>
        </div>

        <div class="flex flex-col gap-2">
          <button
            class="bg-primary text-bg-primary hover:bg-primary-500 w-full rounded-lg px-4 py-3 font-semibold transition-all duration-200 active:scale-[0.98]"
            routerLink="/explore"
          >
            Continue to Explore
          </button>
          <button
            class="text-text-secondary hover:text-text-primary w-full rounded-lg border border-transparent bg-transparent px-4 py-3 font-medium transition-all duration-200 hover:bg-white/5"
            (click)="onSkip()"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  private readonly authFlow = inject(AuthFlowService);

  async onSkip(): Promise<void> {
    // Could mark onboarding as skipped in user preferences
    window.location.href = '/explore';
  }
}
