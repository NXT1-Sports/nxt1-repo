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
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser, Location } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { NxtLogoComponent } from '../../components/logo';
import { NxtBackButtonComponent } from '../../components/back-button';

/**
 * Shell layout variants:
 * - 'card': Contained card with solid background
 * - 'card-glass': Glassmorphic card with blur effect
 * - 'wide': Wider content area for complex forms
 * - 'minimal': Minimal styling, just content
 * - 'fullscreen': Full viewport coverage
 * - 'onboarding': Split-screen desktop layout (branding left, form right)
 */
export type AuthShellVariant =
  | 'card'
  | 'card-glass'
  | 'wide'
  | 'minimal'
  | 'fullscreen'
  | 'onboarding';

@Component({
  selector: 'nxt1-auth-shell',
  standalone: true,
  imports: [CommonModule, IonContent, NxtLogoComponent, NxtBackButtonComponent],
  template: `
    <!-- Professional Floating Back Button -->
    @if (showBackButton) {
      <div class="nxt1-floating-header">
        <nxt1-back-button
          variant="floating"
          testId="back-button"
          ariaLabel="Go back"
          (backClick)="onBackClick()"
        />
      </div>
    }

    <!-- Mobile/Capacitor: Use ion-content for native scrolling -->
    @if (isNativePlatform()) {
      <ion-content
        class="nxt1-auth-content"
        [fullscreen]="true"
        [scrollY]="true"
        [forceOverscroll]="false"
      >
        <ng-container *ngTemplateOutlet="authContentTemplate"></ng-container>
      </ion-content>
    }

    <!-- Web: Use native div scrolling for proper SSR/browser support -->
    @if (!isNativePlatform()) {
      <div class="nxt1-auth-scroll-wrapper">
        <ng-container *ngTemplateOutlet="authContentTemplate"></ng-container>
      </div>
    }

    <!-- Shared Content Template -->
    <ng-template #authContentTemplate>
      <!-- Background Effects -->
      <div class="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <!-- Gradient Background (Theme-aware CSS custom properties) -->
        <div class="auth-bg-gradient absolute inset-0"></div>
        <!-- Glow Effect (Desktop only - hidden on mobile for clean corner fades) -->
        <div
          class="auth-bg-glow absolute left-1/2 top-[-300px] hidden h-[800px] w-[800px] -translate-x-1/2 opacity-60 blur-[60px] md:block"
        ></div>
      </div>

      <!-- ============================================ -->
      <!-- UNIFIED LAYOUT STRUCTURE                    -->
      <!-- Uses CSS classes to switch between variants -->
      <!-- ng-content slots appear ONCE (required!)    -->
      <!-- ============================================ -->
      <div
        class="nxt1-auth-layout relative z-10"
        [class.nxt1-auth-layout--onboarding]="variant === 'onboarding'"
        [class.nxt1-auth-layout--default]="variant !== 'onboarding'"
        [class.nxt1-auth-wrapper--mobile-footer]="mobileFooterPadding"
      >
        <!-- Split-Screen Container (onboarding) / Single Column (default) -->
        <div class="nxt1-layout-grid" [class.nxt1-split-screen]="variant === 'onboarding'">
          <!-- ======================================== -->
          <!-- LEFT PANEL: Branding (Onboarding Only)  -->
          <!-- Hidden via CSS for non-onboarding       -->
          <!-- ======================================== -->
          <aside
            class="nxt1-branding-panel"
            [class.desktop-only]="variant === 'onboarding'"
            [hidden]="variant !== 'onboarding'"
          >
            <div class="nxt1-branding-content">
              <!-- Logo -->
              @if (showLogo && variant === 'onboarding') {
                <div class="auth-logo-wrapper nxt1-branding-logo">
                  <nxt1-logo [size]="'xl'" variant="auth" />
                </div>
              }

              <!-- Title & Subtitle (shown in branding panel on desktop onboarding) -->
              <div class="nxt1-branding-text">
                <ng-content select="[authTitle]"></ng-content>
                <ng-content select="[authSubtitle]"></ng-content>
              </div>

              <!-- Optional Hero/Marketing content -->
              <div class="nxt1-branding-hero">
                <ng-content select="[authBrandingHero]"></ng-content>
              </div>
            </div>

            <!-- Decorative elements -->
            <div class="nxt1-branding-decoration" aria-hidden="true">
              <div class="nxt1-branding-orb nxt1-branding-orb--1"></div>
              <div class="nxt1-branding-orb nxt1-branding-orb--2"></div>
            </div>
          </aside>

          <!-- ======================================== -->
          <!-- MAIN CONTENT PANEL                      -->
          <!-- Adapts to both onboarding & default     -->
          <!-- ======================================== -->
          <main
            class="nxt1-main-panel"
            [class.nxt1-form-panel]="variant === 'onboarding'"
            [class.nxt1-auth-wrapper]="variant !== 'onboarding'"
          >
            <!-- Logo (shown differently based on variant) -->
            @if (showLogo && variant !== 'onboarding') {
              <div class="auth-logo-wrapper mb-6 flex justify-center">
                <nxt1-logo [size]="logoSize" variant="auth" />
              </div>
            }

            <!-- Mobile Header for Onboarding -->
            @if (variant === 'onboarding') {
              <div class="mobile-only nxt1-mobile-header">
                @if (showLogo) {
                  <div class="auth-logo-wrapper mb-4 flex justify-center">
                    <nxt1-logo [size]="logoSize" variant="auth" />
                  </div>
                }
                <div class="nxt1-mobile-title">
                  <ng-content select="[authTitleMobile]"></ng-content>
                </div>
              </div>
            }

            <!-- Title & Subtitle (for default variants - NOT onboarding) -->
            @if (variant !== 'onboarding') {
              <div
                class="mb-4 w-full text-center"
                [style.maxWidth]="showSidePanel ? '840px' : maxWidth"
              >
                <!-- Note: Title/Subtitle already projected in branding panel -->
                <!-- For default, we show them here via CSS visibility -->
              </div>
            }

            <!-- Optional pre-content slot (outside card/glass container) -->
            @if (variant !== 'onboarding') {
              <div class="nxt1-pre-content" [style.maxWidth]="showSidePanel ? '840px' : maxWidth">
                <ng-content select="[authPreContent]"></ng-content>
              </div>
            }

            <!-- Scrollable Content Area -->
            <div
              class="nxt1-content-area"
              [class.nxt1-form-scroll-area]="variant === 'onboarding'"
              [style.maxWidth]="
                variant !== 'onboarding' ? (showSidePanel ? '840px' : maxWidth) : null
              "
              [ngClass]="{
                'bg-surface-100 border-border-subtle rounded-2xl border p-6':
                  variant === 'card' && !showSidePanel,
                'auth-card-glass': variant === 'card-glass' && !showSidePanel,
                'auth-two-column-card':
                  showSidePanel &&
                  variant !== 'onboarding' &&
                  (variant === 'card' || variant === 'card-glass'),
              }"
            >
              <!-- Form Card (onboarding) / Two-Column Layout (default) -->
              <div
                [class.nxt1-form-card]="variant === 'onboarding'"
                [class.auth-two-column]="variant !== 'onboarding'"
              >
                <!-- Primary Column: Auth Forms / Onboarding Content -->
                <div
                  [class.auth-column]="variant !== 'onboarding'"
                  [class.auth-column--primary]="variant !== 'onboarding'"
                >
                  <ng-content select="[authContent]"></ng-content>
                  <ng-content></ng-content>
                </div>

                <!-- Vertical Divider (Default variants with side panel) -->
                @if (showSidePanel && variant !== 'onboarding') {
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

              <!-- Mobile Side Panel Content (Default variants) -->
              @if (showSidePanel && variant !== 'onboarding') {
                <div class="mobile-only">
                  <ng-content select="[authSidePanelMobile]"></ng-content>
                </div>
              }
            </div>

            <!-- Footer Links -->
            <div
              class="nxt1-footer-area"
              [class.nxt1-form-footer]="variant === 'onboarding'"
              [class.mt-4]="variant !== 'onboarding'"
              [class.w-full]="variant !== 'onboarding'"
              [class.text-center]="variant !== 'onboarding'"
              [style.maxWidth]="
                variant !== 'onboarding' ? (showSidePanel ? '840px' : maxWidth) : null
              "
            >
              <ng-content select="[authFooter]"></ng-content>
            </div>
          </main>
        </div>
      </div>
    </ng-template>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100vh;
        height: 100dvh;
        position: relative;
        overflow: hidden;
      }

      /* ============================================ */
      /* NATIVE SCROLLING FOR WEB                    */
      /* Better SSR support, no ion-content issues   */
      /* ============================================ */
      .nxt1-auth-scroll-wrapper {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
        position: relative;
      }

      /* Custom scrollbar styling */
      .nxt1-auth-scroll-wrapper::-webkit-scrollbar {
        width: 8px;
      }

      .nxt1-auth-scroll-wrapper::-webkit-scrollbar-track {
        background: transparent;
      }

      .nxt1-auth-scroll-wrapper::-webkit-scrollbar-thumb {
        background: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
        border-radius: 4px;
      }

      .nxt1-auth-scroll-wrapper::-webkit-scrollbar-thumb:hover {
        background: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.18));
      }

      /* Firefox scrollbar */
      .nxt1-auth-scroll-wrapper {
        scrollbar-width: thin;
        scrollbar-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12)) transparent;
      }

      /* ============================================ */
      /* ION-CONTENT FOR MOBILE                      */
      /* Used on Capacitor/native apps only          */
      /* ============================================ */
      ion-content.nxt1-auth-content {
        --background: transparent;
      }

      /* ============================================ */
      /* PROFESSIONAL FLOATING HEADER                */
      /* No background bar, just clean button        */
      /* Fixed position to not affect content flow   */
      /* ============================================ */
      .nxt1-floating-header {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 1000;
        padding: 16px;
        padding-top: calc(16px + env(safe-area-inset-top, 0px));
        pointer-events: none;
      }

      .nxt1-floating-header nxt1-back-button {
        pointer-events: auto;
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
        padding-top: calc(env(safe-area-inset-top, 0px) + 48px);
        /* Default variant layout — top-anchored so logo stays fixed */
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        min-height: 100vh;
        min-height: 100dvh;
        padding-left: var(--nxt1-spacing-4);
        padding-right: var(--nxt1-spacing-4);
        padding-bottom: var(--nxt1-spacing-6);
        width: 100%;
      }

      @media (min-width: 768px) {
        .nxt1-auth-wrapper {
          padding-bottom: var(--nxt1-spacing-10);
        }
      }

      /* ============================================ */
      /* UNIFIED LAYOUT STRUCTURE                    */
      /* Supports both onboarding & default variants */
      /* ============================================ */

      .nxt1-auth-layout {
        width: 100%;
        min-height: 100%;
      }

      .nxt1-layout-grid {
        width: 100%;
      }

      /* Default layout: centered content */
      .nxt1-auth-layout--default .nxt1-layout-grid {
        display: flex;
        justify-content: center;
      }

      .nxt1-auth-layout--default .nxt1-branding-panel {
        display: none;
      }

      .nxt1-auth-layout--default .nxt1-main-panel {
        width: 100%;
      }

      .nxt1-auth-layout--default .nxt1-content-area {
        width: 100%;
      }

      .nxt1-pre-content {
        width: 100%;
        margin-bottom: var(--nxt1-spacing-2);
        display: flex;
        justify-content: center;
      }

      .nxt1-pre-content:empty {
        display: none;
      }

      /* Logo drop shadow for depth */
      .auth-logo-wrapper {
        filter: drop-shadow(0 4px 12px var(--nxt1-color-alpha-black30))
          drop-shadow(0 2px 4px var(--nxt1-color-alpha-black20));
      }

      /* Mobile footer padding - adds space at bottom for fixed footer */
      .nxt1-auth-wrapper--mobile-footer {
        padding-bottom: 200px;
      }

      @media (min-width: 1024px) {
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
              var(--nxt1-color-alpha-primary12) 0%,
              var(--nxt1-color-alpha-primary5) 30%,
              transparent 60%
            ),
            /* Top-right corner - subtle accent */
              radial-gradient(
                ellipse 50% 40% at 100% 0%,
                var(--nxt1-color-alpha-primary6) 0%,
                transparent 50%
              ),
            /* Bottom-right corner - primary accent fade */
              radial-gradient(
                ellipse 60% 50% at 100% 100%,
                var(--nxt1-color-alpha-primary10) 0%,
                var(--nxt1-color-alpha-primary4) 35%,
                transparent 60%
              ),
            /* Bottom-left corner - subtle accent */
              radial-gradient(
                ellipse 45% 35% at 0% 100%,
                var(--nxt1-color-alpha-primary5) 0%,
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
      /* White base to match footer design           */
      /* ============================================ */
      .auth-card-glass {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-6);
      }

      /* ============================================ */
      /* TWO-COLUMN LAYOUT (Desktop)                 */
      /* White base to match footer design           */
      /* ============================================ */
      .auth-two-column-card {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        border-radius: var(--nxt1-borderRadius-xl);
        border: 1px solid var(--nxt1-color-border-default);
        background: var(--nxt1-color-surface-100);
        padding: var(--nxt1-spacing-6);
      }

      .auth-two-column {
        display: flex;
        gap: 32px;
        align-items: stretch;
        justify-content: space-between;
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
      /* ONBOARDING SPLIT-SCREEN LAYOUT              */
      /* Desktop: 50/50 split (branding | form)      */
      /* Mobile: Single column (form only)           */
      /* 2026 Enterprise Pattern                     */
      /* ============================================ */

      .nxt1-onboarding-layout {
        width: 100%;
        min-height: 100%;
        display: flex;
        flex-direction: column;
      }

      .nxt1-split-screen {
        display: grid;
        grid-template-columns: 1fr;
        min-height: 100vh;
        min-height: 100dvh;
        width: 100%;
      }

      /* Desktop: Two-column split */
      @media (min-width: 1024px) {
        .nxt1-split-screen {
          grid-template-columns: minmax(400px, 45%) 1fr;
          gap: 0;
        }
      }

      /* Large screens: Better proportions */
      @media (min-width: 1440px) {
        .nxt1-split-screen {
          grid-template-columns: minmax(500px, 42%) 1fr;
        }
      }

      /* -------------------------------------------- */
      /* LEFT PANEL: Branding                        */
      /* -------------------------------------------- */
      .nxt1-branding-panel {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: var(--nxt1-spacing-12) var(--nxt1-spacing-8);
        background: var(--nxt1-color-bg-primary);
        overflow: hidden;
        border-right: 1px solid var(--nxt1-color-border-subtle);
      }

      .nxt1-branding-content {
        position: relative;
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--nxt1-spacing-8);
        max-width: 400px;
        text-align: center;
      }

      .nxt1-branding-logo {
        margin-bottom: var(--nxt1-spacing-4);
      }

      .nxt1-branding-text {
        display: flex;
        flex-direction: column;
        gap: var(--nxt1-spacing-3);
        min-height: 120px; /* Prevent logo shift on step transitions */
      }

      /* Override title/subtitle styles for branding panel */
      .nxt1-branding-text ::ng-deep [authTitle],
      .nxt1-branding-text ::ng-deep .nxt1-auth-title {
        font-size: var(--nxt1-fontSize-4xl);
        font-weight: 700;
        line-height: 1.1;
        margin-bottom: var(--nxt1-spacing-2);
      }

      .nxt1-branding-text ::ng-deep [authSubtitle],
      .nxt1-branding-text ::ng-deep .nxt1-auth-subtitle {
        font-size: var(--nxt1-fontSize-lg);
        color: var(--nxt1-color-text-secondary);
        max-width: 320px;
        margin: 0 auto;
      }

      .nxt1-branding-hero {
        margin-top: var(--nxt1-spacing-6);
      }

      /* Decorative orbs */
      .nxt1-branding-decoration {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .nxt1-branding-orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        opacity: 0.4;
      }

      .nxt1-branding-orb--1 {
        width: 400px;
        height: 400px;
        background: var(--nxt1-color-primary);
        top: -100px;
        left: -100px;
        animation: orb-float-1 8s ease-in-out infinite;
      }

      .nxt1-branding-orb--2 {
        width: 300px;
        height: 300px;
        background: var(--nxt1-color-primary);
        bottom: -50px;
        right: -50px;
        animation: orb-float-2 10s ease-in-out infinite;
      }

      @keyframes orb-float-1 {
        0%,
        100% {
          transform: translate(0, 0) scale(1);
          opacity: 0.3;
        }
        50% {
          transform: translate(30px, 20px) scale(1.1);
          opacity: 0.5;
        }
      }

      @keyframes orb-float-2 {
        0%,
        100% {
          transform: translate(0, 0) scale(1);
          opacity: 0.25;
        }
        50% {
          transform: translate(-20px, -30px) scale(1.15);
          opacity: 0.45;
        }
      }

      /* -------------------------------------------- */
      /* RIGHT PANEL: Form                           */
      /* -------------------------------------------- */
      .nxt1-form-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-6) var(--nxt1-spacing-4);
        background: var(--nxt1-color-surface-100);
        height: 100vh;
        height: 100dvh;
        overflow: hidden; /* Prevent panel scroll, content scrolls inside */
      }

      /* Mobile: Adjust padding for safe areas */
      @media (max-width: 1023px) {
        .nxt1-form-panel {
          padding-top: calc(env(safe-area-inset-top, 0px) + var(--nxt1-spacing-6));
          padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--nxt1-spacing-6));
          background: var(--nxt1-color-bg-primary);
          height: auto;
          min-height: 100%;
          overflow-y: visible; /* Let ion-content handle scrolling on native */
        }

        /* Mobile footer padding when applicable */
        .nxt1-onboarding-layout.nxt1-auth-wrapper--mobile-footer .nxt1-form-panel {
          padding-bottom: 200px;
        }
      }

      /* Desktop: Fixed height with internal scroll */
      @media (min-width: 1024px) {
        .nxt1-form-panel {
          padding: var(--nxt1-spacing-8) var(--nxt1-spacing-10);
          justify-content: flex-start;
        }
      }

      /* -------------------------------------------- */
      /* SCROLLABLE FORM CONTENT AREA (Desktop)      */
      /* -------------------------------------------- */
      .nxt1-form-scroll-area {
        flex: 1;
        width: 100%;
        max-width: 520px;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 0; /* Required for flex child scrolling */
      }

      @media (min-width: 1024px) {
        .nxt1-form-scroll-area {
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: var(--nxt1-spacing-2); /* Space for scrollbar */
          margin-right: calc(-1 * var(--nxt1-spacing-2)); /* Offset scrollbar space */
        }

        /* Custom scrollbar for form scroll area */
        .nxt1-form-scroll-area::-webkit-scrollbar {
          width: 6px;
        }

        .nxt1-form-scroll-area::-webkit-scrollbar-track {
          background: transparent;
        }

        .nxt1-form-scroll-area::-webkit-scrollbar-thumb {
          background: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12));
          border-radius: 3px;
        }

        .nxt1-form-scroll-area::-webkit-scrollbar-thumb:hover {
          background: var(--nxt1-color-border-strong, rgba(255, 255, 255, 0.18));
        }

        /* Firefox scrollbar */
        .nxt1-form-scroll-area {
          scrollbar-width: thin;
          scrollbar-color: var(--nxt1-color-border-default, rgba(255, 255, 255, 0.12)) transparent;
        }
      }

      .nxt1-form-card {
        width: 100%;
        max-width: 520px;
      }

      /* Desktop: Add card styling to form */
      @media (min-width: 1024px) {
        .nxt1-form-card {
          background: var(--nxt1-color-surface-100);
          border-radius: var(--nxt1-borderRadius-xl);
          /* Subtle shadow for depth without border */
          box-shadow:
            0 4px 6px -1px var(--nxt1-color-shadow),
            0 2px 4px -2px var(--nxt1-color-shadow);
          padding: var(--nxt1-spacing-8);
        }
      }

      .nxt1-form-footer {
        margin-top: var(--nxt1-spacing-4);
        padding-top: var(--nxt1-spacing-4);
        text-align: center;
        width: 100%;
        max-width: 520px;
        flex-shrink: 0; /* Never shrink - always visible */
      }

      /* -------------------------------------------- */
      /* MOBILE HEADER (visible only on mobile)      */
      /* -------------------------------------------- */
      .nxt1-mobile-header {
        width: 100%;
        max-width: 520px;
        text-align: center;
        margin-bottom: var(--nxt1-spacing-4);
      }

      .nxt1-mobile-title {
        margin-bottom: var(--nxt1-spacing-4);
        min-height: 80px; /* Prevent logo shift on step transitions */
      }

      @media (max-width: 1023px) {
        .nxt1-mobile-header {
          margin-bottom: var(--nxt1-spacing-2);
        }

        .nxt1-mobile-title {
          margin-bottom: 0;
          min-height: 0;
        }
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

      /* Default breakpoint for two-column auth layouts (768px) */
      @media (max-width: 768px) {
        .desktop-only {
          display: none !important;
        }

        .mobile-only {
          display: block;
        }
      }

      /* Onboarding uses 1024px breakpoint for split-screen */
      .nxt1-auth-layout--onboarding .desktop-only {
        display: flex;
      }

      .nxt1-auth-layout--onboarding .mobile-only {
        display: none;
      }

      @media (max-width: 1023px) {
        .nxt1-auth-layout--onboarding .desktop-only {
          display: none !important;
        }

        .nxt1-auth-layout--onboarding .mobile-only {
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

  /** Max width when showSidePanel is true (two-column layout) */
  @Input() sidePanelMaxWidth = '840px';

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

  /** Platform detection - true if running on native (iOS/Android) */
  private readonly _isNative = signal<boolean>(false);

  constructor() {
    // Detect platform (must be done in constructor for SSR safety)
    if (isPlatformBrowser(this.platformId)) {
      this._isNative.set(Capacitor.isNativePlatform());
    }
  }

  /**
   * Check if running on native platform (Capacitor iOS/Android)
   * @returns true for native apps, false for web/browser
   */
  isNativePlatform(): boolean {
    return this._isNative();
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
