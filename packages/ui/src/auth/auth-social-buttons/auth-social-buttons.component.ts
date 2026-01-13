/**
 * @fileoverview AuthSocialButtonsComponent - Cross-Platform Social Login Buttons
 * @module @nxt1/ui/auth
 *
 * Shared social login buttons for Google, Apple, and Microsoft.
 * Uses Ionic buttons for platform-adaptive styling with haptic feedback.
 *
 * Features:
 * - Platform-adaptive styling (iOS/Android/Web)
 * - Haptic feedback on button press (native only)
 * - Loading state management
 * - Accessible with proper ARIA labels
 *
 * Usage:
 * ```html
 * <nxt1-auth-social-buttons
 *   [loading]="isLoading"
 *   (googleClick)="signInWithGoogle()"
 *   (appleClick)="signInWithApple()"
 *   (microsoftClick)="signInWithMicrosoft()"
 * />
 * ```
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  Optional,
  SkipSelf,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logoGoogle, logoApple, logoMicrosoft } from 'ionicons/icons';

// Forward declare to avoid build-time dependency
export abstract class HapticsService {
  abstract impact(style: 'light' | 'medium' | 'heavy'): Promise<void>;
}

/** Which providers to show */
export interface SocialProvidersConfig {
  google?: boolean;
  apple?: boolean;
  microsoft?: boolean;
}

@Component({
  selector: 'nxt1-auth-social-buttons',
  standalone: true,
  imports: [CommonModule, IonButton],
  template: `
    <div class="flex w-full flex-col gap-3">
      @if (providers.google !== false) {
        <ion-button
          expand="block"
          fill="outline"
          [disabled]="loading"
          (click)="onGoogleClick()"
          aria-label="Continue with Google"
          class="google-button"
        >
          <svg slot="start" class="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>Continue with Google</span>
        </ion-button>
      }

      @if (providers.apple !== false) {
        <ion-button
          expand="block"
          fill="solid"
          color="dark"
          [disabled]="loading"
          (click)="onAppleClick()"
          aria-label="Continue with Apple"
          class="apple-button"
        >
          <svg
            slot="start"
            class="h-5 w-5 shrink-0"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
            />
          </svg>
          <span>Continue with Apple</span>
        </ion-button>
      }

      @if (providers.microsoft !== false) {
        <ion-button
          expand="block"
          fill="outline"
          [disabled]="loading"
          (click)="onMicrosoftClick()"
          aria-label="Continue with Microsoft"
          class="microsoft-button"
        >
          <svg slot="start" class="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#F25022" d="M1 1h10v10H1z" />
            <path fill="#00A4EF" d="M1 13h10v10H1z" />
            <path fill="#7FBA00" d="M13 1h10v10H13z" />
            <path fill="#FFB900" d="M13 13h10v10H13z" />
          </svg>
          <span>Continue with Microsoft</span>
        </ion-button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      /* Google button - outline with brand colors */
      .google-button {
        --border-color: var(--nxt1-color-border-default);
        --background: var(--nxt1-color-surface-200);
        --color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-font-family-brand);
        height: 48px;
      }

      .google-button:hover {
        --background: var(--nxt1-color-surface-300);
        --border-color: var(--nxt1-color-border-strong);
      }

      /* Apple button - solid black */
      .apple-button {
        --background: #000000;
        --background-activated: #1a1a1a;
        --color: #ffffff;
        --border-color: rgba(255, 255, 255, 0.1);
        font-family: var(--nxt1-font-family-brand);
        height: 48px;
      }

      /* Microsoft button - outline */
      .microsoft-button {
        --border-color: var(--nxt1-color-border-default);
        --background: var(--nxt1-color-surface-200);
        --color: var(--nxt1-color-text-primary);
        font-family: var(--nxt1-font-family-brand);
        height: 48px;
      }

      .microsoft-button:hover {
        --background: var(--nxt1-color-surface-300);
        --border-color: var(--nxt1-color-border-strong);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthSocialButtonsComponent {
  // Optional injection - will be null if @nxt1/ui/services not imported
  private readonly haptics = inject(HapticsService, { optional: true, skipSelf: true });

  /** Whether buttons are in loading state */
  @Input() loading = false;

  /** Which providers to show */
  @Input() providers: SocialProvidersConfig = {
    google: true,
    apple: true,
    microsoft: true,
  };

  /** Emitted when Google button is clicked */
  @Output() googleClick = new EventEmitter<void>();

  /** Emitted when Apple button is clicked */
  @Output() appleClick = new EventEmitter<void>();

  /** Emitted when Microsoft button is clicked */
  @Output() microsoftClick = new EventEmitter<void>();

  constructor() {
    addIcons({ logoGoogle, logoApple, logoMicrosoft });
  }

  async onGoogleClick(): Promise<void> {
    await this.haptics?.impact('light');
    this.googleClick.emit();
  }

  async onAppleClick(): Promise<void> {
    await this.haptics?.impact('light');
    this.appleClick.emit();
  }

  async onMicrosoftClick(): Promise<void> {
    await this.haptics?.impact('light');
    this.microsoftClick.emit();
  }
}
