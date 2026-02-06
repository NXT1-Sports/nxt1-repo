/**
 * @fileoverview Terms Content Shell Component
 * @module @nxt1/ui/legal
 * @version 1.0.0
 *
 * Shared Terms of Service content component.
 * Embeds external Termly document via iframe.
 * Platform-agnostic, reusable across web and mobile.
 *
 * ⭐ SHARED BETWEEN WEB AND MOBILE ⭐
 *
 * @example
 * ```html
 * <nxt1-terms-content-shell />
 * ```
 */

import { Component, ChangeDetectionStrategy } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LEGAL_URLS } from '@nxt1/core';

@Component({
  selector: 'nxt1-terms-content-shell',
  standalone: true,
  template: `
    <div class="terms-iframe-container">
      <iframe
        [src]="safeTermsUrl"
        class="legal-iframe"
        title="Terms of Service"
        frameborder="0"
      ></iframe>
    </div>
  `,
  styles: [
    `
      .terms-iframe-container {
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
export class TermsContentShellComponent {
  protected readonly safeTermsUrl: SafeResourceUrl;

  constructor(private sanitizer: DomSanitizer) {
    this.safeTermsUrl = this.sanitizer.bypassSecurityTrustResourceUrl(LEGAL_URLS.TERMS);
  }
}
