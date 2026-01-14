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
    <div class="min-h-screen flex items-center justify-center p-6 bg-bg-primary">
      <div class="w-full max-w-[500px] bg-surface-100 rounded-2xl p-8 text-center">
        <h1 class="text-3xl font-semibold mb-1 text-text-primary">Complete Your Profile</h1>
        <p class="text-text-secondary mb-6">Let's set up your NXT1 Sports profile</p>

        <div class="py-8 bg-surface-200 rounded-xl mb-6">
          <p class="text-text-primary m-0">Onboarding flow coming soon...</p>
          <p class="text-text-tertiary text-sm mt-2 m-0">For now, you can explore the app.</p>
        </div>

        <div class="flex flex-col gap-2">
          <button
            class="w-full py-3 px-4 bg-primary text-bg-primary font-semibold rounded-lg 
                   transition-all duration-200 hover:bg-primary-500 active:scale-[0.98]"
            routerLink="/explore"
          >
            Continue to Explore
          </button>
          <button
            class="w-full py-3 px-4 bg-transparent text-text-secondary font-medium rounded-lg 
                   border border-transparent transition-all duration-200 
                   hover:text-text-primary hover:bg-white/5"
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
