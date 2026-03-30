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

import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  AfterViewInit,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { AboutContentShellComponent } from '@nxt1/ui/legal';
import { NxtHeaderPortalService } from '@nxt1/ui/services/header-portal';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [AboutContentShellComponent],
  template: `
    <ng-template #headerPortalContent>
      <div class="portal-page-header">
        <span class="portal-page-title">About</span>
      </div>
    </ng-template>

    <div class="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 class="mb-8 text-4xl font-bold text-gray-900 dark:text-white">About NXT1 Sports</h1>

      <nxt1-about-content-shell />
    </div>
  `,
  styles: [
    `
      .portal-page-header {
        display: flex;
        align-items: center;
        width: 100%;
        min-width: 0;
        padding: 0 var(--nxt1-spacing-2, 8px);
      }
      .portal-page-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--nxt1-color-text-primary, #ffffff);
        letter-spacing: -0.01em;
        white-space: nowrap;
        user-select: none;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly seo = inject(SeoService);
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly headerPortalContent = viewChild<TemplateRef<unknown>>('headerPortalContent');

  ngAfterViewInit(): void {
    const tpl = this.headerPortalContent();
    if (tpl) this.headerPortal.setCenterContent(tpl);
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
  }

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'About Us',
      description:
        'Learn about NXT1 Sports - the ultimate platform connecting athletes, coaches, and recruiters. Discover our mission, values, and what we do.',
      keywords: ['about', 'mission', 'values', 'company', 'sports platform'],
    });
  }
}
