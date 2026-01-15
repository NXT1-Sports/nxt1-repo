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
      [scrollY]="false"
      [forceOverscroll]="false"
    >
      <!-- Background Effects -->
      <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <!-- Gradient Background -->
        <div
          class="from-bg-primary absolute inset-0 bg-gradient-to-b to-black opacity-100"
          [style.backgroundImage]="
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(204, 255, 0, 0.1) 0%, transparent 50%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(204, 255, 0, 0.06) 0%, transparent 40%)'
          "
        ></div>
        <!-- Glow Effect -->
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
        <div class="mb-4 w-full text-center" [style.maxWidth]="maxWidth">
          <ng-content select="[authTitle]"></ng-content>
          <ng-content select="[authSubtitle]"></ng-content>
        </div>

        <!-- Main Content Area - Single ng-content with conditional styling -->
        <div
          class="w-full"
          [style.maxWidth]="maxWidth"
          [ngClass]="{
            'bg-surface-100 border-border-subtle rounded-2xl border p-6': variant === 'card',
            'flex flex-col gap-3 p-6 bg-white/[0.02] border border-white/[0.08] rounded-2xl': variant === 'card-glass',
          }"
        >
          <ng-content></ng-content>
        </div>

        <!-- Footer Links -->
        <div class="mt-4 w-full text-center" [style.maxWidth]="maxWidth">
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
        --overflow: hidden;
        overflow: hidden;
      }

      .nxt1-auth-content::part(scroll) {
        overflow: hidden !important;
      }

      .nxt1-auth-wrapper {
        overflow: hidden;
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
