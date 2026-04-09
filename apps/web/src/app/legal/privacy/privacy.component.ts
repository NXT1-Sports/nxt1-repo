/**
 * @fileoverview Privacy Page - Web App
 * @module @nxt1/web/features/privacy
 * @version 1.0.0
 *
 * Embeds Termly-hosted Privacy Policy in iframe.
 * Content stays up-to-date without app redeployment.
 */

import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  AfterViewInit,
  inject,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { LEGAL_URLS } from '@nxt1/core';
import { NxtHeaderPortalService } from '@nxt1/ui/services/header-portal';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [],
  template: `
    <ng-template #headerPortalContent>
      <div class="portal-page-header">
        <span class="portal-page-title">Privacy Policy</span>
      </div>
    </ng-template>

    <div class="legal-embed-shell flex h-full w-full flex-col">
      <iframe
        [src]="termlyUrl"
        class="legal-embed-frame h-full w-full flex-1 border-0"
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
        height: 100%;
      }
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
      .legal-embed-shell {
        min-height: 0;
        background: #ffffff;
        color-scheme: light;
      }
      .legal-embed-frame {
        background: #ffffff;
        color-scheme: light;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly seo = inject(SeoService);
  private readonly headerPortal = inject(NxtHeaderPortalService);
  private readonly headerPortalContent = viewChild<TemplateRef<unknown>>('headerPortalContent');

  protected readonly termlyUrl: SafeResourceUrl;

  constructor() {
    this.termlyUrl = this.sanitizer.bypassSecurityTrustResourceUrl(LEGAL_URLS.PRIVACY);
  }

  ngAfterViewInit(): void {
    const tpl = this.headerPortalContent();
    if (tpl) this.headerPortal.setCenterContent(tpl);
  }

  ngOnDestroy(): void {
    this.headerPortal.clearAll();
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
