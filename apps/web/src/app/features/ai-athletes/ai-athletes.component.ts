/**
 * @fileoverview AI for Athletes Web Page Wrapper
 * @module apps/web/features/ai-athletes
 *
 * Web-specific wrapper for the `/ai-athletes` persona landing page.
 * Injects SEO metadata for the public marketing route.
 */

import { Component, ChangeDetectionStrategy, inject, OnInit } from '@angular/core';
import { NxtAiAthletesLandingComponent } from '../marketing/personas';
import { SeoService } from '../../core/services/seo.service';

@Component({
  selector: 'app-ai-athletes',
  standalone: true,
  imports: [NxtAiAthletesLandingComponent],
  template: `<nxt1-ai-athletes-landing />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAthletesComponent implements OnInit {
  private readonly seo = inject(SeoService);

  ngOnInit(): void {
    this.seo.updatePage({
      title: 'AI for Athletes — Your Personal ESPN Producer | NXT1',
      description:
        'NXT1 AI transforms raw game footage into viral-ready highlight reels in minutes, while automating coach outreach and recruiting workflows. Stop spending 5 hours editing and spend 5 seconds uploading.',
    });
  }
}
