/**
 * @fileoverview Coaches Persona Web Page Wrapper
 * @module apps/web/features/coaches
 *
 * Web-specific wrapper for the college coaches persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtCoachesLandingComponent } from '../marketing/personas';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-coaches',
  standalone: true,
  imports: [NxtCoachesLandingComponent],
  template: `<nxt1-coaches-landing />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoachesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'For College Coaches — Recruit Smarter with NXT1',
      description:
        'Search 125,000+ verified athlete profiles, watch highlights, evaluate prospects, and manage your recruiting pipeline. NXT1 is built for college and high school coaches.',
    });
  }
}
