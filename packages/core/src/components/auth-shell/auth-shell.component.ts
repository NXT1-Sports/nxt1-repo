/**
 * @fileoverview AuthShellComponent - Cross-Platform Auth Layout Shell
 * @module @nxt1/core/components
 *
 * Enterprise-grade authentication shell using Ionic Framework.
 * Provides consistent branding and layout across web, mobile, and tablet.
 *
 * Features:
 * - Platform-adaptive layout (iOS/Android/Web)
 * - Shared logo and branding
 * - Animated background effects
 * - Safe area handling for notched devices
 * - Content projection for flexible form layouts
 * - Responsive design from mobile to desktop
 *
 * Usage:
 * ```html
 * <nxt1-auth-shell variant="card" [showLogo]="true">
 *   <h1 authTitle>Welcome back</h1>
 *   <p authSubtitle>Sign in to continue</p>
 *
 *   <form>...</form>
 *
 *   <p authFooter>
 *     Don't have an account? <a routerLink="/signup">Sign up</a>
 *   </p>
 *
 *   <p authTerms>
 *     By continuing, you agree to our Terms and Privacy Policy
 *   </p>
 * </nxt1-auth-shell>
 * ```
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, chevronBack } from 'ionicons/icons';

/** Shell layout variants */
export type AuthShellVariant = 'card' | 'wide' | 'minimal' | 'fullscreen';

@Component({
  selector: 'nxt1-auth-shell',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
  ],
  template: `
    <!-- Optional Header with Back Button -->
    @if (showBackButton) {
      <ion-header class="ion-no-border auth-header">
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button (click)="onBackClick()" class="auth-back-btn" aria-label="Go back">
              <ion-icon slot="icon-only" name="chevron-back"></ion-icon>
            </ion-button>
          </ion-buttons>
          @if (headerTitle) {
            <ion-title>{{ headerTitle }}</ion-title>
          }
        </ion-toolbar>
      </ion-header>
    }

    <ion-content
      class="auth-content"
      [class.auth-content--card]="variant === 'card'"
      [class.auth-content--wide]="variant === 'wide'"
      [class.auth-content--minimal]="variant === 'minimal'"
      [class.auth-content--fullscreen]="variant === 'fullscreen'"
      [fullscreen]="!showBackButton"
    >
      <!-- Background Effects -->
      <div class="auth-bg" aria-hidden="true">
        <div class="auth-bg__gradient"></div>
        <div class="auth-bg__glow"></div>
      </div>

      <!-- Main Wrapper -->
      <div class="auth-wrapper" [style.max-width]="maxWidth">
        <!-- Logo -->
        @if (showLogo) {
          <div class="auth-logo">
            <picture>
              <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
              <img
                src="assets/shared/logo/logo.png"
                alt="NXT1"
                class="auth-logo__img"
                [style.width.px]="logoWidth"
                loading="eager"
              />
            </picture>
          </div>
        }

        <!-- Title & Subtitle Slot -->
        <div class="auth-header-content">
          <ng-content select="[authTitle]"></ng-content>
          <ng-content select="[authSubtitle]"></ng-content>
        </div>

        <!-- Main Content Area (Card or Flat) -->
        @if (variant === 'card') {
          <div class="auth-card">
            <ng-content></ng-content>
          </div>
        } @else {
          <div class="auth-form-area">
            <ng-content></ng-content>
          </div>
        }

        <!-- Footer Links -->
        <div class="auth-footer">
          <ng-content select="[authFooter]"></ng-content>
        </div>
      </div>

      <!-- Terms at Bottom -->
      <div class="auth-terms">
        <ng-content select="[authTerms]"></ng-content>
      </div>
    </ion-content>
  `,
  styles: [
    `
      /* ============================================
       AUTH SHELL - Cross-Platform Styles
       ============================================ */

      /* Header */
      .auth-header {
        --background: transparent;

        ion-toolbar {
          --background: transparent;
          --border-width: 0;
        }

        ion-title {
          color: var(--nxt1-color-text-primary, #ffffff);
          font-family: var(--nxt1-font-family-brand, system-ui);
          font-weight: 600;
        }
      }

      .auth-back-btn {
        --color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));

        &:hover {
          --color: var(--nxt1-color-text-primary, #ffffff);
        }
      }

      /* Content */
      .auth-content {
        --background: transparent;
        height: 100vh;

        &::part(scroll) {
          display: flex;
          flex-direction: column;
          min-height: 100%;
        }
      }

      /* Background Effects */
      .auth-bg {
        position: fixed;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .auth-bg__gradient {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 80% 50% at 50% -20%, rgba(204, 255, 0, 0.1) 0%, transparent 50%),
          radial-gradient(
            ellipse 60% 40% at 100% 100%,
            rgba(204, 255, 0, 0.06) 0%,
            transparent 40%
          ),
          linear-gradient(180deg, var(--nxt1-color-bg-primary, #0a0a0a) 0%, #080808 100%);
      }

      .auth-bg__glow {
        position: absolute;
        top: -200px;
        left: 50%;
        transform: translateX(-50%);
        width: 600px;
        height: 600px;
        background: radial-gradient(circle, rgba(204, 255, 0, 0.08) 0%, transparent 70%);
        filter: blur(60px);
        animation: pulseGlow 8s ease-in-out infinite;

        @media (min-width: 768px) {
          width: 800px;
          height: 800px;
          top: -300px;
        }
      }

      @keyframes pulseGlow {
        0%,
        100% {
          opacity: 0.6;
          transform: translateX(-50%) scale(1);
        }
        50% {
          opacity: 1;
          transform: translateX(-50%) scale(1.1);
        }
      }

      /* Main Wrapper */
      .auth-wrapper {
        position: relative;
        z-index: 1;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-width: 420px;
        margin: 0 auto;
        padding: 24px 16px;
        padding-top: calc(24px + var(--ion-safe-area-top, 0px));
        padding-bottom: calc(24px + var(--ion-safe-area-bottom, 0px));

        @media (min-width: 768px) {
          padding: 40px 24px;
        }
      }

      /* Logo */
      .auth-logo {
        display: flex;
        justify-content: center;
        margin-bottom: 32px;

        @media (min-width: 768px) {
          margin-bottom: 40px;
        }
      }

      .auth-logo__img {
        height: auto;
        object-fit: contain;
      }

      /* Header Content (Title/Subtitle) */
      .auth-header-content {
        text-align: center;
        margin-bottom: 24px;
        width: 100%;

        ::ng-deep {
          h1,
          [authTitle] {
            color: var(--nxt1-color-text-primary, #ffffff);
            font-family: var(--nxt1-font-family-brand, system-ui);
            font-size: 28px;
            font-weight: 700;
            line-height: 1.2;
            margin: 0 0 8px;

            @media (min-width: 768px) {
              font-size: 32px;
            }
          }

          p,
          [authSubtitle] {
            color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
            font-size: 16px;
            line-height: 1.5;
            margin: 0;
          }
        }
      }

      /* Card Variant */
      .auth-card {
        width: 100%;
        background: var(--nxt1-color-surface-100, #161616);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        border-radius: 16px;
        padding: 24px;

        @media (min-width: 768px) {
          padding: 32px;
        }
      }

      /* Form Area (non-card variants) */
      .auth-form-area {
        width: 100%;
      }

      /* Wide Variant */
      .auth-content--wide .auth-wrapper {
        max-width: 600px;
      }

      /* Minimal Variant - no card, more compact */
      .auth-content--minimal {
        .auth-logo {
          margin-bottom: 24px;
        }

        .auth-header-content {
          margin-bottom: 16px;
        }
      }

      /* Fullscreen Variant - edge to edge */
      .auth-content--fullscreen .auth-wrapper {
        max-width: none;
        padding: 16px;
      }

      /* Footer */
      .auth-footer {
        margin-top: 24px;
        text-align: center;
        width: 100%;

        ::ng-deep {
          color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
          font-size: 14px;
          line-height: 1.5;

          a {
            color: var(--nxt1-color-primary, #ccff00);
            text-decoration: none;
            font-weight: 500;

            &:hover {
              text-decoration: underline;
            }
          }
        }
      }

      /* Terms */
      .auth-terms {
        position: relative;
        z-index: 1;
        padding: 16px;
        padding-bottom: calc(16px + var(--ion-safe-area-bottom, 0px));
        text-align: center;

        ::ng-deep {
          color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
          font-size: 12px;
          line-height: 1.5;
          max-width: 300px;
          margin: 0 auto;

          a {
            color: var(--nxt1-color-text-secondary, rgba(255, 255, 255, 0.7));
            text-decoration: none;

            &:hover {
              text-decoration: underline;
            }
          }
        }
      }

      /* Empty state handling */
      .auth-footer:empty,
      .auth-terms:empty,
      .auth-header-content:empty {
        display: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly location = inject(Location);

  /** Shell layout variant */
  @Input() variant: AuthShellVariant = 'card';

  /** Whether to show the NXT1 logo */
  @Input() showLogo = true;

  /** Whether to show back navigation in header */
  @Input() showBackButton = false;

  /** Optional title in header (when showBackButton is true) */
  @Input() headerTitle = '';

  /** Max width of the content container */
  @Input() maxWidth = '420px';

  /** Logo width in pixels */
  @Input() logoWidth = 160;

  /** Emitted when back button is clicked */
  @Output() backClick = new EventEmitter<void>();

  constructor() {
    // Register icons
    addIcons({ arrowBack, chevronBack });
  }

  onBackClick(): void {
    this.backClick.emit();

    // Default behavior: browser back if no handler attached
    if (!this.backClick.observed && isPlatformBrowser(this.platformId)) {
      this.location.back();
    }
  }
}
