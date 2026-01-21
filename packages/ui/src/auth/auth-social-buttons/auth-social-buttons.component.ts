/**
 * @fileoverview AuthSocialButtonsComponent - Cross-Platform Social Login Buttons
 * @module @nxt1/ui/auth
 *
 * Shared social login buttons for Google, Apple, and Microsoft.
 * Uses Ionic buttons for native mobile feel with design system styling.
 *
 * Features:
 * - Native platform feel on iOS/Android via Ionic
 * - SSR-safe with pre-hydration CSS fallbacks
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton } from '@ionic/angular/standalone';
import { NxtIconComponent } from '../../shared/icon';

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
  imports: [CommonModule, IonButton, NxtIconComponent],
  template: `
    <div class="nxt1-social-buttons" data-testid="auth-social-buttons">
      @if (providers.google !== false) {
        <ion-button
          fill="outline"
          class="nxt1-auth-btn nxt1-auth-btn--google"
          [disabled]="loading"
          (click)="onGoogleClick()"
          aria-label="Continue with Google"
          data-testid="auth-btn-google"
        >
          <div class="btn-content">
            <nxt1-icon name="google" size="20" class="btn-icon" aria-hidden="true" />
            <span class="btn-text">Continue with Google</span>
          </div>
        </ion-button>
      }

      @if (providers.apple !== false) {
        <ion-button
          fill="solid"
          class="nxt1-auth-btn nxt1-auth-btn--apple"
          [disabled]="loading"
          (click)="onAppleClick()"
          aria-label="Continue with Apple"
          data-testid="auth-btn-apple"
        >
          <div class="btn-content">
            <nxt1-icon name="apple" size="20" class="btn-icon" aria-hidden="true" />
            <span class="btn-text">Continue with Apple</span>
          </div>
        </ion-button>
      }

      @if (providers.microsoft !== false) {
        <ion-button
          fill="outline"
          class="nxt1-auth-btn nxt1-auth-btn--microsoft"
          [disabled]="loading"
          (click)="onMicrosoftClick()"
          aria-label="Continue with Microsoft"
          data-testid="auth-btn-microsoft"
        >
          <div class="btn-content">
            <nxt1-icon name="microsoft" size="20" class="btn-icon" aria-hidden="true" />
            <span class="btn-text">Continue with Microsoft</span>
          </div>
        </ion-button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .nxt1-social-buttons {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        width: 100%;
      }

      /* Base auth button - uses design system tokens */
      .nxt1-auth-btn {
        --background: var(--nxt1-color-state-hover);
        --background-hover: var(--nxt1-color-state-pressed);
        --background-activated: var(--nxt1-color-state-pressed);
        --background-focused: var(--nxt1-color-state-pressed);
        --border-color: var(--nxt1-color-border-default);
        --border-radius: var(--nxt1-borderRadius-lg, 12px);
        --border-width: 1px;
        --color: var(--nxt1-color-text-primary);
        --padding-start: 1rem;
        --padding-end: 1rem;
        --box-shadow: none;
        height: 52px;
        font-family: var(--nxt1-fontFamily-brand, -apple-system, BlinkMacSystemFont, sans-serif);
        font-size: 1rem;
        font-weight: 600;
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
        --transition: all var(--nxt1-duration-normal, 200ms) ease-out;
      }

      .nxt1-auth-btn::part(native) {
        border-radius: var(--nxt1-borderRadius-lg, 12px);
        transition: all 200ms ease-out;
      }

      .nxt1-auth-btn:hover::part(native) {
        transform: translateY(-1px);
      }

      .nxt1-auth-btn:active::part(native) {
        transform: translateY(0);
      }

      /* Button content wrapper - ensures horizontal layout */
      .btn-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        width: 100%;
      }

      /* Icon styling */
      .btn-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }

      /* Apple button - solid black (brand requirement) */
      .nxt1-auth-btn--apple {
        --background: #000000;
        --background-hover: #1a1a1a;
        --background-activated: #1a1a1a;
        --background-focused: #1a1a1a;
        --border-color: var(--nxt1-color-border-strong);
        --color: #ffffff;
      }

      /* Google hover effect */
      .nxt1-auth-btn--google:hover {
        --border-color: rgba(66, 133, 244, 0.4);
      }

      /* Microsoft hover effect */
      .nxt1-auth-btn--microsoft:hover {
        --border-color: rgba(0, 164, 239, 0.4);
      }

      /* Apple hover effect */
      .nxt1-auth-btn--apple:hover {
        --border-color: rgba(255, 255, 255, 0.3);
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
