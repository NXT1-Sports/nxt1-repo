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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBack, chevronBack } from 'ionicons/icons';
import { NxtLogoComponent } from '../../components/logo';

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
    NxtLogoComponent,
  ],
  template: `
    <!-- Professional Floating Back Button -->
    @if (showBackButton) {
      <ion-header class="ion-no-border nxt1-floating-header">
        <ion-toolbar class="nxt1-floating-toolbar">
          <ion-buttons slot="start" class="nxt1-floating-buttons">
            <ion-button
              (click)="onBackClick()"
              aria-label="Back"
              data-testid="back-button"
              class="nxt1-back-button"
            >
              <ion-icon slot="icon-only" name="chevron-back"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
    }

    <ion-content
      class="nxt1-auth-content"
      [fullscreen]="true"
      [scrollY]="true"
      [forceOverscroll]="false"
      scrollEvents="true"
    >
      <!-- Background Effects -->
      <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <!-- Gradient Background (Theme-aware CSS custom properties) -->
        <div class="auth-bg-gradient absolute inset-0"></div>
        <!-- Glow Effect (Desktop only - hidden on mobile for clean corner fades) -->
        <div
          class="auth-bg-glow absolute top-[-300px] left-1/2 hidden h-[800px] w-[800px] -translate-x-1/2 opacity-60 blur-[60px] md:block"
        ></div>
      </div>

      <!-- Main Wrapper - scrollable content area -->
      <div
        class="nxt1-auth-wrapper relative z-10 flex w-full flex-col items-center px-4 py-6 md:py-10"
        [class.nxt1-auth-wrapper--mobile-footer]="mobileFooterPadding"
      >
        <!-- Logo -->
        @if (showLogo) {
          <div class="auth-logo-wrapper mb-6 flex justify-center">
            <nxt1-logo [size]="logoSize" variant="auth" />
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
          <!-- Two-Column Layout -->
          <div class="auth-two-column">
            <!-- Primary Column: Auth Forms -->
            <div class="auth-column auth-column--primary">
              <ng-content select="[authContent]"></ng-content>
              <ng-content></ng-content>
            </div>

            <!-- Vertical Divider (Desktop Only) -->
            @if (showSidePanel) {
              <div class="auth-divider-vertical desktop-only">
                <div class="divider-line"></div>
                <span class="divider-text">or</span>
                <div class="divider-line"></div>
              </div>

              <!-- Secondary Column: Side Panel (Desktop Only) -->
              <div class="auth-column auth-column--secondary desktop-only">
                <ng-content select="[authSidePanel]"></ng-content>
              </div>
            }
          </div>

          <!-- Mobile Side Panel Content -->
          @if (showSidePanel) {
            <div class="mobile-only">
              <ng-content select="[authSidePanelMobile]"></ng-content>
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
        width: 100%;
        min-height: 100vh;
        min-height: 100dvh;
        position: static;
        overflow: visible;
      }

      /* ============================================ */
      /* ION-CONTENT FIX FOR WEB SSR                 */
      /* Use static positioning to bypass Ionic's    */
      /* internal scroll mechanism entirely          */
      /* ============================================ */
      ion-content.nxt1-auth-content {
        --background: transparent;
        display: block !important;
        position: static !important;
        height: auto !important;
        min-height: auto !important;
        overflow: visible !important;
        contain: none !important;
      }

      ion-content.nxt1-auth-content::part(background) {
        position: static !important;
        background: transparent !important;
      }

      ion-content.nxt1-auth-content::part(scroll) {
        display: block !important;
        position: static !important;
        height: auto !important;
        min-height: auto !important;
        overflow: visible !important;
      }

      /* ============================================ */
      /* PROFESSIONAL FLOATING HEADER                */
      /* No background bar, just clean button        */
      /* Fixed position to not affect content flow   */
      /* ============================================ */
      ion-header.nxt1-floating-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1000;
        --background: transparent;
        background: transparent;
        pointer-events: none;
      }

      ion-header.nxt1-floating-header ion-toolbar,
      ion-header.nxt1-floating-header ion-buttons,
      ion-header.nxt1-floating-header ion-button {
        pointer-events: auto;
      }

      ion-header.nxt1-floating-header::part(native) {
        background: transparent !important;
      }

      .nxt1-floating-toolbar {
        --background: transparent;
        --border-width: 0;
        --padding-start: 12px;
        --padding-end: 12px;
        --padding-top: 12px;
        --padding-bottom: 12px;
        --min-height: 64px;
      }

      .nxt1-floating-toolbar::part(native) {
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      .nxt1-floating-buttons {
        display: flex;
        align-items: center;
      }

      /* Professional floating back button - Theme-aware */
      .nxt1-back-button {
        --background: transparent;
        --background-hover: transparent;
        --background-activated: transparent;
        --border-radius: 50%;
        --padding-start: 0;
        --padding-end: 0;
        width: 40px;
        height: 40px;
        margin: 0;
      }

      .nxt1-back-button::part(native) {
        border-radius: 50%;
        background: var(--nxt1-color-surface-200, #1a1a1a);
        border: 1px solid var(--nxt1-color-border-subtle, rgba(255, 255, 255, 0.08));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 2px 8px var(--nxt1-color-shadow, rgba(0, 0, 0, 0.15));
        transition: all 0.2s ease;
      }

      .nxt1-back-button:hover::part(native) {
        background: var(--nxt1-color-surface-300, #242424);
        border-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
      }

      .nxt1-back-button ion-icon {
        font-size: var(--nxt1-fontSize-xl);
        color: var(--nxt1-color-text-primary);
      }

      .nxt1-auth-content {
        --overflow: auto;
        overflow: auto;
      }

      .nxt1-auth-content::part(scroll) {
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
      }

      .nxt1-auth-wrapper {
        overflow: visible;
        box-sizing: border-box;
        /* Safe area padding for notched devices */
        padding-top: calc(env(safe-area-inset-top, 0px) + var(--nxt1-spacing-16));
      }

      /* Logo drop shadow for depth */
      .auth-logo-wrapper {
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
      }

      /* Mobile footer padding - adds space at bottom for fixed footer */
      .nxt1-auth-wrapper--mobile-footer {
        padding-bottom: 200px;
      }

      @media (min-width: 769px) {
        .nxt1-auth-wrapper--mobile-footer {
          padding-bottom: 0;
        }
      }

      /* ============================================ */
      /* THEME-AWARE BACKGROUND GRADIENT             */
      /* Desktop: Complex radial gradients           */
      /* Mobile: Sleek corner fades with accent      */
      /* ============================================ */

      /* Desktop Background (769px+) */
      @media (min-width: 769px) {
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
      }

      /* Mobile Background - Sleek corner fades */
      @media (max-width: 768px) {
        .auth-bg-gradient {
          background-color: var(--nxt1-color-bg-primary);
          background-image:
            /* Top-left corner - primary accent fade */
            radial-gradient(
              ellipse 70% 50% at 0% 0%,
              rgba(204, 255, 0, 0.12) 0%,
              rgba(204, 255, 0, 0.05) 30%,
              transparent 60%
            ),
            /* Top-right corner - subtle accent */
              radial-gradient(
                ellipse 50% 40% at 100% 0%,
                rgba(204, 255, 0, 0.06) 0%,
                transparent 50%
              ),
            /* Bottom-right corner - primary accent fade */
              radial-gradient(
                ellipse 60% 50% at 100% 100%,
                rgba(204, 255, 0, 0.1) 0%,
                rgba(204, 255, 0, 0.04) 35%,
                transparent 60%
              ),
            /* Bottom-left corner - subtle accent */
              radial-gradient(
                ellipse 45% 35% at 0% 100%,
                rgba(204, 255, 0, 0.05) 0%,
                transparent 45%
              );
        }
      }

      /* Desktop glow effect */
      .auth-bg-glow {
        background: radial-gradient(
          circle,
          var(--nxt1-color-alpha-primary15, rgba(204, 255, 0, 0.15)) 0%,
          var(--nxt1-color-alpha-primary5, rgba(204, 255, 0, 0.05)) 40%,
          transparent 70%
        );
        animation: pulse-glow 4s ease-in-out infinite;
      }

      @keyframes pulse-glow {
        0%,
        100% {
          opacity: 0.5;
          transform: translateX(-50%) scale(1);
        }
        50% {
          opacity: 0.7;
          transform: translateX(-50%) scale(1.05);
        }
      }

      /* ============================================ */
      /* CARD GLASS VARIANT (Theme-aware)            */
      /* ============================================ */
      .auth-card-glass {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-state-hover);
        padding: var(--nxt1-spacing-6);
      }

      /* ============================================ */
      /* TWO-COLUMN LAYOUT (Desktop)                 */
      /* ============================================ */
      .auth-two-column-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-subtle);
        background: var(--nxt1-color-state-hover);
        padding: var(--nxt1-spacing-6);
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
        flex: 1 1 0;
        min-width: 0;
      }

      .auth-column--primary {
        display: flex;
        flex-direction: column;
        gap: 12px;
        justify-content: center;
        flex: 1 1 0;
        width: 100%;
      }

      .auth-column--secondary {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1 1 0;
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
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        padding: var(--nxt1-spacing-2) 0;
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

  /** Whether to add bottom padding for a fixed mobile footer (e.g., onboarding) */
  @Input() mobileFooterPadding = false;

  /** Logo size variant (maps to NxtLogoComponent sizes) */
  @Input() logoSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl' = 'md';

  /** @deprecated Use logoSize instead */
  @Input() set logoWidth(value: number) {
    // Map pixel values to size variants for backwards compatibility
    if (value <= 80) this.logoSize = 'xs';
    else if (value <= 120) this.logoSize = 'sm';
    else if (value <= 160) this.logoSize = 'md';
    else if (value <= 200) this.logoSize = 'lg';
    else if (value <= 280) this.logoSize = 'xl';
    else this.logoSize = 'xxl';
  }

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
