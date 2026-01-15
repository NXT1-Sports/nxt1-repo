/**
 * @fileoverview Onboarding Page - Profile Setup Flow
 * @module @nxt1/mobile/features/auth
 *
 * Multi-step onboarding flow for new users to complete their profile.
 * Features platform-adaptive Ionic components with native haptic feedback.
 *
 * ⭐ MATCHES WEB'S onboarding.component.ts INTERFACE ⭐
 *
 * Planned features:
 * - Profile type selection (athlete, coach, parent, scout, etc.)
 * - Sport selection
 * - Profile details
 * - Team code entry
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonContent } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, personOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../services';
import { HapticsService } from '@nxt1/ui/services';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, IonButton, IonIcon, IonContent],
  template: `
    <ion-content class="onboarding-page" [fullscreen]="true">
      <div class="bg-bg-primary flex min-h-screen items-center justify-center p-6">
        <div class="bg-surface-100 w-full max-w-[500px] rounded-2xl p-8 text-center">
          <!-- Logo -->
          <div class="mb-6">
            <picture>
              <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
              <img src="assets/shared/logo/logo.png" alt="NXT1 Sports" class="mx-auto h-16 w-16" />
            </picture>
          </div>

          <!-- Header -->
          <h1 class="text-text-primary mb-1 text-3xl font-semibold">Complete Your Profile</h1>
          <p class="text-text-secondary mb-6">Let's set up your NXT1 Sports profile</p>

          <!-- Placeholder Content -->
          <div class="bg-surface-200 mb-6 rounded-xl py-8">
            <ion-icon name="person-outline" class="text-text-tertiary mb-4 text-[48px]"></ion-icon>
            <p class="text-text-primary m-0">Onboarding flow coming soon...</p>
            <p class="text-text-tertiary m-0 mt-2 text-sm">For now, you can explore the app.</p>
          </div>

          <!-- Actions -->
          <div class="flex flex-col gap-3">
            <ion-button expand="block" class="continue-button" (click)="onContinue()">
              <span>Continue to Explore</span>
              <ion-icon slot="end" name="arrow-forward-outline"></ion-icon>
            </ion-button>

            <ion-button expand="block" fill="clear" class="skip-button" (click)="onSkip()">
              Skip for now
            </ion-button>
          </div>

          <!-- User Info -->
          @if (authFlow.user()) {
            <p class="text-text-tertiary mt-6 text-xs">Signed in as {{ authFlow.user()?.email }}</p>
          }
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .onboarding-page {
        --background: var(--nxt1-color-bg-primary);
      }

      .continue-button {
        --background: var(--nxt1-color-primary);
        --background-hover: var(--nxt1-color-primary-500);
        --color: var(--nxt1-color-bg-primary);
        font-family: var(--nxt1-fontFamily-brand);
        font-weight: 600;
        height: 48px;
      }

      .skip-button {
        --color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-fontFamily-brand);
        height: 48px;
      }

      .skip-button:hover {
        --color: var(--nxt1-color-text-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingPage {
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ arrowForwardOutline, personOutline });
  }

  async onContinue(): Promise<void> {
    await this.haptics.impact('medium');
    // Navigate to main app
    await this.router.navigate(['/home']);
  }

  async onSkip(): Promise<void> {
    await this.haptics.impact('light');
    // Could mark onboarding as skipped in user preferences
    await this.router.navigate(['/home']);
  }
}
