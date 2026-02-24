/**
 * @fileoverview Scouts Persona Web Page Wrapper
 * @module apps/web/features/scouts
 *
 * Web-specific wrapper for the `/scouts` persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtScoutsLandingComponent } from '@nxt1/ui/personas';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-scouts',
  standalone: true,
  imports: [NxtScoutsLandingComponent],
  template: `<nxt1-scouts-landing />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScoutsComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'For Scouts — Professional Scouting Tools | NXT1',
      description:
        'Evaluate athletes, build prospect lists, create scouting reports, and share evaluations with college programs. NXT1 is built for independent scouts and recruiting services.',
    });
  }
}
