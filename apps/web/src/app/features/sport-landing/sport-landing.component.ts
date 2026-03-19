/**
 * @fileoverview Sport Landing Web Page Wrapper
 * @module apps/web/features/sport-landing
 *
 * Reads the :sport route parameter, looks up the matching config
 * from @nxt1/core, injects SEO metadata, and renders the shared
 * NxtSportLandingComponent. Redirects to /explore if the sport is unknown.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { NxtSportLandingComponent } from '../marketing/sport-landing';
import { getSportLandingConfig, type SportLandingConfig } from '@nxt1/core';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-sport-landing',
  standalone: true,
  imports: [NxtSportLandingComponent],
  template: `
    @if (config(); as c) {
      <nxt1-sport-landing [config]="c" />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportLandingComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);

  /** Resolved config (null until route resolves). */
  readonly config = signal<SportLandingConfig | null>(null);

  ngOnInit(): void {
    // Sport slug comes from route data (e.g. data: { sport: 'football' })
    // or as a :sport param — try both for flexibility.
    const slug = (
      (this.route.snapshot.data as Record<string, string>)['sport'] ??
      this.route.snapshot.paramMap.get('sport') ??
      ''
    ).toLowerCase();
    const cfg = getSportLandingConfig(slug);

    if (!cfg) {
      // Unknown sport → redirect
      this.router.navigate(['/explore'], { replaceUrl: true });
      return;
    }

    this.config.set(cfg);

    this.seo.updatePage({
      title: cfg.seoTitle,
      description: cfg.seoDescription,
      canonicalUrl: `https://nxt1sports.com/${cfg.slug}`,
      keywords: [
        `${cfg.displayName} recruiting`,
        `${cfg.displayName} athletes`,
        `${cfg.displayName} scouting`,
        'nxt1 sports',
      ],
    });
  }
}
