/**
 * @fileoverview AuthShellComponent - Cross-Platform Auth Layout Shell
 * @module @nxt1/ui/auth
 *
 * Enterprise-grade authentication shell using Ionic Framework.
 * Provides consistent branding and layout across web, mobile, and tablet.
 *
 * Features:
 * - Platform-adaptive layout (iOS/Android/Web)
 * - Shared logo and branding
 * - Animated background effects (theme-aware)
 * - Safe area handling for notched devices
 * - Content projection for flexible form layouts
 * - Responsive design from mobile to desktop
 * - Two-column layout support with [authSidePanel] slot
 * - Automatic theme adaptation (dark/light/sport themes)
 *
 * Usage:
 * ```html
 * <nxt1-auth-shell variant="card" [showLogo]="true" [showSidePanel]="true">
 *   <h1 authTitle>Welcome back</h1>
 *   <p authSubtitle>Sign in to continue</p>
 *
 *   <form>...</form>
 *
 *   <p authFooter>
 *     Don't have an account? <a routerLink="/signup">Sign up</a>
 *   </p>
 *
 *   <ng-container authSidePanel>
 *     <nxt1-auth-app-download />
 *   </ng-container>
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
export type AuthShellVariant = 'card' | 'card-glass' | 'wide' | 'minimal' | 'fullscreen';

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
      <ion-header class="ion-no-border bg-transparent">
        <ion-toolbar class="bg-transparent [--border-width:0]">
          <ion-buttons slot="start">
            <ion-button
              (click)="onBackClick()"
              aria-label="Back"
              data-testid="back-button"
              class="text-text-secondary hover:text-text-primary"
            >
              <ion-icon slot="icon-only" name="chevron-back"></ion-icon>
            </ion-button>
          </ion-buttons>
          @if (headerTitle) {
            <ion-title class="text-text-primary font-brand font-semibold">
              {{ headerTitle }}
            </ion-title>
          }
        </ion-toolbar>
      </ion-header>
    }

    <ion-content
      class="nxt1-auth-content"
      [fullscreen]="!showBackButton"
      [scrollY]="true"
      [forceOverscroll]="false"
    >
      <!-- Background Effects -->
      <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <!-- Gradient Background (Theme-aware CSS custom properties) -->
        <div class="auth-bg-gradient absolute inset-0"></div>
        <!-- Glow Effect (Theme-aware Tailwind) -->
        <div
          class="bg-glow animate-pulse-glow absolute top-[-200px] left-1/2 h-[600px] w-[600px] -translate-x-1/2 opacity-60 blur-[60px] md:top-[-300px] md:h-[800px] md:w-[800px]"
        ></div>
      </div>

      <!-- Main Wrapper - fills viewport height, centered content -->
      <div
        class="nxt1-auth-wrapper relative z-10 flex h-full min-h-full w-full flex-col items-center justify-center px-4 py-6"
      >
        <!-- Logo -->
        @if (showLogo) {
          <div class="mb-6 flex justify-center">
            <picture>
              <source srcset="assets/shared/logo/logo.avif" type="image/avif" />
              <img
                src="assets/shared/logo/logo.png"
                alt="NXT1"
                class="h-auto object-contain"
                [style.width.px]="logoWidth"
                loading="eager"
              />
            </picture>
          </div>
        }

        <!-- Title & Subtitle Slot -->
        <div class="mb-4 w-full text-center" [style.maxWidth]="showSidePanel ? '840px' : maxWidth">
          <ng-content select="[authTitle]"></ng-content>
          <ng-content select="[authSubtitle]"></ng-content>
        </div>

        <!-- Main Content Area with Optional Side Panel -->
        <div
          class="w-full"
          [style.maxWidth]="showSidePanel ? '840px' : maxWidth"
          [ngClass]="{
            'bg-surface-100 border-border-subtle rounded-2xl border p-6':
              variant === 'card' && !showSidePanel,
            'auth-card-glass': variant === 'card-glass' && !showSidePanel,
            'auth-two-column-card':
              showSidePanel && (variant === 'card' || variant === 'card-glass'),
          }"
        >
          @if (showSidePanel) {
            <!-- Two-Column Layout -->
            <div class="auth-two-column">
              <!-- Primary Column: Auth Forms -->
              <div class="auth-column auth-column--primary">
                <ng-content select="[authContent]"></ng-content>
                <ng-content></ng-content>
              </div>

              <!-- Vertical Divider (Desktop Only) -->
              <div class="auth-divider-vertical desktop-only">
                <div class="divider-line"></div>
                <span class="divider-text">or</span>
                <div class="divider-line"></div>
              </div>

              <!-- Secondary Column: Side Panel (Desktop Only) -->
              <div class="auth-column auth-column--secondary desktop-only">
                <ng-content select="[authSidePanel]"></ng-content>
              </div>
            </div>

            <!-- Mobile Side Panel Content -->
            <div class="mobile-only">
              <ng-content select="[authSidePanelMobile]"></ng-content>
            </div>
          } @else {
            <!-- Single Column Layout -->
            <div class="flex flex-col gap-3">
              <ng-content select="[authContent]"></ng-content>
              <ng-content></ng-content>
            </div>
          }
        </div>

        <!-- Footer Links -->
        <div class="mt-4 w-full text-center" [style.maxWidth]="showSidePanel ? '840px' : maxWidth">
          <ng-content select="[authFooter]"></ng-content>
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }

      .nxt1-auth-content {
        --overflow: auto;
        overflow: auto;
      }

      .nxt1-auth-content::part(scroll) {
        overflow: auto !important;
      }

      .nxt1-auth-wrapper {
        overflow: visible;
      }

      /* ============================================ */
      /* THEME-AWARE BACKGROUND GRADIENT             */
      /* Complex radial gradients using CSS vars     */
      /* ============================================ */
      .auth-bg-gradient {
        background-image:
          radial-gradient(
            ellipse 80% 50% at 50% -20%,
            var(--nxt1-color-alpha-primary10) 0%,
            transparent 50%
          ),
          radial-gradient(
            ellipse 60% 40% at 100% 100%,
            var(--nxt1-color-alpha-primary5) 0%,
            transparent 40%
          ),
          linear-gradient(to bottom, var(--nxt1-color-bg-primary), var(--nxt1-color-bg-primary));
      }

      /* ============================================ */
      /* CARD GLASS VARIANT (Theme-aware)            */
      /* ============================================ */
      .auth-card-glass {
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-radius: var(--nxt1-radius-xl, 16px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        padding: 24px;
      }

      /* ============================================ */
      /* TWO-COLUMN LAYOUT (Desktop)                 */
      /* ============================================ */
      .auth-two-column-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        border-radius: var(--nxt1-radius-xl, 16px);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        background: var(--nxt1-color-state-hover, rgba(255, 255, 255, 0.04));
        padding: 24px;
      }

      .auth-two-column {
        display: flex;
        gap: 32px;
        align-items: stretch;
        justify-content: space-evenly;
      }

      @media (max-width: 768px) {
        .auth-two-column {
          flex-direction: column;
          gap: 0;
        }
      }

      .auth-column {
        flex: 0 1 auto;
        min-width: 0;
      }

      .auth-column--primary {
        display: flex;
        flex-direction: column;
        gap: 12px;
        justify-content: center;
        min-width: 320px;
      }

      .auth-column--secondary {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* ============================================ */
      /* VERTICAL DIVIDER (Desktop Only)             */
      /* ============================================ */
      .auth-divider-vertical {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: 20px 0;
      }

      .auth-divider-vertical .divider-line {
        width: 1px;
        flex: 1;
        background: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        min-height: 40px;
      }

      .auth-divider-vertical .divider-text {
        font-family: var(--nxt1-fontFamily-brand, -apple-system, BlinkMacSystemFont, sans-serif);
        font-size: 11px;
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary, rgba(255, 255, 255, 0.5));
        text-transform: uppercase;
        letter-spacing: 1px;
        padding: 8px 0;
      }

      /* ============================================ */
      /* RESPONSIVE UTILITIES                        */
      /* ============================================ */
      .desktop-only {
        display: flex;
      }

      .mobile-only {
        display: none;
      }

      @media (max-width: 768px) {
        .desktop-only {
          display: none !important;
        }

        .mobile-only {
          display: block;
        }
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

  /** Whether to show the side panel (two-column layout) */
  @Input() showSidePanel = false;

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

  /** Get variant-specific Tailwind classes */
  getVariantClass(): string {
    switch (this.variant) {
      case 'wide':
        return 'max-w-2xl mx-auto md:px-6';
      case 'minimal':
        return 'max-w-sm mx-auto';
      case 'fullscreen':
        return 'max-w-none px-4 md:px-0';
      case 'card-glass':
        return 'max-w-md mx-auto';
      case 'card':
      default:
        return 'max-w-sm mx-auto';
    }
  }

  onBackClick(): void {
    this.backClick.emit();

    // Default behavior: browser back if no handler attached
    if (!this.backClick.observed && isPlatformBrowser(this.platformId)) {
      this.location.back();
    }
  }
}
