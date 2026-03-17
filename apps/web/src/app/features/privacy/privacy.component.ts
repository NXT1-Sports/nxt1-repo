/**
 * @fileoverview Privacy Page - Web App
 * @module @nxt1/web/features/privacy
 * @version 1.0.0
 *
 * Embeds Termly-hosted Privacy Policy in iframe.
 * Content stays up-to-date without app redeployment.
 */

import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LEGAL_URLS } from '@nxt1/core';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [],
  template: `
    <div class="flex h-screen w-full flex-col">
      <!-- Header -->
      <div class="border-b border-gray-200 bg-white px-6 py-4">
        <h1 class="text-xl font-semibold text-gray-900">Privacy Policy</h1>
      </div>

      <!-- Content -->
      <iframe
        [src]="termlyUrl"
        class="h-full w-full flex-1 border-0"
        title="Privacy Policy"
        sandbox="allow-scripts allow-same-origin"
      ></iframe>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100vh;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SeoService);

  protected readonly termlyUrl: SafeResourceUrl;

  constructor() {
    this.termlyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(LEGAL_URLS.PRIVACY);
  }

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Privacy Policy',
      description:
        'Learn how NXT1 Sports collects, uses, and protects your personal information. Review our commitment to data privacy and security.',
      keywords: ['privacy', 'policy', 'data', 'security', 'GDPR', 'CCPA'],
    });
  }
}
