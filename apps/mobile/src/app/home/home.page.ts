/**
 * @fileoverview Home Page - Main App Entry Point
 * @module @nxt1/mobile
 *
 * Placeholder home page for authenticated users.
 * Will be expanded with actual features.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logOutOutline } from 'ionicons/icons';
import { AuthFlowService } from '../features/auth/services';
import { HapticsService } from '@nxt1/ui/services';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonIcon,
  ],
  template: `
    <ion-content class="home-page" [fullscreen]="true">
      <div class="min-h-screen flex flex-col items-center justify-center p-6 bg-bg-primary">
        <!-- Logo -->
        <div class="mb-8">
          <picture>
            <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
            <img
              src="assets/shared/logo/logo.png"
              alt="NXT1 Sports"
              class="w-20 h-20"
            />
          </picture>
        </div>

        <!-- Welcome -->
        <h1 class="text-3xl font-semibold text-text-primary mb-2">Welcome to NXT1</h1>
        <p class="text-text-secondary mb-8 text-center">
          @if (authFlow.user(); as user) {
            Hello, {{ user.displayName }}!
          } @else {
            Your sports recruiting journey starts here.
          }
        </p>

        <!-- Placeholder Content -->
        <div class="w-full max-w-[400px] bg-surface-100 rounded-2xl p-6 mb-8">
          <p class="text-text-secondary text-center">
            Main app features coming soon...
          </p>
        </div>

        <!-- Sign Out Button -->
        <ion-button
          fill="clear"
          class="signout-button"
          (click)="onSignOut()"
        >
          <ion-icon slot="start" name="log-out-outline"></ion-icon>
          Sign Out
        </ion-button>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .home-page {
        --background: var(--nxt1-color-bg-primary);
      }

      .signout-button {
        --color: var(--nxt1-color-text-secondary);
        font-family: var(--nxt1-font-family-brand);
      }

      .signout-button:hover {
        --color: var(--nxt1-color-error);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  readonly authFlow = inject(AuthFlowService);
  private readonly haptics = inject(HapticsService);
  private readonly router = inject(Router);

  constructor() {
    addIcons({ logOutOutline });
  }

  async onSignOut(): Promise<void> {
    await this.haptics.impact('medium');
    await this.authFlow.signOut();
  }
}
