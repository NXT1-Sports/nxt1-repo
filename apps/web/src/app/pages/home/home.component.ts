/**
 * @fileoverview Home Page - Protected Route Demo
 * @module @nxt1/web
 *
 * Simple home page to demonstrate authenticated state.
 * Shows user info and logout button.
 */

import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logOutOutline, personCircleOutline } from 'ionicons/icons';
import { AuthFlowService } from '../../features/auth/services';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, IonButton, IonCard, IonCardContent, IonIcon],
  template: `
    <div class="bg-bg-primary flex min-h-screen items-center justify-center p-4">
      <ion-card class="w-full max-w-md">
        <ion-card-content class="p-6">
          <!-- User Avatar -->
          <div class="mb-6 flex flex-col items-center">
            @if (authFlow.user()?.photoURL) {
              <img
                [src]="authFlow.user()?.photoURL"
                [alt]="authFlow.user()?.displayName"
                class="mb-4 h-20 w-20 rounded-full"
              />
            } @else {
              <ion-icon
                name="person-circle-outline"
                class="text-text-tertiary mb-4 text-[80px]"
              ></ion-icon>
            }
            <h1 class="text-text-primary mb-1 text-2xl font-bold">
              Welcome, {{ authFlow.user()?.displayName }}!
            </h1>
            <p class="text-text-secondary text-sm">{{ authFlow.user()?.email }}</p>
          </div>

          <!-- User Info -->
          <div class="mb-6 space-y-3">
            <div class="border-border flex items-center justify-between border-b py-2">
              <span class="text-text-secondary text-sm">Role</span>
              <span class="text-text-primary font-medium">{{ authFlow.userRole() }}</span>
            </div>
            <div class="border-border flex items-center justify-between border-b py-2">
              <span class="text-text-secondary text-sm">Premium Status</span>
              <span class="text-text-primary font-medium">
                {{ authFlow.isPremium() ? 'Active' : 'Free' }}
              </span>
            </div>
            <div class="border-border flex items-center justify-between border-b py-2">
              <span class="text-text-secondary text-sm">Onboarding</span>
              <span class="text-text-primary font-medium">
                {{ authFlow.hasCompletedOnboarding() ? 'Completed' : 'Pending' }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="space-y-3">
            <ion-button expand="block" color="danger" (click)="onLogout()">
              <ion-icon slot="start" name="log-out-outline"></ion-icon>
              Sign Out
            </ion-button>
          </div>
        </ion-card-content>
      </ion-card>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly authFlow = inject(AuthFlowService);
  private readonly router = inject(Router);

  readonly isProduction = false; // Can inject from environment

  constructor() {
    addIcons({ logOutOutline, personCircleOutline });
  }

  async onLogout(): Promise<void> {
    try {
      await this.authFlow.signOut();
      await this.router.navigate(['/auth/login']);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }
}
