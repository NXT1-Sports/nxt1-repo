/**
 * @fileoverview NIL & Monetization Page
 * @module @nxt1/web/features/nil
 *
 * Dedicated web route for NIL monetization marketing content.
 * SSR-safe and SEO-optimized.
 */

import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { NxtNilMonetizationUpsideComponent } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';
import type { SeoConfig } from '@nxt1/core/seo';

@Component({
  selector: 'app-nil',
  standalone: true,
  imports: [NxtNilMonetizationUpsideComponent],
  template: ` <nxt1-nil-monetization-upside /> `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--nxt1-color-bg-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NilComponent implements OnInit {
  private readonly seoService = inject(SeoService);

  ngOnInit(): void {
    const seoConfig: SeoConfig = {
      page: {
        title: 'NIL & Monetization | NXT1 Sports',
        description:
          'Launch athlete sponsorship campaigns with a professional NIL workflow: sponsor intake, campaign strategy, creative production, and performance recap.',
        keywords: [
          'NIL',
          'NIL monetization',
          'name image likeness',
          'athlete sponsorship',
          'sports marketing',
          'campaign generator',
          'local sponsor campaigns',
        ],
        canonicalUrl: 'https://nxt1sports.com/nil',
        image: 'https://nxt1sports.com/assets/images/og-image.jpg',
      },
      structuredData: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'WebPage',
            name: 'NIL & Monetization',
            description: 'NXT1 campaign workflow for athlete sponsorships and NIL activation.',
            url: 'https://nxt1sports.com/nil',
          },
          {
            '@type': 'WebPageElement',
            name: 'Campaign Generator Preview',
            description:
              'Sponsor onboarding, campaign planning, creative production, and launch reporting.',
          },
        ],
      },
    };

    this.seoService.applySeoConfig(seoConfig);
  }
}
