/**
 * @fileoverview Athlete Profiles Page — Web App Wrapper
 * @module @nxt1/web/features/athlete-profiles
 * @version 1.0.0
 *
 * Root component for the `/athlete-profiles` route.
 *
 * Unlike other dual-state pages (analytics, xp, usage, manage-team),
 * this page is primarily a **public marketing/directory page**.
 * It always shows the landing page regardless of auth state.
 *
 * When authenticated, users can be directed to `/explore` for
 * the full search experience, or to `/profile/:unicode` for
 * individual athlete profiles.
 *
 * Architecture:
 * - Always renders the marketing landing page
 * - SEO-optimized with rich meta tags for search engines
 * - SSR-safe (RenderMode.Server)
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtAthleteProfilesLandingComponent } from '@nxt1/ui/athlete-profiles';
import { SeoService } from '../../core/services';

@Component({
  selector: 'app-athlete-profiles',
  standalone: true,
  imports: [NxtAthleteProfilesLandingComponent],
  template: `<nxt1-athlete-profiles-landing />`,
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
export class AthleteProfilesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'Athlete Profiles — Discover Top Recruiting Talent | NXT1',
      description:
        'Browse 42,000+ verified high school athlete profiles across 19 sports. Search by position, class year, location, GPA, and measurables. Find your next recruit on NXT1.',
      keywords: [
        'athlete profiles',
        'recruiting directory',
        'high school athletes',
        'college recruiting',
        'sports profiles',
        'athlete search',
        'find athletes',
        'recruiting database',
        'NXT1 athletes',
      ],
    });
  }
}
