/**
 * @fileoverview Athletes Persona Web Page Wrapper
 * @module apps/web/features/athletes
 *
 * Web-specific wrapper for the `/athletes` persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtAthletesLandingComponent } from '@nxt1/ui';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-athletes',
  standalone: true,
  imports: [NxtAthletesLandingComponent],
  template: `<nxt1-athletes-landing />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AthletesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'For Athletes — Build Your Recruiting Profile | NXT1',
      description:
        'Create a free recruiting profile, upload highlight reels, track analytics, and connect with college coaches. NXT1 is the #1 platform for student-athlete recruiting.',
    });
  }
}
