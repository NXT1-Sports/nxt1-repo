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
import {
  IonButton,
  IonIcon,
  IonContent,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowForwardOutline, personOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../services';
import { HapticsService } from '@nxt1/ui/services';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonIcon,
    IonContent,
  ],
  template: `
    <ion-content class="onboarding-page" [fullscreen]="true">
      <div class="min-h-screen flex items-center justify-center p-6 bg-bg-primary">
        <div class="w-full max-w-[500px] bg-surface-100 rounded-2xl p-8 text-center">
          <!-- Logo -->
          <div class="mb-6">
            <picture>
              <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
              <img
                src="assets/shared/logo/logo.png"
                alt="NXT1 Sports"
                class="w-16 h-16 mx-auto"
              />
            </picture>
          </div>

          <!-- Header -->
          <h1 class="text-3xl font-semibold mb-1 text-text-primary">Complete Your Profile</h1>
          <p class="text-text-secondary mb-6">Let's set up your NXT1 Sports profile</p>

          <!-- Placeholder Content -->
          <div class="py-8 bg-surface-200 rounded-xl mb-6">
            <ion-icon name="person-outline" class="text-[48px] text-text-tertiary mb-4"></ion-icon>
            <p class="text-text-primary m-0">Onboarding flow coming soon...</p>
            <p class="text-text-tertiary text-sm mt-2 m-0">For now, you can explore the app.</p>
          </div>

          <!-- Actions -->
          <div class="flex flex-col gap-3">
            <ion-button
              expand="block"
              class="continue-button"
              (click)="onContinue()"
            >
              <span>Continue to Explore</span>
              <ion-icon slot="end" name="arrow-forward-outline"></ion-icon>
            </ion-button>

            <ion-button
              expand="block"
              fill="clear"
              class="skip-button"
              (click)="onSkip()"
            >
              Skip for now
            </ion-button>
          </div>

          <!-- User Info -->
          @if (authFlow.user()) {
            <p class="text-text-tertiary text-xs mt-6">
              Signed in as {{ authFlow.user()?.email }}
            </p>
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
        font-family: var(--nxt1-font-family-brand);
        font-weight: 600;
        height: 48px;
      }

      .skip-button {
        --color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-font-family-brand);
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
