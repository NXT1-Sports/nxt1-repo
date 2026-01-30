/**
 * @fileoverview AuthAppDownloadComponent - Cross-Platform App Download Section
 * @module @nxt1/ui/auth
 *
 * Promotional section showing QR codes for app download on desktop.
 * Shows download buttons on mobile for direct app store links.
 *
 * Features:
 * - Desktop: QR codes for App Store and Google Play
 * - Mobile: Direct download buttons
 * - SSR-safe with platform detection
 * - Professional styling matching auth design system
 * - Responsive layout with automatic mode switching
 *
 * Usage:
 * ```html
 * <nxt1-auth-app-download />
 * ```
 */

import { Component, Input, ChangeDetectionStrategy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

/** App store URLs */
const APP_STORE_URL = 'https://apps.apple.com/us/app/nxt-1/id6446410344';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.nxt1sports.app.twa';

/** QR Code generation base URL */
const QR_BASE_URL = 'https://api.qrserver.com/v1/create-qr-code/';

@Component({
  selector: 'nxt1-auth-app-download',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Desktop: QR Codes Section -->
    <div class="app-promo desktop-only" data-testid="app-download-desktop">
      <div class="app-promo-header">
        <svg class="app-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"
          />
        </svg>
        <h3>Get the NXT1 App</h3>
        <p>Scan with your phone camera</p>
      </div>

      <div class="qr-codes-row">
        <!-- iOS QR Code -->
        <div class="qr-code-item">
          <a
            [href]="appStoreUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="qr-code-wrapper"
            aria-label="Download on the App Store"
          >
            <img
              [src]="appStoreQrUrl"
              alt="Scan to download on App Store"
              loading="lazy"
              width="84"
              height="84"
            />
          </a>
          <div class="store-label">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
              />
            </svg>
            <span>App Store</span>
          </div>
        </div>

        <!-- Android QR Code -->
        <div class="qr-code-item">
          <a
            [href]="googlePlayUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="qr-code-wrapper"
            aria-label="Get it on Google Play"
          >
            <img
              [src]="googlePlayQrUrl"
              alt="Scan to download on Google Play"
              loading="lazy"
              width="84"
              height="84"
            />
          </a>
          <div class="store-label">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"
              />
            </svg>
            <span>Google Play</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile: Download Buttons -->
    @if (showMobileButtons) {
      <div class="app-download-mobile mobile-only" data-testid="app-download-mobile">
        <div class="download-divider" role="separator" aria-hidden="true">
          <span>Get the App</span>
        </div>
        <div class="app-store-buttons">
          <!-- App Store Button -->
          <a
            [href]="appStoreUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="app-store-btn ios"
            aria-label="Download on the App Store"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"
              />
            </svg>
            <div class="btn-text">
              <span class="btn-label">Download on</span>
              <span class="btn-store">App Store</span>
            </div>
          </a>

          <!-- Google Play Button -->
          <a
            [href]="googlePlayUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="app-store-btn google"
            aria-label="Get it on Google Play"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path
                d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.25-.84-.76-.84-1.35zm13.81-5.38L6.05 21.34l8.49-8.49 2.27 2.27zm3.35-4.31c.34.27.59.69.59 1.19s-.22.9-.57 1.18l-2.29 1.32-2.5-2.5 2.5-2.5 2.27 1.31zM6.05 2.66l10.76 6.22-2.27 2.27-8.49-8.49z"
              />
            </svg>
            <div class="btn-text">
              <span class="btn-label">Get it on</span>
              <span class="btn-store">Google Play</span>
            </div>
          </a>
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      /* ============================================ */
      /* DESKTOP: QR CODES SECTION                   */
      /* ============================================ */
      .app-promo {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--nxt1-spacing-6);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-xl);
        text-align: center;
        width: 100%;
        max-width: 280px;
      }

      .app-promo-header {
        margin-bottom: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .app-promo-header .app-icon {
        width: 40px;
        height: 40px;
        color: var(--nxt1-color-primary, #ccff00);
        margin-bottom: 12px;
      }

      .app-promo-header h3 {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-lg);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        margin: 0 0 var(--nxt1-spacing-1_5);
      }

      .app-promo-header p {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        margin: 0;
      }

      /* ============================================ */
      /* QR CODES                                    */
      /* ============================================ */
      .qr-codes-row {
        display: flex;
        gap: 20px;
        justify-content: center;
      }

      .qr-code-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }

      .qr-code-wrapper {
        width: 100px;
        height: 100px;
        padding: var(--nxt1-spacing-2);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-md);
        transition: all var(--nxt1-duration-normal) ease-out;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
      }

      .qr-code-wrapper:hover {
        border-color: var(--nxt1-color-primary);
        background: var(--nxt1-color-surface-200);
        box-shadow: 0 0 0 3px var(--nxt1-color-alpha-primary10);
        transform: translateY(-2px);
      }

      .qr-code-wrapper img {
        width: 84px;
        height: 84px;
        border-radius: 4px;
      }

      .store-label {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-1_5);
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-sm);
        font-weight: 600;
        color: var(--nxt1-color-text-secondary);
      }

      .store-label svg {
        width: 14px;
        height: 14px;
        color: var(--nxt1-color-text-tertiary);
      }

      /* ============================================ */
      /* MOBILE: DOWNLOAD BUTTONS                    */
      /* ============================================ */
      .app-download-mobile {
        margin-top: 24px;
      }

      .download-divider {
        display: flex;
        align-items: center;
        gap: var(--nxt1-spacing-3);
        margin-bottom: var(--nxt1-spacing-4);
      }

      .download-divider::before,
      .download-divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--nxt1-color-border-default);
      }

      .download-divider span {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 600;
        color: var(--nxt1-color-text-tertiary);
        text-transform: uppercase;
        letter-spacing: var(--nxt1-letterSpacing-wide);
        white-space: nowrap;
      }

      .app-store-buttons {
        display: flex;
        flex-direction: row;
        gap: var(--nxt1-spacing-2_5);
      }

      .app-store-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--nxt1-spacing-2_5);
        padding: var(--nxt1-spacing-3_5) var(--nxt1-spacing-3);
        background: var(--nxt1-color-surface-100);
        border: 1px solid var(--nxt1-color-border-default);
        border-radius: var(--nxt1-borderRadius-md);
        text-decoration: none;
        transition: all var(--nxt1-duration-normal) ease-out;
        -webkit-tap-highlight-color: transparent;
      }

      .app-store-btn:hover {
        border-color: var(--nxt1-color-border-strong);
        background: var(--nxt1-color-surface-200);
        transform: translateY(-1px);
      }

      .app-store-btn:active {
        transform: translateY(0);
      }

      .app-store-btn svg {
        width: 28px;
        height: 28px;
        color: var(--nxt1-color-text-primary, #ffffff);
        flex-shrink: 0;
      }

      .app-store-btn .btn-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0;
      }

      .app-store-btn .btn-label {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-xs);
        font-weight: 500;
        color: var(--nxt1-color-text-tertiary);
        line-height: 1.3;
        white-space: nowrap;
      }

      .app-store-btn .btn-store {
        font-family: var(--nxt1-fontFamily-brand);
        font-size: var(--nxt1-fontSize-base);
        font-weight: 700;
        color: var(--nxt1-color-text-primary);
        line-height: 1.2;
        white-space: nowrap;
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
export class AuthAppDownloadComponent {
  private readonly platformId = inject(PLATFORM_ID);

  /** Whether to show mobile download buttons (default: true) */
  @Input() showMobileButtons = true;

  /** App Store URL */
  readonly appStoreUrl = APP_STORE_URL;

  /** Google Play URL */
  readonly googlePlayUrl = GOOGLE_PLAY_URL;

  /** QR Code URL for App Store */
  get appStoreQrUrl(): string {
    return `${QR_BASE_URL}?size=120x120&data=${encodeURIComponent(APP_STORE_URL)}&bgcolor=0a0a0a&color=ffffff`;
  }

  /** QR Code URL for Google Play */
  get googlePlayQrUrl(): string {
    return `${QR_BASE_URL}?size=120x120&data=${encodeURIComponent(GOOGLE_PLAY_URL)}&bgcolor=0a0a0a&color=ffffff`;
  }

  /** Check if running in browser (for SSR safety) */
  get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }
}
