/**
 * @fileoverview Privacy Content Shell Component
 * @module @nxt1/ui/legal
 * @version 1.0.0
 *
 * Shared Privacy Policy content component.
 * Embeds external Termly document via iframe.
 * Platform-agnostic, reusable across web and mobile.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-privacy-content-shell />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LEGAL_URLS } from '@nxt1/core';

@Component({
  selector: 'nxt1-privacy-content-shell',
  standalone: true,
  template: `
    <div class="privacy-iframe-container">
      <iframe
        [src]="safePrivacyUrl"
        class="legal-iframe"
        title="Privacy Policy"
        frameborder="0"
      ></iframe>
    </div>
  `,
  styles: [
    `
      .privacy-iframe-container {
        width: 100%;
        height: 100%;
        min-height: 600px;
      }

      .legal-iframe {
        width: 100%;
        height: 100%;
        min-height: 600px;
        border: none;
        display: block;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyContentShellComponent {
  protected readonly safePrivacyUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    this.safePrivacyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(LEGAL_URLS.PRIVACY);
  }
}
