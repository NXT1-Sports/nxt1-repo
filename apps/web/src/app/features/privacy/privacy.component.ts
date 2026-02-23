/**
 * @fileoverview Privacy Page - Web App Wrapper
 * @module @nxt1/web/features/privacy
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared Privacy content
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
import { PrivacyContentShellComponent } from '@nxt1/ui/legal';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [PrivacyContentShellComponent],
  template: `
    <div class="h-screen w-full">
      <nxt1-privacy-content-shell />
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
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Privacy Policy',
      description:
        'Learn how NXT1 Sports collects, uses, and protects your personal information. Review our commitment to data privacy and security.',
      keywords: ['privacy', 'policy', 'data', 'security', 'GDPR', 'CCPA'],
    });
  }
}
