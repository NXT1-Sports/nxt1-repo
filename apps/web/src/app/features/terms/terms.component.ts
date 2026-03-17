/**
 * @fileoverview Terms Page - Web App
 * @module @nxt1/web/features/terms
 * @version 1.0.0
 *
 * Embeds Termly-hosted Terms of Service in iframe.
 * Content stays up-to-date without app redeployment.
 */

import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LEGAL_URLS } from '@nxt1/core';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [],
  template: `
    <div class="flex h-screen w-full flex-col">
      <!-- Header -->
      <div class="border-b border-gray-200 bg-white px-6 py-4">
        <h1 class="text-xl font-semibold text-gray-900">Terms of Service</h1>
      </div>

      <!-- Content -->
      <iframe
        [src]="termlyUrl"
        class="h-full w-full flex-1 border-0"
        title="Terms of Service"
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
export class TermsComponent implements OnInit {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SeoService);

  protected readonly termlyUrl: SafeResourceUrl;

  constructor() {
    this.termlyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(LEGAL_URLS.TERMS);
  }

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Terms of Service',
      description:
        'Read the Terms of Service for NXT1 Sports. Understand your rights and responsibilities when using our platform.',
      keywords: ['terms', 'service', 'legal', 'agreement', 'conditions'],
    });
  }
}
