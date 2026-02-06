/**
 * @fileoverview About Page - Web App Wrapper
 * @module @nxt1/web/features/about
 * @version 1.0.0
 *
 * Thin wrapper component that imports the shared About content
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
import { AboutContentShellComponent } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [AboutContentShellComponent],
  template: `
    <div class="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 class="mb-8 text-4xl font-bold text-gray-900 dark:text-white">About NXT1 Sports</h1>

      <nxt1-about-content-shell />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'About Us',
      description:
        'Learn about NXT1 Sports - the ultimate platform connecting athletes, coaches, and recruiters. Discover our mission, values, and what we do.',
      keywords: ['about', 'mission', 'values', 'company', 'sports platform'],
    });
  }
}
