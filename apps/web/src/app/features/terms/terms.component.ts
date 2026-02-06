/**
 * @fileoverview Terms Page - Web App Wrapper
 * @module @nxt1/web/features/terms
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Terms content
 * from @nxt1/ui and handles platform-specific concerns.
 *
 * ⭐ THIS IS THE RECOMMENDED PATTERN FOR SHARED COMPONENTS ⭐
 *
 * The actual content lives in @nxt1/ui (shared package).
 * This wrapper only handles:
 * - Platform-specific SEO/meta tags
 * - Web-only styling/layout adjustments
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { TermsContentShellComponent } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [TermsContentShellComponent],
  template: `
    <div class="h-screen w-full">
      <nxt1-terms-content-shell />
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
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Terms of Service',
      description:
        'Read the Terms of Service for NXT1 Sports. Understand your rights and responsibilities when using our platform.',
      keywords: ['terms', 'service', 'legal', 'agreement', 'conditions'],
    });
  }
}
